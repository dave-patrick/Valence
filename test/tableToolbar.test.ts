/**
 * @vitest-environment jsdom
 *
 * The table toolbar component (M1.3).
 *
 * Mounted against a real Editor whose selection is placed by TipTap's own commands, which
 * is the only reliable way to get ProseMirror to enter a table — synthetic mouse events do
 * not drive `posAtCoords`, which is why this cannot be verified with dispatched clicks.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { createExtensions } from '../src/core/editor/extensions'
import { TableToolbar } from '../src/ui/TableToolbar'
import { tableContext } from '../src/core/editor/table'

const TABLE_HTML =
  '<table><tbody>' +
  '<tr><th style="text-align: center"><p>h1</p></th><th><p>h2</p></th></tr>' +
  '<tr><td><p>1</p></td><td><p>2</p></td></tr>' +
  '</tbody></table>'

let root: Root
let host: HTMLDivElement
let editor: Editor

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)

  editor = new Editor({
    extensions: createExtensions(),
    content: `<p>intro</p>${TABLE_HTML}<p>outro</p>`,
    element: document.createElement('div'),
  })
})

afterEach(() => {
  act(() => root.unmount())
  editor.destroy()
  host.remove()
})

/** `act` flushes effects and the state updates they schedule, so assertions after it are
 *  deterministic — a plain `setTimeout` is not, and these tests were flaky without it. */
async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(TableToolbar, { editor }))
  })
}

function labels(): string[] {
  return [...host.querySelectorAll('.valence-table-toolbar__btn')].map((b) =>
    b.getAttribute('aria-label') ?? '',
  )
}

/** Moves the selection into the first body cell using TipTap's own cell selection. */
function enterTable(): void {
  const doc = editor.state.doc
  let tablePos = -1
  doc.forEach((node, offset) => {
    if (node.type.name === 'table') tablePos = offset
  })
  if (tablePos === -1) throw new Error('no table in document')

  const table = doc.nodeAt(tablePos)!
  // Position of row 1 (first body row), column 0.
  const rowPos = tablePos + 1 + table.child(0).nodeSize + 1
  editor.commands.setTextSelection(rowPos + 1)
}

describe('TableToolbar', () => {
  it('renders nothing when the selection is outside a table', async () => {
    editor.commands.setTextSelection(1)
    await render()
    expect(host.querySelector('.valence-table-toolbar')).toBeNull()
  })

  it('appears once the selection enters a table', async () => {
    enterTable()
    expect(tableContext(editor.state)).not.toBeNull()

    await render()
    expect(host.querySelector('.valence-table-toolbar')).toBeTruthy()
  })

  it('offers the row, column, header and merge operations', async () => {
    enterTable()
    await render()
    const found = labels()
    expect(found).toContain('Insert row above')
    expect(found).toContain('Insert row below')
    expect(found).toContain('Delete row')
    expect(found).toContain('Insert column left')
    expect(found).toContain('Insert column right')
    expect(found).toContain('Delete column')
    expect(found).toContain('Toggle header row')
    expect(found).toContain('Toggle header column')
    expect(found).toContain('Merge or split the selected cells')
    expect(found).toContain('Delete table')
  })

  it('shows the current table shape', async () => {
    enterTable()
    await render()
    const shape = host.querySelector('.valence-table-toolbar__group--last button')
    expect(shape?.textContent).toMatch(/2×2/)
  })

  it('reports the caret column alignment', async () => {
    // Move to the header cell carrying centre alignment.
    const doc = editor.state.doc
    let tablePos = -1
    doc.forEach((node, offset) => {
      if (node.type.name === 'table') tablePos = offset
    })
    editor.commands.setTextSelection(tablePos! + 1 + 1)
    expect(tableContext(editor.state)!.align).toBe('center')

    await render()
    const align = host.querySelector('[aria-label^="Alignment"]')
    expect(align?.getAttribute('aria-label')).toContain('Center')
  })

  it('opens the chessboard and inserts the chosen grid', async () => {
    enterTable()
    await render()

    const boardBtn = host.querySelector<HTMLButtonElement>(
      '.valence-table-toolbar__group--last button',
    )!
    await act(async () => {
      boardBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const board = host.querySelector('.valence-chessboard')
    expect(board, 'chessboard should open').toBeTruthy()
    // Sizes 2..8 is seven steps, so a 7×7 grid of 49 cells.
    const cells = board!.querySelectorAll('.valence-chessboard__cell')
    expect(cells).toHaveLength(49)

    // "3 by 4" is index 1 (size 3) across, index 2 (size 4) down.
    const cell = cells[1 * 7 + 2] as HTMLButtonElement
    expect(cell.getAttribute('aria-label')).toBe('3 by 4 table')
    await act(async () => {
      cell.click()
    })

    // A table now exists somewhere in the document. Where it lands relative to the caret
    // (sibling vs. nested in the current cell) is a placement policy question, not a
    // question this component answers — it just forwards to `insertTable`.
    let tables = 0
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') tables++
    })
    expect(tables).toBe(2)
  })

  it('adds a row through the toolbar', async () => {
    enterTable()
    await render()
    const rowsBefore = tableContext(editor.state)!.rows

    const addRow = host.querySelector<HTMLButtonElement>('[aria-label="Insert row below"]')!
    await act(async () => {
      addRow.click()
    })

    expect(tableContext(editor.state)!.rows).toBe(rowsBefore + 1)
  })
})