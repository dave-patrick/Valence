/** Source history stores changes, rather than a copy of the document per keystroke. */
export interface TextEdit {
  from: number
  removed: string
  inserted: string
  group: string | null
}

export interface TextHistory {
  present: string
  past: TextEdit[]
  /** The last entry is the next change to redo. */
  future: TextEdit[]
}

const MAX_EDITS = 200
const MAX_BYTES = 4 * 1024 * 1024
const bytes = (edit: TextEdit) => 2 * (edit.removed.length + edit.inserted.length)

export function createTextHistory(present: string): TextHistory {
  return { present, past: [], future: [] }
}

function difference(before: string, after: string, group: string | null): TextEdit {
  let from = 0
  while (from < before.length && from < after.length && before[from] === after[from]) from++
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > from && endAfter > from && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }
  return { from, removed: before.slice(from, endBefore), inserted: after.slice(from, endAfter), group }
}

function apply(text: string, edit: TextEdit, undo: boolean): string {
  const removed = undo ? edit.inserted : edit.removed
  const inserted = undo ? edit.removed : edit.inserted
  return text.slice(0, edit.from) + inserted + text.slice(edit.from + removed.length)
}

/** Keep the nearest changes, including one oversized change so it remains undoable. */
function bounded(history: TextHistory): TextHistory {
  const { past, future } = history
  let size = [...past, ...future].reduce((sum, edit) => sum + bytes(edit), 0)
  while (past.length + future.length > 1 && (past.length + future.length > MAX_EDITS || size > MAX_BYTES)) {
    // Older applied changes are discarded first, then the furthest redo changes.
    const removed = past.length ? past.shift()! : future.shift()!
    size -= bytes(removed)
  }
  return history
}

export function recordTextEdit(history: TextHistory, next: string, group: string | null = null): TextHistory {
  // A no-op must not invalidate Redo (e.g. a controlled textarea's repeated input).
  if (next === history.present) return history
  const past = [...history.past]
  const previous = past.at(-1)
  const baseline = group !== null && previous?.group === group
    ? apply(history.present, past.pop()!, true) : history.present
  if (next !== baseline) past.push(difference(baseline, next, group))
  return bounded({ present: next, past, future: [] })
}

export function undoTextEdit(history: TextHistory): { history: TextHistory; caret: number | null } {
  const edit = history.past.at(-1)
  if (!edit) return { history, caret: null }
  return {
    history: bounded({ present: apply(history.present, edit, true), past: history.past.slice(0, -1), future: [...history.future, edit] }),
    caret: edit.from + edit.removed.length,
  }
}

export function redoTextEdit(history: TextHistory): { history: TextHistory; caret: number | null } {
  const edit = history.future.at(-1)
  if (!edit) return { history, caret: null }
  return {
    history: bounded({ present: apply(history.present, edit, false), past: [...history.past, edit], future: history.future.slice(0, -1) }),
    caret: edit.from + edit.inserted.length,
  }
}
