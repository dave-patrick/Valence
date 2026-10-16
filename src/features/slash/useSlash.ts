import type { SlashItem } from './slashCommands'
import { searchSlashItems, slashQueryPrefix } from './slashCommands'
import type { Editor } from '@tiptap/core'
// insertWikiLink is not needed here; this module is detection only.

export interface SlashRange {
  from: number
  to: number
  query: string
}

/**
 * Detects a live slash query in the editor.
 *
 * Returns null when the caret is not inside a block that starts with `/...` and continues
 * with the whole text up to the caret.
 */
export function detectSlash(editor: Editor): SlashRange | null {
  const sel = editor.state.selection
  const { from } = sel
  const $from = editor.state.doc.resolve(from)
  const start = $from.start()
  const text = editor.state.doc.textBetween(start, from, '\n', '\n')
  if (text === '') return null // caret is at block start
  if (!text.startsWith('/')) {
    const prev = text.lastIndexOf('\n')
    const line = prev === -1 ? text : text.slice(prev + 1)
    if (!line.startsWith('/')) return null
    const query = line.slice(1)
    if (/\s/.test(query)) return null
    return { from: start + prev + 2, to: from, query }
  }
  // block starts with /
  const query = text.slice(1)
  if (/\s/.test(query)) return null
  return { from: start + 1, to: from, query }
}

export { searchSlashItems, slashQueryPrefix }