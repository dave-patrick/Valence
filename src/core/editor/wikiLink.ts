import { Mark, mergeAttributes } from '@tiptap/core'

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
    return [{ tag: 'a[data-type="wikilink"]', getAttrs: (el: Element) => ({
      target: el.getAttribute('data-target') || el.textContent || '',
      alias: el.getAttribute('data-alias') || null,
      heading: el.getAttribute('data-heading') || null,
    }) }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'wikilink',
        class: 'wiki-link',
        'data-target': HTMLAttributes.target || undefined,
        'data-alias': HTMLAttributes.alias || undefined,
        'data-heading': HTMLAttributes.heading || undefined,
      }),
      0,
    ]
  },

  addCommands() {
    return {}
  },
})