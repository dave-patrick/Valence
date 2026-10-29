import { DOMParser as ProseMirrorDOMParser, type Schema } from '@tiptap/pm/model'
import { parseMarkdown } from '@core/markdown/parse'
import { blocksToHtml } from '@core/htmlBridge'

/** Count the actual schema headings before this source section, including raw HTML.
 * Footnote definitions are appended after the document by the editor parser. */
export function headingIndex(source: string, offset: number, schema: Schema): number {
  const prefix = parseMarkdown(source.slice(0, offset)).blocks.filter((b) => b.kind !== 'footnote')
  const container = document.createElement('div')
  container.innerHTML = blocksToHtml(prefix)
  const doc = ProseMirrorDOMParser.fromSchema(schema).parse(container)
  let count = 0
  doc.descendants((node) => { if (node.type.name === 'heading') count++ })
  return count
}
