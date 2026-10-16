/**
 * M1.1 — Hidden syntax markers.
 *
 * The defining behaviour of this category: markdown markers are invisible while you write
 * and reappear the moment your caret enters them. Typora's hybrid view does this with
 * hand-managed contenteditable DOM; we do it with ProseMirror decorations, because a
 * virtual-DOM reconciler inside contenteditable is precisely what keeps crashing MarkText
 * (#2800, #4346, #4654).
 *
 * The rule, which matches what a typist expects:
 *
 *   - markers in the block containing the caret are shown;
 *   - markers in every other block are hidden entirely;
 *   - within the active block, a marker is shown when the caret is inside it or immediately
 *     adjacent to it.
 *
 * Nothing here mutates the document. Markers are widget decorations, so they are erased by
 * any state update and can never reach the save path or the undo history.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Mark, Node as ProseNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'

export const syntaxMarkersKey = new PluginKey<DecorationSet>('valence-syntax-markers')

/** How each mark presents itself in source form. */
interface MarkStyle {
  open: string
  close: string
  /** Marks whose payload follows the close marker, e.g. `[text](href)`. */
  payload?: (mark: Mark) => string
}

const STYLES: Record<string, MarkStyle> = {
  bold: { open: '**', close: '**' },
  italic: { open: '*', close: '*' },
  strike: { open: '~~', close: '~~' },
  code: { open: '`', close: '`' },
  highlight: { open: '==', close: '==' },
  superscript: { open: '^', close: '^' },
  subscript: { open: '~', close: '~' },
  link: {
    open: '[',
    close: ']',
    payload: (mark) => `(${mark.attrs['href'] ?? ''}${titleSuffix(mark.attrs['title'])})`,
  },
}

/**
 * TipTap names marks inconsistently across extensions (`bold`/`strong`, `italic`/`em`), so
 * both spellings resolve to one style.
 */
function alias(name: string): string {
  switch (name) {
    case 'strong':
      return 'bold'
    case 'em':
      return 'italic'
    default:
      return name
  }
}

function styleFor(mark: Mark): MarkStyle | null {
  return STYLES[mark.type.name] ?? STYLES[alias(mark.type.name)] ?? null
}

function titleSuffix(title: unknown): string {
  return typeof title === 'string' && title.length > 0 ? ` "${title}"` : ''
}

export interface SyntaxMarkerOptions {
  /** Lets the app suppress markers when it needs a bare rendered view. */
  enabled?: () => boolean
}

export const SyntaxMarkers = Extension.create<SyntaxMarkerOptions>({
  name: 'syntaxMarkers',

  addOptions() {
    return { enabled: () => true }
  },

  addProseMirrorPlugins() {
    const options = this.options

    return [
      new Plugin<DecorationSet>({
        key: syntaxMarkersKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, value, _old, state) => {
            if (!tr.docChanged && !tr.selectionSet) return value
            return buildMarkers(state.doc, state.selection, options.enabled?.() ?? true)
          },
        },
        props: {
          decorations: (state) => syntaxMarkersKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ]
  },
})

/**
 * Exported for tests. Produces the decoration set the plugin installs for a document and
 * selection.
 */
export function buildMarkers(
  doc: ProseNode,
  selection: EditorState['selection'],
  enabled = true,
): DecorationSet {
  if (!enabled) return DecorationSet.empty

  const decorations: Decoration[] = []
  const caret = selection.head
  const active = activeTextblockRange(doc, caret)

  doc.descendants((node, pos) => {
    // Only the block holding the caret shows markers. Compared by document range rather
    // than `node.parent`, which ProseMirror 3 does not populate on text nodes.
    if (active === null || pos < active.from || pos + node.nodeSize > active.to) return

    // Images are inline *nodes*, not text, so they take a separate path: the whole
    // `![alt](src)` reads as one token.
    if (node.isInline && !node.isText) {
      if (node.type.name !== 'image') return
      if (caret < pos - 1 || caret > pos + node.nodeSize + 1) return
      const payload = `![${String(node.attrs['alt'] ?? '')}](${String(
        node.attrs['src'] ?? '',
      )}${titleSuffix(node.attrs['title'])})`
      decorations.push(
        Decoration.widget(pos, () => markerNode(payload, 'payload'), {
          side: -1,
          key: `img:${pos}`,
        }),
      )
      return
    }

    if (!node.isText || node.nodeSize === 0) return

    const from = pos
    const to = pos + node.nodeSize

    // Shown when the caret is inside the run or touching either edge.
    if (!(caret >= from - 1 && caret <= to + 1)) return

    const visible = node.marks
      .map((mark) => ({ mark, style: styleFor(mark) }))
      .filter((e): e is { mark: Mark; style: MarkStyle } => e.style !== null)
    if (!visible.length) return

    // Openers in mark order (outermost first) and closers reversed, so the revealed source
    // reads as valid Markdown. `**bold *and italic* **` legitimately puts two openers at
    // one offset and two closers at the other — what breaks naive implementations is
    // emitting one pair per mark instead of one marker each.
    visible.forEach(({ style }, i) => {
      decorations.push(
        Decoration.widget(from, () => markerNode(style.open, 'open'), {
          side: -1,
          key: `o:${i}:${from}`,
        }),
      )
    })

    for (const [i, { mark, style }] of [...visible].reverse().entries()) {
      if (style.close) {
        decorations.push(
          Decoration.widget(to, () => markerNode(style.close, 'close'), {
            side: 1,
            key: `c:${i}:${to}`,
          }),
        )
      }
      const payload = style.payload?.(mark)
      if (payload) {
        decorations.push(
          Decoration.widget(to, () => markerNode(payload, 'payload'), {
            side: 1,
            key: `p:${i}:${to}`,
          }),
        )
      }
    }
  })

  return DecorationSet.create(doc, decorations)
}

/** The document range of the textblock containing `pos`, or null if the caret is not in one. */
function activeTextblockRange(doc: ProseNode, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(Math.min(pos, doc.content.size))
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).isTextblock) {
      return { from: $pos.before(d), to: $pos.after(d) }
    }
  }
  return null
}

/** Marker elements are `contenteditable=false` so the caret skips straight over them. */
function markerNode(text: string, kind: 'open' | 'close' | 'payload'): HTMLElement {
  const span = document.createElement('span')
  span.className = `valence-marker valence-marker--${kind}`
  span.textContent = text
  span.contentEditable = 'false'
  return span
}