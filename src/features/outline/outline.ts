/** Outline extraction — Typora's outline panel, computed from the block state rather than
 *  by scanning raw text, so it agrees with what the editor actually shows. */

import type { AnyBlock } from '@core/types'
import MarkdownIt from 'markdown-it'
import { displayMathSpan } from '@core/markdown/parse'
import { parseFrontMatter } from '@shared/frontMatter'

const markdown = new MarkdownIt({ html: true })

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
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }
  // Mirror the editor's preprocessing while retaining each line's original offset.
  // Blank placeholders would change Markdown block boundaries inside raw HTML.
  const { body } = parseFrontMatter(source)
  const prefix = source.slice(0, source.length - body.length)
  const firstLine = (prefix.match(/\n/g) ?? []).length
  const kept: Array<{ text: string; offset: number }> = []
  let footnote = false
  for (let i = firstLine; i < lines.length; i++) {
    const line = lines[i]
    if (/^ {0,3}\[\^[^\]\s]+\]:/.test(line)) {
      footnote = true
      continue
    }
    if (footnote && (/^(?: {4,}|\t)/.test(line) || !line.trim())) {
      continue
    }
    footnote = false
    kept.push({ text: line, offset: offsets[i] })
  }
  const prepared: typeof kept = []
  const keptLines = kept.map((line) => line.text)
  for (let i = 0; i < kept.length; i++) {
    const math = displayMathSpan(keptLines, i)
    if (math) {
      prepared.push({ text: '```math', offset: kept[i].offset })
      math.body.split('\n').forEach((text, j) => {
        prepared.push({ text, offset: kept[math.end === i ? i : i + 1 + j].offset })
      })
      prepared.push({ text: '```', offset: kept[math.end].offset })
      i = math.end
    } else {
      prepared.push(kept[i])
    }
  }
  const tokens = markdown.parse(prepared.map((line) => line.text).join('\n'), {})
  tokens.forEach((token, i) => {
    if (token.type !== 'heading_open' || !token.map) return
    const inline = tokens[i + 1]
    const text = (inline?.children ?? []).map((child) =>
      child.type === 'softbreak' || child.type === 'hardbreak' ? ' ' :
        ['text', 'code_inline', 'image'].includes(child.type) ? child.content : '',
    ).join('')
    const offset = prepared[token.map[0]].offset
    out.push({
      id: `heading-${offset}`,
      level: Number(token.tag.slice(1)),
      text,
      offset,
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
