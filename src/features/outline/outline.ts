/** Outline extraction — Typora's outline panel, computed from the block state rather than
 *  by scanning raw text, so it agrees with what the editor actually shows. */

import type { AnyBlock } from '@core/types'

export interface OutlineEntry {
  id: string
  level: number
  text: string
  /** Position in the source, used for the strata gutter mapping. */
  offset: number
}

export function outlineOf(source: string): OutlineEntry[] {
  const out: OutlineEntry[] = []
  const lines = source.split('\n')

  let inFence = false
  let fenceChar = ''

  lines.forEach((line, i) => {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceChar = fence[1]![0]!
      } else if (fence[1]![0] === fenceChar) {
        inFence = false
      }
      return
    }
    if (inFence) return

    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) return
    out.push({
      id: slugify(m[2]!) + (out.length > 0 ? `-${i}` : ''),
      level: m[1]!.length,
      text: m[2]!,
      offset: lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0),
    })
  })

  return out
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

/** Blocks -> outline, for callers that already hold editor state and should not re-parse. */
export function outlineOfBlocks(blocks: AnyBlock[]): OutlineEntry[] {
  const out: OutlineEntry[] = []
  const walk = (list: AnyBlock[]) => {
    for (const b of list) {
      if (b.kind === 'heading') {
        out.push({
          id: slugify(textOf(b)),
          level: b.attrs.level,
          text: textOf(b),
          offset: 0,
        })
      }
      if (b.children) walk(b.children)
    }
  }
  walk(blocks)
  return out
}

function textOf(b: AnyBlock): string {
  return (b.spans ?? []).map((s) => s.text).join('')
}