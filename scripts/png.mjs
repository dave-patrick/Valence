/**
 * Minimal PNG decode/encode.
 *
 * Node has no image library in this project, and the icon pipeline needs three things
 * `System.Drawing` does badly: reading the alpha channel, writing a mask with exact
 * 8-bit coverage, and doing it in CI without a GUI stack.
 *
 * Scope is deliberately narrow: 8-bit truecolour with or without alpha, non-interlaced.
 * That covers what the icon source is and nothing else.
 *
 *   decode(buffer) -> { width, height, data }   // data is RGBA, 4 bytes per pixel
 *   encode({ width, height, data }) -> Buffer
 */

import { deflateSync, inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** CRC table, built once. Used for every chunk we write. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

/**
 * Reverse the per-scanline PNG filters, producing raw samples.
 *
 * @param {Buffer} raw inflated IDAT data
 * @param {number} bpp bytes per pixel (3 for RGB, 4 for RGBA)
 * @param {number} width
 * @param {number} height
 * @returns {Buffer} unfiltered samples
 */
function unfilter(raw, bpp, width, height) {
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const type = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null

    for (let i = 0; i < stride; i++) {
      const x = line[i]
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      let v
      switch (type) {
        case 0:
          v = x
          break
        case 1:
          v = x + a
          break
        case 2:
          v = x + b
          break
        case 3:
          v = x + ((a + b) >> 1)
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          v = x + pred
          break
        }
        default:
          throw new Error(`unsupported PNG filter type ${type} on row ${y}`)
      }
      cur[i] = v & 0xff
    }
  }
  return out
}

/**
 * Decode a PNG into RGBA samples.
 *
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number, data: Buffer }}
 */
export function decode(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG')

  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let palette = null
  let transparency = null
  const idat = []

  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') {
      palette = data
    } else if (type === 'tRNS') {
      transparency = data
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`)
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported')

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`unsupported colour type ${colorType}`)

  const raw = unfilter(inflateSync(Buffer.concat(idat)), channels, width, height)
  const data = Buffer.alloc(width * height * 4)

  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const d = i * 4
    if (colorType === 6) {
      data[d] = raw[s]
      data[d + 1] = raw[s + 1]
      data[d + 2] = raw[s + 2]
      data[d + 3] = raw[s + 3]
    } else if (colorType === 2) {
      data[d] = raw[s]
      data[d + 1] = raw[s + 1]
      data[d + 2] = raw[s + 2]
      data[d + 3] = 255
    } else if (colorType === 0) {
      data[d] = data[d + 1] = data[d + 2] = raw[s]
      data[d + 3] = 255
    } else if (colorType === 4) {
      data[d] = data[d + 1] = data[d + 2] = raw[s]
      data[d + 3] = raw[s + 1]
    } else if (colorType === 3) {
      const idx = raw[s]
      data[d] = palette[idx * 3]
      data[d + 1] = palette[idx * 3 + 1]
      data[d + 2] = palette[idx * 3 + 2]
      data[d + 3] = transparency && idx < transparency.length ? transparency[idx] : 255
    }
  }

  return { width, height, data }
}

/**
 * Encode RGBA samples as a PNG.
 *
 * @param {{ width: number, height: number, data: Buffer }} image
 * @returns {Buffer}
 */
export function encode({ width, height, data }) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
