/**
 * The document session: which files are open, which one is active, and what each one's
 * unsaved state is.
 *
 * Pure functions over an immutable state, so the awkward parts are testable without a DOM:
 * switching tabs without losing a dirty document, closing the active tab and picking a
 * sensible neighbour, and deciding whether a tab can actually be closed.
 */

import type { Settings } from './settings'

export interface DocumentState {
  /** Stable within a session; not a file id. */
  id: string
  /** Absolute path, or null for an untitled document. */
  path: string | null
  title: string
  source: string
  /** The text as last written to disk. Comparing against `source` is what makes a tab dirty. */
  saved: string
  /** Vertical scroll position as a fraction, restored when the tab is switched back to. */
  scroll: number
}

export interface Session {
  documents: DocumentState[]
  activeId: string
}

let counter = 0

/** Ids only need to be unique within a session, so a counter is enough. */
export function newId(): string {
  counter += 1
  return `doc-${counter}`
}

export function untitled(source = ''): DocumentState {
  return {
    id: newId(),
    path: null,
    title: 'Untitled',
    source,
    saved: source,
    scroll: 0,
  }
}

export function fromPath(path: string, source: string): DocumentState {
  return {
    id: newId(),
    path,
    title: basename(path),
    source,
    saved: source,
    scroll: 0,
  }
}

export function isDirty(doc: DocumentState): boolean {
  return doc.source !== doc.saved
}

export function isUntitled(doc: DocumentState): boolean {
  return doc.path === null
}

export function active(session: Session): DocumentState | null {
  return session.documents.find((d) => d.id === session.activeId) ?? null
}

export function byId(session: Session, id: string): DocumentState | null {
  return session.documents.find((d) => d.id === id) ?? null
}

/** Adds a document, or focuses the existing tab when the path is already open. */
export function open(session: Session, doc: DocumentState): Session {
  if (doc.path) {
    const existing = session.documents.find((d) => d.path === doc.path)
    if (existing) return { ...session, activeId: existing.id }
  }
  return { documents: [...session.documents, doc], activeId: doc.id }
}

/**
 * Removes a document and picks the next active tab.
 *
 * The neighbour choice is the part that matters: closing the middle tab should activate the
 * one to its right, closing the last should activate the one to its left, and closing the
 * final tab should leave an empty session rather than a broken one.
 */
export function close(session: Session, id: string): Session {
  const index = session.documents.findIndex((d) => d.id === id)
  if (index === -1) return session

  const documents = session.documents.filter((d) => d.id !== id)
  if (!documents.length) return { documents: [], activeId: '' }

  if (session.activeId !== id) return { ...session, documents }

  const next = documents[Math.min(index, documents.length - 1)]!
  return { documents, activeId: next.id }
}

export function setActive(session: Session, id: string): Session {
  if (!byId(session, id)) return session
  return { ...session, activeId: id }
}

/** Replaces a document's text, marking it dirty. */
export function update(
  session: Session,
  id: string,
  patch: Partial<Omit<DocumentState, 'id'>>,
): Session {
  return {
    ...session,
    documents: session.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  }
}

/** Records a successful write, clearing the dirty flag. */
export function markSaved(session: Session, id: string, path: string): Session {
  return {
    ...session,
    documents: session.documents.map((d) =>
      d.id === id ? { ...d, path, title: basename(path), saved: d.source } : d,
    ),
  }
}

export function setScroll(session: Session, id: string, scroll: number): Session {
  return {
    ...session,
    documents: session.documents.map((d) =>
      d.id === id ? { ...d, scroll: Math.max(0, Math.min(1, scroll)) } : d,
    ),
  }
}

export function anyDirty(session: Session): boolean {
  return session.documents.some(isDirty)
}

export function dirtyIds(session: Session): string[] {
  return session.documents.filter(isDirty).map((d) => d.id)
}

/** Path of every open document, for session persistence. Untitled tabs are not restorable. */
export function sessionPaths(session: Session): string[] {
  return session.documents.map((d) => d.path).filter((p): p is string => !!p)
}

/** Applies `open` repeatedly — used to restore a previous session. */
export function openAll(session: Session, docs: DocumentState[]): Session {
  return docs.reduce(open, session)
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** A tab label that disambiguates two files with the same name in different folders. */
export function tabLabel(doc: DocumentState, all: readonly DocumentState[]): string {
  const clash = all.filter((d) => d.title === doc.title)
  if (clash.length < 2 || !doc.path) return doc.title

  const folder = dirname(doc.path)
  return `${doc.title} — ${basename(folder)}`
}

function dirname(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  parts.pop()
  return parts.join('/') || '/'
}

export type { Settings }