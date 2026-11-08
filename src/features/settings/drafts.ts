/**
 * Unsaved-work recovery.
 *
 * Edits that haven't been saved lived only in memory, so a crash, a forced restart or a power cut
 * lost them. A copy of every document with unsaved changes is now kept in the app's data folder
 * (`valence.drafts.json`, never beside the person's files) a moment after typing pauses, and the
 * next launch puts those changes back as unsaved edits. Saving or discarding clears the copy.
 */
import { getPlatform } from '@platform'
import { byId, fromPath, isDirty, open, untitled, update, type DocumentState, type Session } from '@core/session'

export const DRAFTS_KEY = 'valence.drafts.json'

export interface Draft {
  path: string | null
  title: string
  source: string
}

/** The documents with unsaved changes, as drafts. */
export function draftsOf(session: Session): Draft[] {
  return session.documents.filter(isDirty).map((d) => ({ path: d.path, title: d.title, source: d.source }))
}

/**
 * Puts drafts back into a session as unsaved edits. A draft for a file that is open takes over
 * its text; one for a file that isn't open opens it (`disk` is the file's current text, or null
 * if it is gone, in which case saving recreates it); an untitled draft opens as a new document.
 */
export function restoreDrafts(session: Session, drafts: readonly Draft[], disk: ReadonlyMap<string, string | null>): { session: Session; restored: number } {
  let next = session
  let restored = 0
  for (const draft of drafts) {
    if (typeof draft.source !== 'string') continue
    if (draft.path) {
      const openDoc = next.documents.find((d) => d.path === draft.path)
      if (openDoc) {
        if (openDoc.source === draft.source) continue
        next = update(next, openDoc.id, { source: draft.source })
      } else {
        const onDisk = disk.get(draft.path) ?? null
        if (onDisk === draft.source) continue
        const doc: DocumentState = { ...fromPath(draft.path, onDisk ?? ''), source: draft.source }
        next = open(next, doc)
      }
    } else {
      // Untitled: unsaved by definition, so `saved` is empty and the tab shows as changed.
      const doc: DocumentState = { ...untitled(draft.source), saved: '' }
      if (draft.title) doc.title = draft.title
      next = open(next, doc)
    }
    restored++
  }
  return { session: next.activeId && byId(next, next.activeId) ? next : { ...next, activeId: next.documents[0]?.id ?? '' }, restored }
}

export async function loadDrafts(): Promise<Draft[]> {
  try {
    // Usually there are none; checking first keeps a missing file out of the error log.
    if (!(await getPlatform().fs.exists(DRAFTS_KEY))) return []
    const parsed = JSON.parse(await getPlatform().fs.read(DRAFTS_KEY))
    return Array.isArray(parsed)
      ? parsed.filter((d): d is Draft => !!d && typeof d.source === 'string' && (d.path === null || typeof d.path === 'string'))
      : []
  } catch {
    return []
  }
}

let lastWritten = ''

/** Writes the current drafts (an empty list once everything is saved). Skips identical writes. */
export async function saveDrafts(session: Session): Promise<void> {
  const text = JSON.stringify(draftsOf(session))
  if (text === lastWritten) return
  try {
    await getPlatform().fs.write(DRAFTS_KEY, text)
    lastWritten = text
  } catch {
    /* recovery is best-effort; it must never interrupt writing */
  }
}
