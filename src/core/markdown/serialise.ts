/**
 * Block state -> markdown.
 *
 * Pure, and the exact inverse of `parseMarkdown`. `parse -> serialise` must be idempotent
 * over the CommonMark and GFM suites; that property is the CI gate. It is the single most
 * valuable test in the project, because round-trip loss is what silently eats users' work
 * in every editor that converts between source and view on demand.
 */

import type { AnyBlock, BlockState, InlineMark, InlineSpan, SerialisedDocument } from '../types'
import { stringifyFrontMatter } from '../../shared/frontMatter'

export interface SerialiseOptions {
  /** Keep an unresolved `front_matter` block in the output. Default true. */
  includeFrontMatter?: boolean
}

export function serialiseMarkdown(
  frontMatter: string | null,
  blocks: AnyBlock[],
  options: SerialiseOptions = {},
): SerialisedDocument {
  const lossy: string[] = []
  const body = blocks.map((b) => block(b, lossy)).filter((s) => s !== null)

  let text = ''
  if (frontMatter && options.includeFrontMatter !== false) {
    text += stringifyFrontMatter(frontMatter)
  }
  text += body.join('\n\n')
  if (text.length && !text.endsWith('\n')) text += '\n'

  return { text, lossy }
}

/* ──────────────────────────────────────────────────────────────
 * Blocks
 * ──────────────────────────────────────────────────────────────*/

function block(b: AnyBlock, lossy: string[]): string | null {
  switch (b.kind) {
    case 'paragraph':
      return spans(b.spans ?? []) || null

    case 'heading': {
      const { level, setext } = b.attrs
      const text = spans(b.spans ?? [])
      // Setext headings are preserved rather than normalised to ATX — rewriting a user's
      // heading style is an unrequested edit, and it breaks `parse -> serialise` identity.
      if (setext && (level === 1 || level === 2)) {
        const rule = level === 1 ? '=' : '-'
        return `${text}\n${rule.repeat(Math.max(3, text.length))}`
      }
      return `${'#'.repeat(level)} ${text}`
    }

    case 'thematic_break':
      return '---'

    case 'code_block': {
      const { lang, fenceChar = '`', meta } = b.attrs
      const body = (b.spans?.[0]?.text ?? '').replace(/\n$/, '')
      // Widen the fence if the body contains one, so the block cannot close itself.
      const runs = body.match(new RegExp(`^${fenceChar}{3,}`, 'gm')) ?? []
      const widest = runs.reduce((max, r) => Math.max(max, r.length), 2)
      const fence = fenceChar.repeat(widest + 1)
      const info = [lang, meta].filter(Boolean).join(' ')
      return `${fence}${info}\n${body}\n${fence}`
    }

    case 'math_block':
      return `$$\n${(b.spans?.[0]?.text ?? '').trim()}\n$$`

    case 'diagram': {
      const { kind } = b.attrs
      const body = b.spans?.[0]?.text ?? ''
      if (kind === 'mermaid') return `\`\`\`mermaid\n${body.replace(/\n$/, '')}\n\`\`\``
      if (kind === 'plantuml') return `\`\`\`plantuml\n${body.replace(/\n$/, '')}\n\`\`\``
      lossy.push(`diagram:${kind}`)
      return `\`\`\`${kind}\n${body.replace(/\n$/, '')}\n\`\`\``
    }

    case 'html_block':
      return (b.spans?.[0]?.text ?? '').replace(/\n$/, '')

    case 'blockquote': {
      const inner = children(b, lossy)
      return indent(inner, '> ')
    }

    case 'bullet_list':
    case 'ordered_list': {
      const loose = !(b.attrs as { tight: boolean }).tight
      const start = b.kind === 'ordered_list' ? (b.attrs as { start: number }).start : 1
      const items = (b.children ?? []).map((item, i) => {
        const marker = b.kind === 'ordered_list' ? `${start + i}. ` : '- '
        const inner = itemChildren(item, lossy)
        // Continuation lines need the marker's own width of indentation, or every nested
        // block escapes its item and reparses as a sibling of the list.
        return indent(inner, ' '.repeat(marker.length), marker, loose)
      })
      return items.join(loose ? '\n\n' : '\n')
    }

    case 'list_item': {
      lossy.push('orphan:list_item')
      return children(b, lossy)
    }

    case 'task_item': {
      const { checked } = b.attrs
      const kids = b.children ?? []
      const [first, ...rest] = kids
      const head = first?.kind === 'paragraph' ? spans(first.spans ?? []) : ''
      const tail = rest.map((k) => children(k, lossy)).filter(Boolean)
      const body = [head, ...tail].filter(Boolean).join('\n\n')
      const box = checked ? '[x] ' : '[ ] '
      return indent(body ? box + body : box, '', '- ', false)
    }

    case 'table': {
      const { alignments } = b.attrs
      const rows = b.children ?? []
      if (!rows.length) {
        lossy.push('empty:table')
        return ''
      }
      const cells = rows.map((row) => {
        const rowCells = (row.children ?? []) as BlockState<'table_cell'>[]
        return rowCells.map((c) => spans(c.spans ?? []).replace(/\|/g, '\\|'))
      })
      const width = Math.max(alignments.length, ...cells.map((r) => r.length))
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')]
      const head = pad(cells[0] ?? [])
      const bodyRows = cells.slice(1).map(pad)
      const divider = Array.from({ length: width }, (_, i) => {
        switch (alignments[i]) {
          case 'center':
            return ':---:'
          case 'right':
            return '---:'
          case 'left':
            return ':---'
          default:
            return '---'
        }
      })
      return [
        `| ${head.join(' | ')} |`,
        `| ${divider.join(' | ')} |`,
        ...bodyRows.map((r) => `| ${r.join(' | ')} |`),
      ].join('\n')
    }

    case 'table_row':
      lossy.push('orphan:table_row')
      return (b.children ?? []).map((c) => children(c, lossy)).filter(Boolean).join(' ')

    case 'table_cell':
      return spans(b.spans ?? [])

    case 'footnote': {
      const { id } = b.attrs
      const body = children(b, lossy).replace(/\n/g, '\n    ')
      return `[^${id}]: ${body}`
    }

    case 'front_matter':
      lossy.push('front_matter:as-block')
      return (b.spans?.[0]?.text ?? '').trim()

    default:
      lossy.push(`unknown:${(b as { kind: string }).kind}`)
      return null
  }
}

/* ──────────────────────────────────────────────────────────────
 * Inline spans
 * ──────────────────────────────────────────────────────────────*/

function spans(spans: InlineSpan[]): string {
  return spans.map(spanToText).join('')
}

function spanToText(span: InlineSpan): string {
  // Code, math and link/image payloads carry their own delimiter grammar — escaping their
  // contents breaks them (`` \` `` inside a code fence, a `\` in a URL, etc). Everything
  // else gets minimal escaping so that `parse -> serialise` is a no-op on ordinary prose.
  const verbatim = span.marks.some((m) => VERBATIM_MARKS.has(m.type))
  let out = verbatim ? span.text : escapeText(span.text)

  for (const mark of span.marks) out = wrap(out, mark, verbatim)

  return out
}

const VERBATIM_MARKS = new Set<InlineMark['type']>(['code', 'math', 'link', 'image'])

function wrap(text: string, mark: InlineMark, verbatim: boolean): string {
  switch (mark.type) {
    case 'strong':
      return `**${text}**`
    case 'emphasis':
      return `*${text}*`
    case 'strike':
      return `~~${text}~~`
    case 'sub':
      return `~${text}~`
    case 'sup':
      return `^${text}^`
    case 'mark':
      return `==${text}==`
    case 'code': {
      // Pick a fence long enough to survive backticks inside the span.
      const runs = text.match(/`+/g) ?? []
      const longest = runs.reduce((m, r) => Math.max(m, r.length), 0)
      const fence = '`'.repeat(longest + 1)
      const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
      return `${fence}${pad}${text}${pad}${fence}`
    }
    case 'math':
      return `$${text}$`
    case 'link': {
      const title = mark.title ? ` "${mark.title.replace(/"/g, '\\"')}"` : ''
      return `[${verbatim ? text : escapeText(text)}](${encodeUrl(mark.href)}${title})`
    }
    case 'image': {
      const title = mark.title ? ` "${mark.title.replace(/"/g, '\\"')}"` : ''
      const alt = (mark.alt ?? '').replace(/[[\]]/g, '')
      return `![${alt}](${encodeUrl(mark.src)}${title})`
    }
    case 'footnote_ref':
      return `[^${mark.id}]`
    default:
      return text
  }
}

/** Escape only the characters that would otherwise change block/inline structure. Minimal
 * escaping matters: over-escaping turns a round-trip into a diff. */
function escapeText(text: string): string {
  return text
    .replace(/([\\`*_[\]])/g, '\\$1')
    .replace(/^(\s*)([-+]|\d+\.)(\s)/gm, '$1\\$2$3')
}

function encodeUrl(url: string): string {
  return url.includes(' ') ? `<${url}>` : url
}

/* ──────────────────────────────────────────────────────────────
 * Indentation
 * ──────────────────────────────────────────────────────────────*/

function children(b: AnyBlock, lossy: string[]): string {
  if (b.children?.length) {
    return b.children
      .map((c) => block(c, lossy))
      .filter((s): s is string => s !== null && s !== '')
      .join('\n\n')
  }
  return spans(b.spans ?? [])
}

/**
 * Children of a list item.
 *
 * Same as `children`, except a leading paragraph hugs a following sublist with a single
 * newline. A blank line there would turn a tight list into a loose one on the next parse,
 * which then re-serialises differently — the exact class of drift this suite exists to
 * catch. Everything else keeps blank-line separation.
 */
function itemChildren(b: AnyBlock, lossy: string[]): string {
  const kids = b.children ?? []
  const rendered = kids
    .map((c) => ({ c, text: block(c, lossy) }))
    .filter((r): r is { c: AnyBlock; text: string } => r.text !== null && r.text !== '')

  return rendered
    .map((r, i) => {
      const next = rendered[i + 1]?.c
      const hugs = next !== undefined && (next.kind === 'bullet_list' || next.kind === 'ordered_list')
      return r.text + (hugs ? '\n' : '\n\n')
    })
    .join('')
    .replace(/\n+$/, '')
}

/** Render a container's children. `firstPrefix` overrides the first line — that is what
 *  makes `- item` instead of `  - item`. Blank lines inside a tight container are dropped
 *  outright; inside a loose one they keep the prefix's trailing whitespace stripped so we
 *  never emit trailing spaces. */
function indent(body: string, prefix: string, firstPrefix?: string, tight = false): string {
  const head = firstPrefix ?? prefix
  return body
    .split('\n')
    .map((line, i) => {
      if (line.trim() === '') return tight ? '' : ''
      return (i === 0 ? head : prefix) + line
    })
    .join('\n')
}