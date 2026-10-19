/**
 * Line numbers (the "Line numbers" setting).
 *
 * A gutter down the left of the editing surface, numbering each top-level block of the
 * document. It is a decoration over the existing document, so it changes nothing about the
 * content and costs no undo history.
 *
 * ── What is numbered ────────────────────────────────────────────────────────────
 *
 * Each block that is a direct child of the document gets a number: paragraphs, headings,
 * lists, quotes, code blocks, tables, rules. Their contents are numbered by their parent.
 *
 * Nesting is not descended into on purpose. A list item is a paragraph, but numbering
 * every item inside a list would put numbers in the middle of the list's own indentation
 * and make the gutter unreadable, and the hint on the setting says "beside each
 * paragraph" -- the paragraph being the thing the reader sees as a line of the document.
 *
 * ── Why the number hangs in the margin ─────────────────────────────────────────
 *
 * The number is a widget at the start of the block's content, styled as an inline-block
 * pulled left by its own width. Making it absolutely positioned would need every block to
 * be a positioning context, which changes how any other absolutely-positioned child of a
 * block -- a code block's toolbar, a table's resize handles -- resolves its own
 * coordinates. The inline approach cannot do that.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface LineNumberOptions {
  /** Read live, so a settings change reaches the editor without rebuilding it. */
  lineNumbers?: () => boolean
}

/**
 * The meta that makes a toggle take effect at once.
 *
 * A settings change carries no document or selection change, so without this the
 * decorations would not be recomputed until the next edit -- and the user would be
 * told to turn on line numbers and see nothing happen.
 */
export const LINE_NUMBERS_TOGGLE = 'valence-line-numbers-toggle'

export const lineNumberKey = new PluginKey<DecorationSet>('valence-line-numbers')

export const LineNumbers = Extension.create<LineNumberOptions>({
  name: 'lineNumbers',

  addOptions() {
    return { lineNumbers: () => false }
  },

  addProseMirrorPlugins() {
    const options = this.options

    return [
      new Plugin<DecorationSet>({
        key: lineNumberKey,
        state: {
          // The document is numbered from the start, not from the first edit. The
          // initial content is set before the editor exists, so there is no
          // doc-changing transaction to trigger the numbering.
          init: (_config, state) =>
            options.lineNumbers?.() ? lineNumberDecorations(state.doc) : DecorationSet.empty,
          apply: (tr, value, _old, state) => {
            if (!(options.lineNumbers?.() ?? false)) return DecorationSet.empty
            if (!tr.docChanged && !tr.getMeta(LINE_NUMBERS_TOGGLE)) return value
            return lineNumberDecorations(state.doc)
          },
        },
        props: {
          decorations: (state) => lineNumberKey.getState(state) ?? DecorationSet.empty,
        },
      }),

      // The gutter needs room in the editor's own padding, and the class that makes the
      // room is a property of the DOM rather than of the document, so it lives in a view.
      new Plugin({
        view: (editorView) => {
          const sync = () => {
            editorView.dom.classList.toggle(
              'has-line-numbers',
              options.lineNumbers?.() ?? false,
            )
          }
          sync()
          return {
            update: () => sync(),
            destroy: () => editorView.dom.classList.remove('has-line-numbers'),
          }
        },
      }),
    ]
  },
})

/**
 * Build the decorations that number each top-level block.
 */
export function lineNumberDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = []
  let count = 0

  doc.forEach((node, offset) => {
    count += 1
    // The number is captured by value. A closure over the counter would read it when the
    // widget is rendered, not when it is created, and every number would show the last
    // one in the document.
    const number = count
    decorations.push(
      Decoration.widget(
        offset + 1,
        () => {
          const el = document.createElement('span')
          el.className = 'valence-lineno'
          el.setAttribute('aria-hidden', 'true')
          el.textContent = String(number)
          return el
        },
        { side: -1 },
      ),
    )
  })

  return DecorationSet.create(doc, decorations)
}
