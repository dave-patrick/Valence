import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'
import type { Node } from '@tiptap/pm/model'
import { findTextMatches, type SearchMatch, type SearchOptions } from '../search'

/** Marks do not break a match; blocks and inline atoms do. */
export function findRichMatches(doc: Node, query: string, options: SearchOptions): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (!query) return matches
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = '', start = 0
    const flush = () => {
      for (const match of findTextMatches(text, query, options)) matches.push({ from: start + match.from, to: start + match.to })
      text = ''
    }
    node.forEach((child, offset) => {
      if (!child.isText) { flush(); return }
      if (!text) start = pos + 1 + offset
      text += child.text!
    })
    flush()
    return false
  })
  return matches
}
export function replaceRichMatches(state: EditorState, matches: readonly SearchMatch[], replacement: string) {
  const tr = closeHistory(state.tr)
  for (const match of [...matches].reverse()) tr.insertText(replacement, match.from, match.to)
  return tr
}
export const documentSearchKey = new PluginKey<DecorationSet>('valence-document-search')
export const DocumentSearch = Extension.create({
  name: 'documentSearch',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: documentSearchKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, previous) {
          const meta = tr.getMeta(documentSearchKey) as { matches: SearchMatch[]; active: number } | undefined
          if (!meta) return previous.map(tr.mapping, tr.doc)
          return DecorationSet.create(tr.doc, meta.matches.map((match, index) => Decoration.inline(match.from, match.to, {
            class: index === meta.active ? 'valence-search-match valence-search-match--current' : 'valence-search-match',
          })))
        },
      },
      props: { decorations: state => documentSearchKey.getState(state) ?? DecorationSet.empty },
    })]
  },
})
