/**
 * Icon build.
 *
 *   node scripts/make-icon.mjs
 *
 * The source art (`resources/icon_dark.png`) is a rounded-rectangle app icon sitting on a
 * plain page, with a lot of empty page above and below it. Windows wants a square bitmap
 * with transparent surroundings, not a near-white rectangle with an icon drawn on it.
 *
 * The naive fix -- "replace white with transparent" -- produces speckle. Two reasons:
 *
 *   1. The icon's edge is anti-aliased, so the boundary pixels are *blends* of the dark
 *      tile and the page, and none of them are exactly white. Only the ones that happen
 *      to land on 255,255,255 get cleared, which leaves a fringe of near-white pixels.
 *   2. The page is not pure white. It measures 253-255 with noise, and the icon casts a
 *      soft shadow onto it, so a hard "is it white" test strands a halo of shadow.
 *
 * So the alpha is reconstructed rather than thresholded. For a pixel that is the icon
 * colour `C` painted over the page with coverage `a`:
 *
 *     observed = a*C + (1-a)*page
 *
 * Every channel is the same blend of `C` and the page, so the minimum channel gives `a`
 * directly once `C` is known, and `C` falls out of the same equation. `C` is taken from
 * the nearest solidly-covered pixel, which for a rounded rectangle is the tile itself.
 *
 * This works for any shape, so it does not care that the art happens to be a squircle.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode, encode } from './png.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'resources', 'icon_dark.png')
const OUTPUT = join(ROOT, 'resources', 'icon.png')

/**
 * A pixel at or above this on every channel counts as page.
 *
 * The page measures 253-255 and the shadow halo runs down to roughly 240, so the
 * threshold sits above the halo to let it flood away. The icon's own lightest feature --
 * the specular band along the top of the tile -- is around 248, so this also trims a
 * sliver off the top rim, which is the correct trade: a clean edge beats a preserved
 * gradient on a 16px taskbar tile.
 */
const PAGE_THRESHOLD = 246

/** A pixel at or below this on its minimum channel is solidly covered by the icon. */
const SOLID_THRESHOLD = 200

/** How far to look for a solid reference before giving up on a pixel. */
const REFERENCE_RADIUS = 12

const SIDE = 1024

function main() {
  const source = decode(readFileSync(SOURCE))
  console.log(`source: ${source.width}x${source.height}`)

  const { width, height, data } = source
  const pixels = width * height
  const min = new Uint8Array(pixels)

  for (let i = 0; i < pixels; i++) {
    const o = i * 4
    min[i] = Math.min(data[o], data[o + 1], data[o + 2])
  }

  // ── 1. Flood the page from the border ────────────────────────────────
  //
  // "Connected to the edge and near-page" is page. Connectivity is what makes this safe:
  // the icon has light pixels of its own that must not be erased, and they are
  // surrounded by dark tile rather than touching the border.

  const page = new Uint8Array(pixels)
  const stack = []

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = y * width + x
    if (page[i]) return
    if (min[i] < PAGE_THRESHOLD) return
    page[i] = 1
    stack.push(i)
  }

  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }

  while (stack.length) {
    const i = stack.pop()
    const x = i % width
    const y = (i - x) / width
    push(x - 1, y)
    push(x + 1, y)
    push(x, y - 1)
    push(x, y + 1)
  }

  // ── 2. Reconstruct coverage ──────────────────────────────────────────
  //
  // Solid pixels are fully covered. Everything else that is not page is either a
  // partially-covered edge pixel or shadow, and its coverage follows from the blend
  // equation using the nearest solid pixel as the reference colour.

  const out = Buffer.alloc(pixels * 4)
  let band = 0
  let unresolved = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const o = i * 4

      if (page[i]) {
        out[o] = 0
        out[o + 1] = 0
        out[o + 2] = 0
        out[o + 3] = 0
        continue
      }

      let alpha = 1

      if (min[i] > SOLID_THRESHOLD) {
        // Not solidly covered. Find the nearest solid pixel to measure against.
        let ref = -1
        search: for (let r = 1; r <= REFERENCE_RADIUS && ref < 0; r++) {
          for (let dy = -r; dy <= r; dy++) {
            const ny = y + dy
            if (ny < 0 || ny >= height) continue
            for (let dx = -r; dx <= r; dx++) {
              // Only the ring at exactly radius r needs testing.
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
              const nx = x + dx
              if (nx < 0 || nx >= width) continue
              const j = ny * width + nx
              if (page[j]) continue
              if (min[j] <= SOLID_THRESHOLD) {
                ref = min[j]
                break search
              }
            }
          }
        }

        if (ref < 0) {
          // No solid pixel nearby, so this is shadow far from the shape. It carries no
          // icon colour and should not be part of the icon at all.
          unresolved++
          alpha = 0
        } else {
          alpha = (255 - min[i]) / (255 - ref)
          if (alpha < 0) alpha = 0
          if (alpha > 1) alpha = 1
          band++
        }
      }

      const a = alpha
      out[o + 3] = Math.round(a * 255)

      if (a <= 0) {
        out[o] = 0
        out[o + 1] = 0
        out[o + 2] = 0
        continue
      }

      // Undo the blend so edge pixels carry the icon's own colour rather than a tint of
      // the page. Without this the shape keeps a pale rim.
      for (let c = 0; c < 3; c++) {
        const v = (data[o + c] - 255 * (1 - a)) / a
        out[o + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
      }
    }
  }

  console.log(`edge pixels reconstructed: ${band}, shadow dropped: ${unresolved}`)

  // ── 3. Crop to the artwork ───────────────────────────────────────────

  let minX = width
  let maxX = -1
  let minY = height
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (out[(y * width + x) * 4 + 3] >= 40) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) throw new Error('no artwork found -- the page flood covered everything')

  const artW = maxX - minX + 1
  const artH = maxY - minY + 1
  console.log(`artwork: ${artW}x${artH} at (${minX},${minY})`)

  // ── 4. Fit onto a square canvas ──────────────────────────────────────
  //
  // Windows icons are square. The artwork is not, so it is scaled to fit with a little
  // breathing room and centred. Scaling up is avoided where possible: a 1024px icon
  // built from an 881px source will be soft, so the largest axis is used directly and
  // the artwork is centred on the other.

  const scale = Math.min(1, (SIDE * 0.94) / Math.max(artW, artH))
  const drawW = Math.max(1, Math.round(artW * scale))
  const drawH = Math.max(1, Math.round(artH * scale))
  const offsetX = Math.floor((SIDE - drawW) / 2)
  const offsetY = Math.floor((SIDE - drawH) / 2)

  const canvas = Buffer.alloc(SIDE * SIDE * 4)

  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const sx = minX + Math.floor((x * artW) / drawW)
      const sy = minY + Math.floor((y * artH) / drawH)
      const s = (sy * width + sx) * 4
      const d = ((offsetY + y) * SIDE + (offsetX + x)) * 4
      canvas[d] = out[s]
      canvas[d + 1] = out[s + 1]
      canvas[d + 2] = out[s + 2]
      canvas[d + 3] = out[s + 3]
    }
  }

  writeFileSync(OUTPUT, encode({ width: SIDE, height: SIDE, data: canvas }))
  console.log(`wrote ${OUTPUT} (${SIDE}x${SIDE})`)
}

main()
