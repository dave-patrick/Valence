/**
 * @vitest-environment jsdom
 *
 * Table editing (M1.3).
 *
 * `tableContext` is the piece with real logic, and it is pure — it reads an `EditorState` and
 * returns a description of where the caret is. That makes the interesting cases (header
 * detection, column alignment, clamping a selection that spans cells) testable without a
 * DOM and without dispatching transactions.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { createExtensions } from '../src/core/editor/extensions'
import { tableContext, emptyTable, CHESSBOARD_SIZES } from '../src/core/editor/table'

function makeEditor(html: string): Editor {
  return new Editor({
    extensions: createExtensions(),
    content: html,
    element: document.createElement('div'),
  })
}

/** Places the caret in the cell at [row, col]. */
function caretInCell(editor: Editor, row: number, col: number): void {
  const table = editor.state.doc.nodeAt(0)
  if (!table) throw new Error('expected a table at position 0')

  // 1 is the first position inside the table, i.e. the start of its first row.
  let rowPos = 1
  for (let r = 0; r < row; r++) rowPos += table.child(r).nodeSize

  const rowNode = table.child(row)
  // A row's own start is its first token; its cells begin one position later.
  let cellPos = rowPos + 1
  for (let c = 0; c < col; c++) cellPos += rowNode.child(c).nodeSize

  // Step past the cell's opening token, then snap to the nearest valid text position.
  // Computing an exact paragraph offset by hand is brittle; `near` does it correctly for
  // every table shape.
  const sel = TextSelection.near(editor.state.doc.resolve(cellPos + 1), 1)
  editor.commands.setTextSelection(sel.from)
}

describe('tableContext', () => {
  let editor: Editor

  beforeEach(() => {
    editor?.destroy()
  })

  it('is null when the selection is not in a table', () => {
    editor = makeEditor('<p>plain text</p>')
    editor.commands.setTextSelection(3)
    expect(tableContext(editor.state)).toBeNull()
  })

  it('reports the table dimensions', () => {
    editor = makeEditor(
      '<table><tbody>' +
        '<tr><th><p>a</p></th><th><p>b</p></th></tr>' +
        '<tr><td><p>1</p></td><td><p>2</p></td></tr>' +
        '<tr><td><p>3</p></td><td><p>4</p></td></tr>' +
        '</tbody></table>',
    )
    caretInCell(editor, 1, 1)
    const ctx = tableContext(editor.state)!
    expect(ctx.rows).toBe(3)
    expect(ctx.cols).toBe(2)
  })

  it('reports the caret cell', () => {
    editor = makeEditor(
      '<table><tbody>' +
        '<tr><td><p>a</p></td><td><p>b</p></td></tr>' +
        '<tr><td><p>c</p></td><td><p>d</p></td></tr>' +
        '</tbody></table>',
    )
    caretInCell(editor, 1, 1)
    const ctx = tableContext(editor.state)!
    expect(ctx.row).toBe(1)
    expect(ctx.col).toBe(1)
  })

  it('detects a header row', () => {
    editor = makeEditor(
      '<table><tbody><tr><th><p>h</p></th></tr><tr><td><p>b</p></td></tr></tbody></table>',
    )
    caretInCell(editor, 0, 0)
    expect(tableContext(editor.state)!.inHeader).toBe(true)

    caretInCell(editor, 1, 0)
    expect(tableContext(editor.state)!.inHeader).toBe(false)
  })

  it('detects a header column only when every cell in it is a header', () => {
    editor = makeEditor(
      '<table><tbody>' +
        '<tr><th><p>a</p></th><th><p>b</p></th></tr>' +
        '<tr><th><p>c</p></th><td><p>d</p></td></tr>' +
        '</tbody></table>',
    )
    caretInCell(editor, 0, 0)
    // Column 0 is all headers; column 1 is not.
    expect(tableContext(editor.state)!.colIsHeader).toBe(true)

    caretInCell(editor, 0, 1)
    expect(tableContext(editor.state)!.colIsHeader).toBe(false)
  })

  it('reads the column alignment from the header cell', () => {
    // Alignment lives on the cell element, not on the paragraph inside it.
    editor = makeEditor(
      '<table><tbody><tr><th style="text-align: center"><p>h1</p></th><th><p>h2</p></th></tr>' +
        '<tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
    )
    caretInCell(editor, 0, 0)
    expect(tableContext(editor.state)!.align).toBe('center')

    caretInCell(editor, 0, 1)
    expect(tableContext(editor.state)!.align).toBeNull()
  })

  it('survives an odd row without crashing', () => {
    // A malformed table is a user-authoring reality, not a theoretical state.
    editor = makeEditor('<table><tbody><tr><td><p>only</p></td></tr></tbody></table>')
    caretInCell(editor, 0, 0)
    const ctx = tableContext(editor.state)!
    expect(ctx.cols).toBe(1)
    expect(ctx.col).toBe(0)
  })
})

describe('emptyTable', () => {
  it('builds a header row plus body rows', () => {
    const t = emptyTable(3, 2) as { content: { type: string }[] }
    expect(t.content).toHaveLength(3)
    expect(t.content[0]!.type).toBe('tableRow')
  })

  it('never produces a negative body row count', () => {
    const t = emptyTable(1, 1) as { content: unknown[] }
    expect(t.content).toHaveLength(1)
  })
})

describe('chessboard sizes', () => {
  it('offers a contiguous 2..8 grid', () => {
    expect([...CHESSBOARD_SIZES]).toEqual([2, 3, 4, 5, 6, 7, 8])
  })
})

describe('round trip through table edits', () => {
  it('serialises an inserted table back to GFM', async () => {
    const { htmlToBlocks } = await import('../src/core/htmlBridge')
    const { serialiseMarkdown } = await import('../src/core/markdown/serialise')

    const editor = makeEditor('<p>before</p>')
    editor
      .chain()
      .focus()
      .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
      .run()

    const blocks = htmlToBlocks(editor.getHTML())
    const { text } = serialiseMarkdown(null, blocks)
    expect(text).toMatch(/^\| /m)
    expect(text).toMatch(/\n\| --- \| --- \|\n/)
    expect(text).toContain('before')
  })

  it('preserves alignment after a row is added', async () => {
    const { htmlToBlocks } = await import('../src/core/htmlBridge')
    const { serialiseMarkdown } = await import('../src/core/markdown/serialise')

    const editor = makeEditor(
      '<table><tbody><tr><th style="text-align: center"><p>h</p></th></tr>' +
        '<tr><td><p>1</p></td></tr></tbody></table>',
    )
    caretInCell(editor, 0, 0)
    expect(tableContext(editor.state)!.align).toBe('center')

    editor.chain().addRowAfter().run()

    // The new row must inherit the column's alignment rather than resetting it.
    const { text } = serialiseMarkdown(null, htmlToBlocks(editor.getHTML()))
    expect(text).toContain(':---:')
  })
})