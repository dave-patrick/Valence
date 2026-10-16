/**
 * Column drag-to-reorder.
 *
 * The last piece of MarkText's table model. Drag a header cell sideways and the column
 * follows, with a drop indicator showing where it will land.
 *
 * Two deliberate design choices:
 *
 * 1. **The indicator is a decoration, not a DOM mutation.** ProseMirror owns this DOM;
 *    injecting a floating element into it is the same class of mistake that keeps MarkText's
 *    snabbdom layer crashing. A `Decoration.widget` on the target cell's left edge is
 *    inert, cannot be selected, and cannot enter the document.
 *
 * 2. **A drag only starts from a header cell, and only after a real threshold.** Without
 *    the threshold, every text selection inside a header would become a drag, which is
 *    exactly the kind of conflict that makes table editing feel hostile.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { reorderColumn, columnAtOffset } from './table'

export interface ColumnDragState {
  tablePos: number
  /** Column being dragged. */
  from: number
  /** Column it would land on, or null when the pointer is off the table. */
  to: number | null
  tableDOM: HTMLElement
}

export const columnDragKey = new PluginKey<ColumnDragState | null>('valence-column-drag')

/** Pointer travel, in pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 4

export const ColumnReorder = Extension.create({
  name: 'columnReorder',

  addProseMirrorPlugins() {
    return [new Plugin<ColumnDragState | null>({
      key: columnDragKey,

      state: {
        init: () => null,
        apply: (tr, value) => {
          // A document change mid-drag means the column indices are stale.
          if (tr.docChanged) return null
          if (!value) return null

          const meta = tr.getMeta(columnDragKey)
          return meta !== undefined ? (meta as ColumnDragState | null) : value
        },
      },

      props: {
        decorations(state) {
          const drag = columnDragKey.getState(state)
          if (!drag || drag.to === null || drag.from === drag.to) return DecorationSet.empty
          return dropIndicator(state.doc, drag)
        },

        // ProseMirror exposes only `handleDOMEvents` for raw listeners; `mousedown` is the
        // event we need because the drag threshold must be measured from the initial press.
        handleDOMEvents: {
          mousedown: (view, event) => onMouseDown(view, event as MouseEvent),
        },
      },
    })]
  },
})

function onMouseDown(view: EditorView, event: MouseEvent): boolean {
  const target = headerCellAt(event.target as HTMLElement | null)
  if (!target) return false

  const tableDOM = target.closest('table') as HTMLElement | null
  if (!tableDOM) return false

  // Only a plain, evenly-shaped table can be reordered safely — see `reorderColumn`.
  const tablePos = tablePosFor(view, tableDOM)
  if (tablePos === -1) return false

  const doc = view.state.doc.nodeAt(tablePos)
  if (!doc || !reorderable(doc)) return false

  const startX = event.clientX
  const from = columnIndexOf(target)

  let dragging = false
  let to: number | null = null

  const onMove = (e: MouseEvent) => {
    if (!dragging) {
      // Without a threshold, every text selection inside a header becomes a drag.
      if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD) return
      dragging = true
      tableDOM.classList.add('is-reordering')
      document.body.style.userSelect = 'none'
    }
    const next = columnAtOffset(tableDOM, e.clientX)
    if (next !== to) {
      to = next
      view.dispatch(view.state.tr.setMeta(columnDragKey, { tablePos, from, to, tableDOM }))
    }
  }

  const finish = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', finish)
    tableDOM.classList.remove('is-reordering')
    document.body.style.userSelect = ''

    if (dragging && to !== null && to !== from) applyMove(view, tablePos, from, to)
    view.dispatch(view.state.tr.setMeta(columnDragKey, null))
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', finish)
  return false
}

/** True when every row has the same number of cells, so columns line up. */
function reorderable(table: ProseNode): boolean {
  const width = table.childCount ? table.child(0).childCount : 0
  if (!width) return false
  for (let r = 0; r < table.childCount; r++) {
    const row = table.child(r)
    if (row.type.name !== 'tableRow' || row.childCount !== width) return false
  }
  return true
}

/** Applies the reorder, leaving the caret in the cell that moved. */
function applyMove(view: EditorView, tablePos: number, from: number, to: number): void {
  const table = view.state.doc.nodeAt(tablePos)
  if (!table) return

  const next = reorderColumn(table, from, to)
  if (!next) return

  view.dispatch(view.state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next))

  // Put the caret where the dragged content landed, so typing continues there.
  const updated = view.state.doc.nodeAt(tablePos)
  const row = updated?.child(0)
  if (!updated || !row) return

  let cellPos = tablePos + 1 + 1
  for (let i = 0; i < to && i < row.childCount; i++) cellPos += row.child(i).nodeSize
  try {
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(cellPos + 1), 1)))
  } catch {
    /* The moved cell has no text position; leave the selection where it is. */
  }
}

/** A vertical rule on the left edge of the column the drag would land on. */
function dropIndicator(doc: ProseNode, drag: ColumnDragState): DecorationSet {
  const table = doc.nodeAt(drag.tablePos)
  if (!table || drag.to === null) return DecorationSet.empty

  const decorations: Decoration[] = []
  table.forEach((row, rowOffset) => {
    if (!row.child(drag.to!)) return
    decorations.push(
      Decoration.widget(
        drag.tablePos + 1 + rowOffset + 1,
        () => {
          const el = document.createElement('span')
          el.className = 'valence-column-drop'
          el.contentEditable = 'false'
          return el
        },
        { side: -1, key: `drop:${rowOffset}` },
      ),
    )
  })

  return DecorationSet.create(doc, decorations)
}

function headerCellAt(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el
  while (node) {
    if (node.tagName === 'TH') return node
    if (node.tagName === 'TABLE') return null
    node = node.parentElement
  }
  return null
}

function columnIndexOf(cell: HTMLElement): number {
  const row = cell.parentElement
  if (!row) return 0
  return Array.from(row.children).indexOf(cell)
}

/**
 * Document position of the clicked table.
 *
 * Resolved through `posAtDOM` rather than by scanning for "the first table" — a document
 * with two tables would otherwise reorder the wrong one, which is the kind of bug that only
 * shows up once a user has written enough to matter.
 */
function tablePosFor(view: EditorView, tableDOM: HTMLElement): number {
  let pos = -1
  try {
    pos = view.posAtDOM(tableDOM, 0)
  } catch {
    return -1
  }
  // `posAtDOM` reports the nearest resolvable position; confirm it really is our table.
  const node = view.state.doc.nodeAt(pos)
  return node?.type.name === 'table' ? pos : -1
}