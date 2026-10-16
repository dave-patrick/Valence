/**
 * Block state <-> editor HTML.
 *
 * This is the bridge that lets the ProseMirror surface and the markdown surface be two views
 * of one document. In the target architecture ProseMirror state *is* the document and this
 * file disappears (see docs/03-roadmap.md §M2). In the scaffold it plays the same role by
 * translating through HTML, and it is exercised by the same round-trip test, so swapping it
 * out is a change of implementation rather than of contract.
 *
 * It is also what powers smart paste — `htmlToBlocks` accepts arbitrary pasted HTML.
 */

import type { AnyBlock, BlockState, InlineMark, InlineSpan } from './types'

/* ──────────────────────────────────────────────────────────────
 * blocks -> HTML
 * ──────────────────────────────────────────────────────────────*/

export function blocksToHtml(blocks: AnyBlock[]): string {
  return blocks.map(blockToHtml).join('')
}

function blockToHtml(b: AnyBlock): string {
  switch (b.kind) {
    case 'paragraph':
      return `<p>${spansToHtml(b.spans ?? [])}</p>`
    case 'heading':
      return `<h${b.attrs.level}>${spansToHtml(b.spans ?? [])}</h${b.attrs.level}>`
    case 'thematic_break':
      return '<hr>'
    case 'code_block': {
      const text = escapeHtml(b.spans?.[0]?.text ?? '')
      return `<pre data-lang="${escapeAttr(b.attrs.lang)}"><code>${text}</code></pre>`
    }
    case 'math_block':
      // Source travels in an attribute: these are atom nodes, and text content would be
      // parsed as the node's body rather than its payload.
      return `<div data-type="math-block" data-latex="${escapeAttr(
        b.spans?.[0]?.text ?? '',
      )}"></div>`
    case 'diagram':
      return `<div data-type="diagram" data-kind="${escapeAttr(b.attrs.kind)}" data-code="${escapeAttr(
        b.spans?.[0]?.text ?? '',
      )}"></div>`
    case 'html_block':
      return b.spans?.[0]?.text ?? ''
    case 'blockquote':
      return `<blockquote>${blocksToHtml(b.children ?? [])}</blockquote>`
    case 'bullet_list':
      return `<ul>${(b.children ?? []).map(listItemToHtml).join('')}</ul>`
    case 'ordered_list':
      return `<ol${b.attrs.start !== 1 ? ` start="${b.attrs.start}"` : ''}>${(b.children ?? [])
        .map(listItemToHtml)
        .join('')}</ol>`
    case 'list_item':
      return `<li>${blocksToHtml(b.children ?? [])}</li>`
    case 'task_item': {
      const checked = b.attrs.checked
      const [first, ...rest] = b.children ?? []
      const head = first?.kind === 'paragraph' ? spansToHtml(first.spans ?? []) : ''
      return `<li data-checked="${checked}" data-type="task"><input type="checkbox" ${
        checked ? 'checked' : ''
      } disabled>${head}${rest.map(blockToHtml).join('')}</li>`
    }
    case 'table':
      return tableToHtml(b)
    case 'footnote':
      return `<section data-type="footnote" data-id="${escapeAttr(b.attrs.id)}">${blocksToHtml(
        b.children ?? [],
      )}</section>`
    case 'front_matter':
      return ''
    default:
      return ''
  }
}

function listItemToHtml(item: AnyBlock): string {
  const children = item.children ?? []
  if (children.length === 1 && children[0]!.kind === 'paragraph') {
    // A single paragraph in a list item must not become a nested <p> — it breaks tight lists.
    return `<li>${spansToHtml(children[0]!.spans ?? [])}</li>`
  }
  return blockToHtml(item)
}

function tableToHtml(b: AnyBlock): string {
  const rows = b.children ?? []
  const cellTag = (header: boolean) => (header ? 'th' : 'td')
  const body = rows
    .map((row) => {
      const cells = (row.children ?? []) as BlockState<'table_cell'>[]
      return `<tr>${cells
        .map((c) => {
          const align = c.attrs.align ? ` style="text-align:${c.attrs.align}"` : ''
          return `<${cellTag(c.attrs.header)}${align}>${spansToHtml(c.spans ?? [])}</${cellTag(
            c.attrs.header,
          )}>`
        })
        .join('')}</tr>`
    })
    .join('')
  return `<table><tbody>${body}</tbody></table>`
}

function spansToHtml(spans: InlineSpan[]): string {
  return spans
    .map((span) => {
      let html = escapeHtml(span.text)
      for (const mark of span.marks) html = markToHtml(mark, html)
      return html
    })
    .join('')
}

function markToHtml(mark: InlineMark, inner: string): string {
  switch (mark.type) {
    case 'strong':
      return `<strong>${inner}</strong>`
    case 'emphasis':
      return `<em>${inner}</em>`
    case 'strike':
      return `<s>${inner}</s>`
    case 'sub':
      return `<sub>${inner}</sub>`
    case 'sup':
      return `<sup>${inner}</sup>`
    case 'mark':
      return `<mark>${inner}</mark>`
    case 'code':
      return `<code>${inner}</code>`
    case 'math': {
      // `inner` is the escaped span text; for an empty atom it is '' and the LaTeX lives
      // in the attribute. Either way the atom is re-emitted as an empty element.
      const latex = inner || ''
      return `<span data-type="math" data-latex="${escapeAttr(latex)}"></span>`
    }
    case 'footnote_ref':
      return `<sup data-type="footnote-ref" data-id="${escapeAttr(mark.id)}">[${escapeHtml(mark.id)}]</sup>`
    case 'link':
      return `<a href="${escapeAttr(mark.href)}"${mark.title ? ` title="${escapeAttr(mark.title)}"` : ''}>${inner}</a>`
    case 'image': {
      const alt = escapeAttr(mark.alt ?? '')
      return `<img src="${escapeAttr(mark.src)}" alt="${alt}"${
        mark.title ? ` title="${escapeAttr(mark.title)}"` : ''
      }>`
    }
    default:
      return inner
  }
}

/* ──────────────────────────────────────────────────────────────
 * HTML -> blocks
 * ──────────────────────────────────────────────────────────────*/

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input'])

/**
 * Elements that establish a block of their own. Anything not listed here — a bare `<a>`, a
 * `<strong>`, a stray text node — is loose inline content that belongs inside a paragraph.
 */
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'form',
])

export function htmlToBlocks(html: string): AnyBlock[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out: AnyBlock[] = []

  // Clipboard HTML is often a bare inline fragment -- a link, a bold run, a stray text node
  // with no surrounding element. Walking the body directly would flatten those to plain text
  // and lose every mark, which is exactly what smart paste exists to prevent. So loose inline
  // nodes are gathered and wrapped in a paragraph before conversion.
  let loose: Node[] = []

  const flushLoose = () => {
    if (!loose.length) return
    const holder = document.createElement('div')
    for (const el of loose) holder.appendChild(el.cloneNode(true))
    out.push({ kind: 'paragraph', attrs: {}, spans: collectSpans(holder, []) })
    loose = []
  }

  for (const node of Array.from(doc.body.childNodes)) {
    const tag =
      node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement).tagName.toLowerCase() : ''

    if (node.nodeType === Node.TEXT_NODE || !BLOCK_TAGS.has(tag)) {
      loose.push(node)
      continue
    }

    flushLoose()
    out.push(...nodeToBlock(node))
  }
  flushLoose()

  if (!out.length) out.push({ kind: 'paragraph', attrs: {}, spans: [] })
  return out
}

function nodeToBlock(node: Node): AnyBlock[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    return text.trim() ? [{ kind: 'paragraph', attrs: {}, spans: [{ text, marks: [] }] }] : []
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'p':
      return [{ kind: 'paragraph', attrs: {}, spans: collectSpans(el, []) }]
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return [
        {
          kind: 'heading',
          attrs: { level: Number(tag[1]) as 1 },
          spans: collectSpans(el, []),
        },
      ]
    case 'hr':
      return [{ kind: 'thematic_break', attrs: {}, spans: [] }]
    case 'blockquote':
      return [{ kind: 'blockquote', attrs: {}, children: childBlocks(el) }]
    case 'ul':
    case 'ol':
      return [listToBlock(el, tag === 'ol')]
    case 'pre': {
      const code = el.querySelector('code')
      const text = (code ?? el).textContent ?? ''
      const lang =
        el.dataset.lang ??
        code?.className.replace(/^language-/, '') ??
        /language-([\w-]+)/.exec(code?.className ?? '')?.[1] ??
        ''
      return [{ kind: 'code_block', attrs: { lang, meta: undefined }, spans: [{ text, marks: [] }] }]
    }
    case 'table':
      return [tableFromHtml(el)]
    case 'div': {
      const type = el.dataset.type
      if (type === 'math-block') {
        return [
          {
            kind: 'math_block',
            attrs: { display: true },
            spans: [{ text: el.dataset.latex ?? el.textContent ?? '', marks: [] }],
          },
        ]
      }
      if (type === 'diagram') {
        return [
          {
            kind: 'diagram',
            attrs: { kind: el.dataset.kind ?? 'mermaid' },
            spans: [{ text: el.dataset.code ?? el.textContent ?? '', marks: [] }],
          },
        ]
      }
      return childBlocks(el)
    }
    case 'section':
      return [
        {
          kind: 'footnote',
          attrs: { id: el.dataset.id ?? '', label: el.dataset.id ?? '' },
          children: childBlocks(el),
        },
      ]
    default:
      return childBlocks(el)
  }
}

function childBlocks(el: HTMLElement): AnyBlock[] {
  const out: AnyBlock[] = []
  for (const child of Array.from(el.childNodes)) out.push(...nodeToBlock(child))
  return out
}

function listToBlock(el: HTMLElement, ordered: boolean): AnyBlock {
  const items: AnyBlock[] = []
  let index = 0

  for (const li of Array.from(el.children)) {
    if (li.tagName.toLowerCase() !== 'li') continue
    const item = li as HTMLElement
    const checkbox = item.querySelector<HTMLInputElement>(':scope > input[type=checkbox]')
    const isTask = checkbox !== null || item.dataset.type === 'task'
    const holder = document.createElement('div')
    for (const child of Array.from(item.childNodes)) {
      if (child !== checkbox) holder.appendChild(child.cloneNode(true))
    }
    // A single text child is a tight item; keep it as a bare paragraph.
    const children =
      holder.childNodes.length === 1 && holder.firstElementChild === null
        ? [{ kind: 'paragraph', attrs: {}, spans: collectSpans(holder, []) } as AnyBlock]
        : childBlocks(holder)

    if (isTask) {
      items.push({
        kind: 'task_item',
        attrs: { checked: checkbox?.checked === true || item.dataset.checked === 'true', index },
        children,
      })
    } else {
      items.push({ kind: 'list_item', attrs: { index, checked: null }, children })
    }
    index++
  }

  if (ordered) {
    return { kind: 'ordered_list', attrs: { start: Number(el.getAttribute('start')) || 1, tight: true }, children: items }
  }
  return { kind: 'bullet_list', attrs: { tight: true }, children: items }
}

function tableFromHtml(el: HTMLElement): AnyBlock {
  const trs = Array.from(el.querySelectorAll('tr'))
  const alignments: Array<'left' | 'center' | 'right' | null> = []
  const rows: AnyBlock[] = []

  trs.forEach((tr, r) => {
    const cells: AnyBlock[] = []
    for (const cell of Array.from(tr.children)) {
      const style = (cell as HTMLElement).style.textAlign
      const align = style === 'center' || style === 'right' || style === 'left' ? style : null
      if (r === 0) alignments.push(align)
      cells.push({
        kind: 'table_cell',
        attrs: { align, header: cell.tagName.toLowerCase() === 'th' || r === 0 },
        spans: collectSpans(cell as HTMLElement, []),
      })
    }
    rows.push({ kind: 'table_row', attrs: {}, children: cells })
  })

  return { kind: 'table', attrs: { alignments, header: true }, children: rows }
}

/* ──────────────────────────────────────────────────────────────
 * Inline collection
 * ──────────────────────────────────────────────────────────────*/

/** Walks inline content, accumulating marks as it descends into formatting elements. */
function collectSpans(el: Node, marks: InlineMark[]): InlineSpan[] {
  const spans: InlineSpan[] = []

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) spans.push({ text, marks })
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue

    const child = node as HTMLElement
    const tag = child.tagName.toLowerCase()

    if (VOID_TAGS.has(tag)) {
      if (tag === 'br') spans.push({ text: '\n', marks })
      else if (tag === 'img') {
        spans.push({
          text: '',
          marks: [
            ...marks,
            {
              type: 'image',
              src: child.getAttribute('src') ?? '',
              alt: child.getAttribute('alt') || undefined,
              title: child.getAttribute('title') ?? undefined,
            },
          ],
        })
      }
      continue
    }

    const mark = markForTag(child, marks)
    if (mark === null) {
      // Self-describing leaves carry their payload in attributes and no text content, so
      // they must emit their own span — descending would yield nothing and drop the mark.
      if (tag === 'sup' && child.dataset.type === 'footnote-ref') {
        spans.push({ text: '', marks: [...marks, { type: 'footnote_ref', id: child.dataset.id ?? '' }] })
        continue
      }
      if (tag === 'span' && child.dataset.type === 'math') {
        spans.push({ text: child.dataset.latex ?? '', marks: [...marks, { type: 'math', display: false }] })
        continue
      }
      spans.push(...collectSpans(child, marks))
      continue
    }
    spans.push(...collectSpans(child, mark))
  }

  return spans
}

function markForTag(el: HTMLElement, marks: InlineMark[]): InlineMark[] | null {
  switch (el.tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return [...marks, { type: 'strong' }]
    case 'em':
    case 'i':
      return [...marks, { type: 'emphasis' }]
    case 's':
    case 'del':
    case 'strike':
      return [...marks, { type: 'strike' }]
    case 'sub':
      return [...marks, { type: 'sub' }]
    case 'sup':
      return [...marks, { type: 'sup' }]
    case 'mark':
      return [...marks, { type: 'mark' }]
    case 'code':
      return el.parentElement?.tagName.toLowerCase() === 'pre'
        ? null
        : [...marks, { type: 'code' }]
    case 'a':
      return [
        ...marks,
        { type: 'link', href: el.getAttribute('href') ?? '', title: el.getAttribute('title') ?? undefined },
      ]
    default:
      // `span[data-type="math"]` is handled explicitly in `collectSpans`: it is an empty
      // atom, so descending into it would produce nothing and silently drop the mark.
      return null
  }
}

/* ──────────────────────────────────────────────────────────────
 * Escaping
 * ──────────────────────────────────────────────────────────────*/

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/\n/g, ' ')
}