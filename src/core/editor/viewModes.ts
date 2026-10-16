/**
 * Focus and typewriter modes (M1.5).
 *
 * Both are decorations over the existing document, so neither touches state, and both are
 * free to switch on and off without disturbing the caret or undo history.
 *
 * **Focus** dims every block except the one holding the caret. Dimming rather than hiding is
 * deliberate: hiding makes the document jump as you move between paragraphs, which is the
 * opposite of what focus mode is for.
 *
 * **Typewriter** keeps the current line vertically centred. ProseMirror has no notion of
 * scrolling, so this is a plugin that observes the caret and scrolls the nearest scrollable
 * ancestor, with a floor on how far it will travel so the first and last lines can still
 * reach the centre.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { ResolvedPos } from '@tiptap/pm/model'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface ViewModeOptions {
  focus?: () => boolean
  typewriter?: () => boolean
}

export const viewModeKey = new PluginKey<DecorationSet>('valence-view-mode')

export const ViewModes = Extension.create<ViewModeOptions>({
  name: 'viewModes',

  addOptions() {
    return { focus: () => false, typewriter: () => false }
  },

  addProseMirrorPlugins() {
    const options = this.options

    return [
      new Plugin<DecorationSet>({
        key: viewModeKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, value, _old, state) => {
            const focus = options.focus?.() ?? false
            if (!focus) return DecorationSet.empty
            // A settings toggle carries no document or selection change, so the
            // `focus-toggle` meta is what makes switching the mode take effect at once.
            if (!tr.docChanged && !tr.selectionSet && !tr.getMeta('focus-toggle')) return value
            return focusDecoration(state.doc, state.selection.$from)
          },
        },
        props: {
          decorations: (state) => viewModeKey.getState(state) ?? DecorationSet.empty,
        },
      }),

      // Typewriter needs a view, so it lives in a plugin prop rather than in state.
      new Plugin({
        view: (editorView) => {
          const centre = () => {
            if (!(options.typewriter?.() ?? false)) return

            const { state } = editorView
            const coords = editorView.coordsAtPos(state.selection.head)
            const scroller = nearestScroller(editorView.dom)
            if (!scroller) return

            const box = scroller.getBoundingClientRect()
            const target = box.top + box.height / 2
            const delta = coords.top - target

            // Do not scroll past the ends, or the first and last lines can never reach the
            // centre and the view appears to fight back.
            const maxUp = -scroller.scrollTop
            const maxDown = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
            const clamped = Math.max(maxUp, Math.min(maxDown, delta))
            if (Math.abs(clamped) > 1) scroller.scrollTop += clamped
          }

          const raf = requestAnimationFrame(centre)
          return {
            update: () => requestAnimationFrame(centre),
            destroy: () => cancelAnimationFrame(raf),
          }
        },
      }),
    ]
  },
})

/** A class on every top-level block that is not the caret's. */
function focusDecoration(doc: ProseNode, $from: ResolvedPos): DecorationSet {
  const decorations: Decoration[] = []
  const activeStart = $from.before(1)
  const activeEnd = $from.after(1)

  doc.forEach((node, offset) => {
    if (offset >= activeStart && offset + node.nodeSize <= activeEnd) return
    decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'valence-dimmed' }))
  })

  return DecorationSet.create(doc, decorations)
}

function nearestScroller(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}