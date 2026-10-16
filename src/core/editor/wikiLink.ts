import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Wiki links in the editor.
 *
 * `[[Note]]` round-trips through the markdown layer as a `wikilink` inline mark. In the editor
 * the mark shows its display text only — brackets would be noise in a reading view, the same
 * way bold writes `**` in source and a solid run in hybrid. Clicking follows it; missing targets
 * are created rather than warned, because that is what makes linking useful as you write.
 *
 * `openOnClick: false` because TipTap's default click behaviour navigates the whole view
 * away. Follow plus "create if missing" is a hand-rolled dispatch, so it is also where the
 * workspace context has to arrive.
 */
export default Mark.create({
  name: 'wikiLink',
  priority: 1000,

  addAttributes() {
    return {
      target: { default: '' },
      alias: { default: null },
      heading: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-type="wikilink"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { 'data-type': 'wikilink', class: 'wiki-link' }), 0]
  },

  addCommands() {
    return {}
  },
})