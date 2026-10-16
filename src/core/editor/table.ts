/**
 * Table editing context.
 *
 * MarkText's table tooling is the best in the category and the largest thing Valence was
 * missing: a chessboard grid picker for inserting rows and columns, drag-to-resize, and a
 * row/column menu. This module supplies the *state* that UI needs — how big the table is,
 * which cell the caret is in, what that column is aligned to — computed from the ProseMirror
 * selection.
 *
 * It is deliberately pure and takes an `EditorState`, so the interesting logic is unit
 * tested without a DOM and without dispatching transactions.
 */

import type { EditorState } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import type { Node as ProseNode } from '@tiptap/pm/model'

export type Align = 'left' | 'center' | 'right' | null

export interface TableContext {
  /** Position of the `<table>` node, or null when the selection is not in a table. */
  pos: number
  rows: number
  cols: number
  /** Caret cell, zero-indexed. Null when the whole table is selected. */
  row: number | null
  col: number | null
  /** Alignment of the caret's column, from its first cell. */
  align: Align
  /** True when the caret's row is a header row. */
  inHeader: boolean
  /** True when the caret's column is entirely header cells. */
  colIsHeader: boolean
}

const NO_TABLE: TableContext | null = null

export function tableContext(state: EditorState): TableContext | null {
  const { selection } = state
  const $sel = selection.$from
  const depth = $sel.depth

  // Walk out to the nearest `table` ancestor.
  let tableDepth = -1
  for (let d = depth; d > 0; d--) {
    if ($sel.node(d).type.name === 'table') {
      tableDepth = d
      break
    }
  }
  if (tableDepth === -1) return NO_TABLE

  const table = $sel.node(tableDepth)
  const pos = $sel.before(tableDepth)
  const rows = table.childCount

  // Row and column are derived from position arithmetic rather than `$sel.index(depth)`.
  // That helper returns the index of the node *at* `depth` within its parent, which is one
  // level too high for the row and depends on how deep the caret happens to sit — both
  // wrong for a selection that spans cells. Counting node sizes is unambiguous for every
  // selection ProseMirror can produce.
  let rowPos = pos + 1
  let rowIndex = 0
  let rowNode = table.child(0)

  for (let r = 0; r < rows; r++) {
    const candidate = table.child(r)
    if ($sel.pos < rowPos + candidate.nodeSize) {
      rowIndex = r
      rowNode = candidate
      break
    }
    rowPos += candidate.nodeSize
    rowIndex = r + 1
  }

  const cellCount = rowNode?.childCount ?? 0
  let colPos = rowPos + 1
  let col = 0

  for (let c = 0; c < cellCount; c++) {
    const candidate = rowNode!.child(c)
    if ($sel.pos < colPos + candidate.nodeSize) {
      col = c
      break
    }
    colPos += candidate.nodeSize
    col = c + 1
  }
  if (cellCount) col = Math.min(col, cellCount - 1)

  const cell = rowNode?.child(col)
  const align = readAlign(cell)
  const inHeader = cell?.type.name === 'tableHeader'

  return {
    pos,
    rows,
    cols: cellCount,
    row: rowIndex,
    col,
    align,
    inHeader,
    colIsHeader: isColumnHeader(state.doc, pos, col),
  }
}

function readAlign(cell: ProseNode | null | undefined): Align {
  const v = cell?.attrs['align']
  return v === 'left' || v === 'center' || v === 'right' ? v : null
}

/**
 * A column counts as a header column when every cell in it is a `tableHeader` — which is
 * only possible when the first *two* rows are headers, matching how GFM writes a column
 * header to disk.
 */
function isColumnHeader(doc: ProseNode, tablePos: number, col: number): boolean {
  const table = doc.nodeAt(tablePos)
  if (!table) return false

  let rows = 0
  let headers = 0
  table.forEach((row) => {
    const cell = row.child(col)
    if (!cell) return
    rows++
    if (cell.type.name === 'tableHeader') headers++
  })

  return rows > 1 && headers === rows
}

/** Grid sizes offered by the chessboard picker. */
export const CHESSBOARD_SIZES = [2, 3, 4, 5, 6, 7, 8] as const

/**
 * Moves a column within a table.
 *
 * Returns a new table node, or null when the move is not safe. Merged cells are the hazard:
 * if any row has a different number of cells from the others, "column 2" means something
 * different in that row, and moving cells about would silently shred the table. Rather than
 * produce a mangled result, refuse — the UI keeps the indicator hidden for such tables and the
 * author can unmerge first.
 *
 * Cells carry their own `colwidth` and `align` attributes, which travel with them: dragging a
 * right-aligned column must not reset its alignment.
 */
export function reorderColumn(table: ProseNode, from: number, to: number): ProseNode | null {
  if (from === to) return null
  if (from < 0 || to < 0) return null

  const rows: ProseNode[] = []
  table.forEach((row) => rows.push(row))

  if (!rows.length) return null

  // Every row must be a plain row with the same number of cells.
  const width = rows[0]!.childCount
  for (const row of rows) {
    if (row.type.name !== 'tableRow' || row.childCount !== width) return null
  }
  if (from >= width || to >= width) return null

  const reordered = rows.map((row) => {
    const cells: ProseNode[] = []
    row.forEach((cell) => cells.push(cell))
    const [moved] = cells.splice(from, 1)
    if (!moved) return row
    cells.splice(to, 0, moved)
    return row.copy(Fragment.fromArray(cells))
  })

  return table.copy(Fragment.fromArray(reordered))
}

/**
 * Which column a horizontal offset falls into, by comparing against each header cell's
 * midpoint. Returns null when the point is outside the table or over a rowspan merged mess,
 * where a column cannot be identified unambiguously.
 */
export function columnAtOffset(tableDOM: HTMLElement, offsetX: number): number | null {
  const header = tableDOM.querySelector('tr')
  if (!header) return null

  const cells = Array.from(header.children) as HTMLElement[]
  for (const [i, cell] of cells.entries()) {
    const box = cell.getBoundingClientRect()
    // Compare against the row's own box so a scrolled or offset page does not matter.
    const rowBox = header.getBoundingClientRect()
    const localX = offsetX - rowBox.left
    if (localX >= box.left - rowBox.left && localX < box.right - rowBox.left) return i
  }
  return null
}

/** Builds an empty table document of the given shape, with a header row. */
export function emptyTable(rows: number, cols: number): Record<string, unknown> {
  const header = Array.from({ length: cols }, () => ({ type: 'tableHeader', content: [{ type: 'paragraph' }] }))
  const body = Array.from({ length: Math.max(0, rows - 1) }, () => ({
    type: 'tableRow',
    content: Array.from({ length: cols }, () => ({ type: 'tableCell', content: [{ type: 'paragraph' }] })),
  }))

  return {
    type: 'table',
    content: [{ type: 'tableRow', content: header }, ...body],
  }
}