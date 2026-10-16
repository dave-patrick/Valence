/**
 * Version history.
 *
 * Each snapshot is a full document capture, not a diff. A diff record would compress better,
 * but a full copy is (a) trivially restorable — copy the captured text back into the editor
 * and you are done — and (b) robust against the snapshot format never changing. A diff that
 * accumulates meaning depends on every version before it still being present; one missing file
 * corrupts the whole chain.
 *
 * Snapshots live beside the document under `.valence/<filename>/history.json`. Writing them
 * there means a sync tool (git, Dropbox, Syncthing) moves them with the note, and deleting a
 * note leaves its history with nothing pointing at it — the orphan is harmless and cheap.
 */

import { getPlatform } from '@platform'

export const MAX_SNAPSHOTS = 20

export interface Snapshot {
  ts: number
  source: string
}

export function snapshotPath(docPath: string): string {
  const dir = dirnameOf(docPath)
  const base = basenameOf(docPath).replace(/\.[^.]+$/, '')
  return dir ? `${dir}/.valence/${base}.history.json` : `.valence/${base}.history.json`
}

function dirnameOf(p: string): string {
  // Importing @shared/path from a feature module is fine, but the polymorphic
  // forms wind up with trailing slashes that trip the history path. Use the
  // local helper but never strip the root.
  const n = p.replace(/\\/g, '/')
  const i = n.lastIndexOf('/')
  if (i <= 0) return i === 0 ? '/' : ''
  return n.slice(0, i)
}

function basenameOf(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}

export async function loadSnapshots(docPath: string): Promise<Snapshot[]> {
  const platform = getPlatform()
  try {
    const raw = await platform.fs.read(snapshotPath(docPath))
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s): s is Snapshot => !!s && typeof s.ts === 'number' && typeof s.source === 'string')
      .sort((a, b) => b.ts - a.ts) // newest first
  } catch {
    return []
  }
}

export async function saveSnapshot(docPath: string, source: string): Promise<boolean> {
  const platform = getPlatform()
  const snaps = await loadSnapshots(docPath)
  if (snaps.length && snaps[0]!.source === source) return false // nothing changed

  snaps.push({ ts: Date.now(), source })
  // Newest-first, pruned.
  snaps.sort((a, b) => b.ts - a.ts)
  while (snaps.length > MAX_SNAPSHOTS) snaps.pop()

  try {
    await platform.fs.write(snapshotPath(docPath), JSON.stringify(snaps, null, 0))
    return true
  } catch {
    return false
  }
}

/** Human-readable relative age. Uses the caller's clock so tests can drive it. */
export function formatAge(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  if (diff < 60_000) return 'just now'
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`
  return `${Math.floor(diff / (24 * 60 * 60_000))}d ago`
}

export function snapshotLabel(ts: number, now = Date.now()): string {
  return new Date(ts).toLocaleString()
}