/**
 * Markdown -> block state.
 *
 * Pure. No DOM, no Node. Two pure functions are the only bridge between markdown text and
 * editor state; because they are pure we can fuzz `parse -> serialise` against the CommonMark
 * and GFM suites, which is the test that would have caught the mode-switch data loss in both
 * reference apps.
 *
 * Structure follows markdown-it's own token stream rather than a second hand-written parser.
 * Three constructs markdown-it does not provide a rule for — display math, footnotes, and
 * inline math — are handled by small pre-passes that rewrite the input into shapes the
 * existing rules already understand.
 */

import MarkdownIt from 'markdown-it'
import type { MarkdownIt as MarkdownItInstance, Token } from 'markdown-it'
import { parseFrontMatter } from '../../shared/frontMatter'
import type { AnyBlock, InlineMark, InlineSpan, ParsedDocument } from '../types'
import { renderInline } from './inline'
import { parseWikiLinkBody } from '@core/wiki'

type Align = 'left' | 'center' | 'right' | null

/** Diagram languages recognised as fenced blocks. */
const DIAGRAM_LANG = /^(mermaid|vega|vega-lite|plantuml|graphviz|abc|ditaa|svgbob|wavedrom)$/i

export interface ParseOptions {
  /** Enable GFM (tables, strikethrough, task lists, autolinks). Default true. */
  gfm?: boolean
  /** Enable typographic replacements. Default false — it breaks round-trips. */
  typographer?: boolean
  /** Resolve bare URLs into links. Default true. */
  linkify?: boolean
  /** Allow raw HTML passthrough. Default true — CommonMark requires it. */
  html?: boolean
}

const DEFAULTS: Required<ParseOptions> = {
  gfm: true,
  typographer: false,
  linkify: true,
  html: true,
}

export function parseMarkdown(source: string, options: ParseOptions = {}): ParsedDocument {
  const opts = { ...DEFAULTS, ...options }

  const { data, body: afterFrontMatter } = parseFrontMatter(source)
  const { body: afterFootnotes, defs } = liftFootnotes(afterFrontMatter)
  const { body } = liftDisplayMath(afterFootnotes)

  const md = new MarkdownIt({
    html: opts.html,
    linkify: opts.linkify,
    typographer: opts.typographer,
  })

  // Inline math. `$$…$$` was already lifted to a block fence by `liftDisplayMath`, so a
  // single `$` pair here is unambiguously inline math.
  md.inline.ruler.before('emphasis', 'math_inline', (state, silent) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false
    // `$$` belongs to display math, not this rule.
    if (state.src.charCodeAt(start + 1) === 0x24) return false
    if (state.src.charCodeAt(start - 1) === 0x5c /* \ */) return false

    const end = findClosingDollar(state.src, start + 1)
    if (end === -1) return false

    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.content = state.src.slice(start + 1, end)
    }
    state.pos = end + 1
    return true
  })

  // Wiki links: `[[Note]]`, `[[Note|alias]]`, `[[Note#Section]]`.
  //
  // Registered before `emphasis` so the brackets are consumed as one token. markdown-it only
  // offers this rule on `text` tokens, which is what keeps `[[…]]` inside a code span or a
  // fenced block literal — that falls out of the tokenizer rather than being checked here.
  md.inline.ruler.before('emphasis', 'wikilink', (state, silent) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false
    if (state.src.charCodeAt(start + 1) !== 0x5b) return false
    if (state.src.charCodeAt(start - 1) === 0x5c /* \ */) return false

    const close = state.src.indexOf(']]', start + 2)
    if (close === -1) return false

    const body = state.src.slice(start + 2, close)
    // A newline inside means this is not a link — it is prose that happens to contain
    // brackets, and swallowing it would delete the user's text.
    if (body.includes('\n')) return false

    const parsed = parseWikiLinkBody(body)
    if (!parsed) return false

    if (!silent) {
      const token = state.push('wikilink', '', 0)
      token.content = parsed.display
      token.attrSet('target', parsed.target)
      if (parsed.alias) token.attrSet('alias', parsed.alias)
      if (parsed.heading) token.attrSet('heading', parsed.heading)
    }
    state.pos = close + 2
    return true
  })

  // Footnote references. Definitions are handled by `liftFootnotes`.
  md.inline.ruler.before('emphasis', 'footnote_ref', (state, silent) => {
    const start = state.pos
    if (
      state.src.charCodeAt(start) !== 0x5b /* [ */ ||
      state.src.charCodeAt(start + 1) !== 0x5e /* ^ */
    ) {
      return false
    }
    const end = state.src.indexOf(']', start + 2)
    if (end === -1 || state.src.charCodeAt(end + 1) !== 0x5d /* ] */) return false

    const id = state.src.slice(start + 2, end)
    if (!id || /\s/.test(id)) return false

    if (!silent) {
      const token = state.push('footnote_ref', '', 0)
      token.meta = { id }
      token.content = id
    }
    state.pos = end + 2
    return true
  })

  const tokens = md.parse(body, {})

  const blocks: AnyBlock[] = []
  let i = 0
  while (i < tokens.length) {
    i += Math.max(1, convertToken(md, tokens, i, blocks))
  }

  // Footnote definitions become real blocks at the end, in document order, so they are
  // editable in the tree rather than hidden in an env bag.
  for (const def of defs) {
    blocks.push({
      kind: 'footnote',
      attrs: { id: def.id, label: def.label },
      children: def.children,
    })
  }

  if (!blocks.length && !body.trim()) {
    blocks.push({ kind: 'paragraph', attrs: {}, spans: [] })
  }

  return { frontMatter: data, blocks }
}

/* ──────────────────────────────────────────────────────────────
 * Token conversion
 * ──────────────────────────────────────────────────────────────*/

/**
 * Converts tokens from `i`, pushing blocks into `out`, and returns how many were consumed.
 * The count is the loop's only termination condition, so an off-by-one here silently drops
 * every other block of its kind — the reason this is expressed as `closeIdx - i + 1`
 * (the open token, the inline token, and the close token) rather than by eyeballing.
 */
function convertToken(md: MarkdownItInstance, tokens: Token[], i: number, out: AnyBlock[]): number {
  const token = tokens[i]!
  const { type } = token

  switch (type) {
    case 'paragraph_open': {
      const close = findClose(tokens, i, 'paragraph')
      const inline = tokens[i + 1]
      out.push({ kind: 'paragraph', attrs: {}, spans: inline ? renderInline(inline, md) : [] })
      return close - i + 1
    }

    case 'heading_open': {
      const close = findClose(tokens, i, 'heading')
      const inline = tokens[i + 1]
      const level = clampLevel(Number(token.tag.slice(1)))
      out.push({
        kind: 'heading',
        attrs: { level, setext: token.markup === '=' || token.markup === '-' },
        spans: inline ? renderInline(inline, md) : [],
      })
      return close - i + 1
    }

    case 'hr':
      out.push({ kind: 'thematic_break', attrs: {}, spans: [] })
      return 1

    case 'blockquote_open': {
      const close = findClose(tokens, i, 'blockquote')
      const inner = childBlocks(md, tokens, i + 1, close)
      out.push({ kind: 'blockquote', attrs: {}, children: inner })
      return close - i + 1
    }

    case 'bullet_list_open':
    case 'ordered_list_open': {
      const ordered = type === 'ordered_list_open'
      const close = findClose(tokens, i, ordered ? 'ordered_list' : 'bullet_list')
      const items = listItems(md, tokens, i + 1, close)
      out.push(
        ordered
          ? { kind: 'ordered_list', attrs: { start: Number(token.attrGet('start')) || 1, tight: isTight(token) }, children: items }
          : { kind: 'bullet_list', attrs: { tight: isTight(token) }, children: items },
      )
      return close - i + 1
    }

    case 'fence':
    case 'code_block': {
      const info = (token.info || '').trim()
      const [lang = '', ...meta] = info.split(/\s+/)
      const body = token.content.replace(/\n$/, '')

      if (lang === 'math' || lang === 'latex' || token.markup === '$$') {
        out.push({
          kind: 'math_block',
          attrs: { display: true },
          spans: [{ text: body, marks: [] }],
        })
        return 1
      }

      if (DIAGRAM_LANG.test(lang)) {
        out.push({ kind: 'diagram', attrs: { kind: lang.toLowerCase() }, spans: [{ text: body, marks: [] }] })
        return 1
      }

      out.push({
        kind: 'code_block',
        attrs: {
          lang,
          fenceChar: token.markup === '~' ? '~' : '`',
          meta: meta.length ? meta.join(' ') : undefined,
        },
        spans: [{ text: body, marks: [] }],
      })
      return 1
    }

    case 'table_open': {
      const close = findClose(tokens, i, 'table')
      const { alignments, rows } = tableBlocks(md, tokens, i + 1, close)
      out.push({ kind: 'table', attrs: { alignments, header: true }, children: rows })
      return close - i + 1
    }

    case 'html_block':
      out.push({ kind: 'html_block', attrs: {}, spans: [{ text: token.content.replace(/\n$/, ''), marks: [] }] })
      return 1

    case 'footnote_ref': {
      // Inline refs surface as a zero-width span on their block; definitions are lifted
      // separately by `liftFootnotes`.
      const id = typeof token.meta?.id === 'string' ? token.meta.id : token.content
      if (!id) return 1
      out.push({ kind: 'paragraph', attrs: {}, spans: [{ text: '', marks: [{ type: 'footnote_ref', id }] }] })
      return 1
    }

    default:
      return 1
  }
}

/** Converts tokens in `[from, to)`, which are the children of an already-opened container. */
function childBlocks(md: MarkdownItInstance, tokens: Token[], from: number, to: number): AnyBlock[] {
  const out: AnyBlock[] = []
  let i = from
  while (i < to) i += Math.max(1, convertToken(md, tokens, i, out))
  return out
}

function listItems(
  md: MarkdownItInstance,
  tokens: Token[],
  from: number,
  to: number,
): AnyBlock[] {
  const items: AnyBlock[] = []
  let index = 0
  let i = from

  while (i < to) {
    if (tokens[i]!.type !== 'list_item_open') {
      i++
      continue
    }
    const close = findClose(tokens, i, 'list_item')
    const inner = childBlocks(md, tokens, i + 1, close)
    const first = inner[0]
    const isTask = !!first && first.kind === 'paragraph' && leadingTaskMarker(first.spans ?? [])

    if (isTask && first?.kind === 'paragraph') {
      const stripped = stripTaskMarker(first.spans!)
      items.push({
        kind: 'task_item',
        attrs: { checked: stripped.checked, index },
        children: [{ kind: 'paragraph', attrs: {}, spans: stripped.spans }, ...inner.slice(1)],
      })
    } else {
      items.push({
        kind: 'list_item',
        attrs: { index, checked: null },
        children: inner.length ? inner : [{ kind: 'paragraph', attrs: {}, spans: [] }],
      })
    }
    index++
    i = close + 1
  }

  return items
}

/**
 * markdown-it's GFM rule emits `table_open/thead/tr/th` block tokens with alignment already
 * encoded as `text-align` on the cell. We consume that stream directly rather than
 * re-deriving it from raw delimiter lines — fewer moving parts, and the alignment we emit is
 * the alignment markdown-it computed.
 */
function tableBlocks(
  md: MarkdownItInstance,
  tokens: Token[],
  from: number,
  to: number,
): { alignments: Align[]; rows: AnyBlock[] } {
  const alignments: Align[] = []
  const rows: AnyBlock[] = []
  let header = true
  let i = from

  while (i < to) {
    const t = tokens[i]!
    if (t.type === 'thead_close') header = true
    else if (t.type === 'tbody_open' || t.type === 'tbody_close') header = false

    if (t.type !== 'tr_open') {
      i++
      continue
    }

    const rowClose = findClose(tokens, i, 'tr')
    const cells: AnyBlock[] = []
    let c = i + 1
    while (c < rowClose) {
      const cell = tokens[c]!
      if (cell.type === 'th_open' || cell.type === 'td_open') {
        const inline = tokens[c + 1]
        const align = alignFromStyle(String(cell.attrGet('style') ?? ''))
        if (header) alignments.push(align)
        cells.push({
          kind: 'table_cell',
          attrs: { align: align ?? alignments[cells.length] ?? null, header },
          spans: inline ? renderInline(inline, md) : [],
        })
        c += 3
      } else {
        c++
      }
    }
    rows.push({ kind: 'table_row', attrs: {}, children: cells })
    i = rowClose + 1
  }

  return { alignments, rows }
}

function alignFromStyle(style: string): Align {
  if (/text-align:\s*center/.test(style)) return 'center'
  if (/text-align:\s*right/.test(style)) return 'right'
  if (/text-align:\s*left/.test(style)) return 'left'
  return null
}

/** A list is tight unless any of its items span more than one block. */
function isTight(token: Token): boolean {
  return token.attrGet('tight') !== 'false'
}

function findClose(tokens: Token[], from: number, name: string): number {
  let depth = 0
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.type === `${name}_open`) depth++
    else if (t.type === `${name}_close`) {
      depth--
      if (depth === 0) return i
    }
  }
  return tokens.length - 1
}

function clampLevel(n: number): 1 | 2 | 3 | 4 | 5 | 6 {
  return (n >= 1 && n <= 6 ? n : 1) as 1 | 2 | 3 | 4 | 5 | 6
}

/** Finds the closing `$` of an inline formula, skipping escaped dollars. */
function findClosingDollar(src: string, from: number): number {
  for (let i = from; i < src.length; i++) {
    if (src[i] !== '$') continue
    if (src[i - 1] === '\\') continue
    // A dollar followed by a space is a closing delimiter only if something precedes it.
    if (src[i + 1] === ' ' || src[i + 1] === undefined) continue
    return i
  }
  return -1
}

/* ──────────────────────────────────────────────────────────────
 * Display math pre-pass
 *
 * markdown-it has no block rule for `$$ … $$`, so a display formula arrives as an ordinary
 * paragraph and serialises back as literal dollar signs. Rather than write a second block
 * parser, display math is rewritten into a fenced ```math block — the fence path above
 * already knows how to build a `math_block`, so this adds one case instead of a duplicate
 * implementation.
 * ──────────────────────────────────────────────────────────────*/

interface DisplayMathSpan {
  /** Index of the closing delimiter line. */
  end: number
  body: string
}

/**
 * Recognises `$$` as a delimiter on its own line, or `$$ x $$` entirely on one line.
 * Returns null for an unterminated `$$` so a stray dollar sign stays literal text rather
 * than swallowing the rest of the document.
 */
function displayMathSpan(lines: string[], i: number): DisplayMathSpan | null {
  const trimmed = (lines[i] ?? '').trim()

  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
    return { end: i, body: trimmed.slice(2, -2).trim() }
  }
  if (trimmed !== '$$') return null

  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j]!.trim()
    if (t === '$$') return { end: j, body: lines.slice(i + 1, j).join('\n') }
    // A blank line followed by prose means the author never closed the block.
    if (t === '' && j + 1 < lines.length && !lines[j + 1]!.trim().startsWith('$$')) return null
  }
  return null
}

function liftDisplayMath(body: string): { body: string } {
  const lines = body.split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const span = displayMathSpan(lines, i)
    if (!span) {
      out.push(lines[i]!)
      continue
    }
    out.push('```math', span.body, '```')
    i = span.end
  }

  return { body: out.join('\n') }
}

/* ──────────────────────────────────────────────────────────────
 * Footnote pre-pass
 * ──────────────────────────────────────────────────────────────*/

const FN_DEF_RE = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/
const FN_CONT_RE = /^(?: {4,}|\t)(.*)$/

export interface FootnoteDef {
  id: string
  label: string
  children: AnyBlock[]
}

function liftFootnotes(body: string): { body: string; defs: FootnoteDef[] } {
  const lines = body.split('\n')
  const kept: string[] = []
  const defs: FootnoteDef[] = []
  let current: { id: string; lines: string[] } | null = null

  const flush = () => {
    if (!current) return
    const text = current.lines.join('\n').trim()
    defs.push({
      id: current.id,
      label: current.id,
      children: text ? parseMarkdown(text).blocks : [],
    })
    current = null
  }

  for (const line of lines) {
    const def = FN_DEF_RE.exec(line)
    if (def) {
      flush()
      current = { id: def[1]!, lines: [def[2]!] }
      continue
    }
    if (current) {
      const cont = FN_CONT_RE.exec(line)
      if (cont) {
        current.lines.push(cont[1]!)
        continue
      }
      if (line.trim() === '') {
        current.lines.push('')
        continue
      }
      flush()
    }
    kept.push(line)
  }
  flush()

  return { body: kept.join('\n'), defs }
}

/* ──────────────────────────────────────────────────────────────
 * Task list markers
 * ──────────────────────────────────────────────────────────────*/

function leadingTaskMarker(spans: InlineSpan[]): boolean {
  return spans.length === 1 && /^\[([ xX])\]\s+/.test(spans[0]!.text)
}

function stripTaskMarker(spans: InlineSpan[]): { checked: boolean; spans: InlineSpan[] } {
  const first = spans[0]!
  const m = /^\[([ xX])\]\s+/.exec(first.text)!
  return {
    checked: m[1]!.toLowerCase() === 'x',
    spans: [{ ...first, text: first.text.slice(m[0].length) }],
  }
}

export type { InlineMark }