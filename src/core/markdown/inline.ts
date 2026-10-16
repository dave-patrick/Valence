/**
 * Inline token stream -> our `InlineSpan[]`.
 *
 * markdown-it's inline lexer is decade-battle-tested and, critically, already handles CJK
 * flanking rules for emphasis — the exact area where MarkText needed three separate patches
 * (#4355, #4401, #4307) before its custom lexer stopped mangling `*强调*`. We consume it
 * rather than reimplement it.
 */

import type { MarkdownIt, Token } from 'markdown-it'
import type { InlineMark, InlineSpan } from '../types'

/** markdown-it 15 types attribute values as `string | number`; every attribute we read is
 *  textual, so normalise once here rather than casting at twenty call sites. */
function attr(token: Token, name: string): string | undefined {
  const v = token.attrGet(name)
  return v === null || v === undefined ? undefined : String(v)
}

export function renderInline(inlineToken: Token, md: MarkdownIt): InlineSpan[] {
  if (!inlineToken.children?.length) return []
  const spans: InlineSpan[] = []
  let marks: InlineMark[] = []

  for (const child of inlineToken.children) {
    switch (child.type) {
      case 'strong_open':
        marks.push({ type: 'strong' })
        continue
      case 'strong_close':
        marks = drop<{ type: 'strong' }>(marks, 'strong')
        continue
      case 'em_open':
        marks.push({ type: 'emphasis' })
        continue
      case 'em_close':
        marks = drop<{ type: 'emphasis' }>(marks, 'emphasis')
        continue
      case 's_open':
        marks.push({ type: 'strike' })
        continue
      case 's_close':
        marks = drop<{ type: 'strike' }>(marks, 'strike')
        continue
      case 'sub_open':
        marks.push({ type: 'sub' })
        continue
      case 'sub_close':
        marks = drop<{ type: 'sub' }>(marks, 'sub')
        continue
      case 'sup_open':
        marks.push({ type: 'sup' })
        continue
      case 'sup_close':
        marks = drop<{ type: 'sup' }>(marks, 'sup')
        continue
      case 'mark_open':
        marks.push({ type: 'mark' })
        continue
      case 'mark_close':
        marks = drop<{ type: 'mark' }>(marks, 'mark')
        continue

      case 'link_open':
        marks.push({
          type: 'link',
          href: attr(child, 'href') ?? '',
          title: attr(child, 'title'),
        })
        continue
      case 'link_close':
        marks = drop<{ type: 'link' }>(marks, 'link')
        continue

      case 'image': {
        // Images are leaf tokens: they carry no children, so emit a complete span.
        spans.push({
          text: '',
          marks: [
            ...marks,
            {
              type: 'image',
              src: attr(child, 'src') ?? '',
              alt: child.content || undefined,
              title: attr(child, 'title'),
            },
          ],
        })
        continue
      }

      case 'code_inline':
        spans.push({ text: child.content, marks: [...marks, { type: 'code' }] })
        continue

      case 'wikilink': {
        // The span text is the display text; the target travels on the mark, so serialising
        // back to `[[target|alias]]` does not depend on re-parsing what the user sees.
        const alias = attr(child, 'alias')
        spans.push({
          text: child.content,
          marks: [
            ...marks,
            {
              type: 'wikilink',
              target: attr(child, 'target') ?? child.content,
              alias,
              heading: attr(child, 'heading'),
            },
          ],
        })
        continue
      }

      case 'math_inline':
        spans.push({ text: child.content, marks: [...marks, { type: 'math', display: false }] })
        continue

      case 'softbreak':
        spans.push({ text: '\n', marks: [...marks] })
        continue

      case 'hardbreak':
        spans.push({ text: '\n', marks: [...marks] })
        continue

      case 'text':
        spans.push({ text: child.content, marks: [...marks] })
        continue

      default:
        if (child.content) spans.push({ text: child.content, marks: [...marks] })
        continue
    }
  }

  return merge(spans)
}

function drop<T extends { type: string }>(marks: InlineMark[], type: T['type']): InlineMark[] {
  const idx = marks.findIndex((m) => m.type === type)
  if (idx === -1) return marks
  return [...marks.slice(0, idx), ...marks.slice(idx + 1)]
}

/** Adjacent spans sharing an identical mark set become one span. Without this, a bold run
 * split across several `text` tokens produces needless marks on the next keystroke and
 * makes the serialiser emit redundant delimiters. */
function merge(spans: InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = []
  for (const span of spans) {
    const prev = out[out.length - 1]
    if (prev && sameMarks(prev.marks, span.marks)) {
      prev.text += span.text
    } else {
      out.push({ text: span.text, marks: span.marks })
    }
  }
  return out
}

function sameMarks(a: InlineMark[], b: InlineMark[]): boolean {
  if (a.length !== b.length) return false
  return a.every((m, i) => sameMark(m, b[i]!))
}

function sameMark(a: InlineMark, b: InlineMark): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'link') return a.href === (b as typeof a).href
  if (a.type === 'image') return a.src === (b as typeof a).src
  // Two adjacent links are only the same link if the target matches. Without this,
  // `[[One]][[Two]]` merges into one span and saving rewrites the first link's target.
  if (a.type === 'wikilink') return a.target === (b as typeof a).target
  return true
}