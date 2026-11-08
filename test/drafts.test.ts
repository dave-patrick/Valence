/**
 * Unsaved-work recovery: edits that weren't saved come back after a crash or forced restart.
 */
import { describe, expect, it } from 'vitest'
import { fromPath, isDirty, open, untitled, type Session } from '../src/core/session'
import { draftsOf, restoreDrafts } from '../src/features/settings/drafts'

const empty: Session = { documents: [], activeId: '' }

describe('draftsOf', () => {
  it('keeps only documents with unsaved changes', () => {
    let s = open(empty, fromPath('/n/a.md', 'saved'))
    s = open(s, { ...fromPath('/n/b.md', 'old'), source: 'new' })
    expect(draftsOf(s)).toEqual([{ path: '/n/b.md', title: 'b.md', source: 'new' }])
  })
})

describe('restoreDrafts', () => {
  it('puts edits back into an open file as unsaved changes', () => {
    const s = open(empty, fromPath('/n/a.md', 'on disk'))
    const r = restoreDrafts(s, [{ path: '/n/a.md', title: 'a.md', source: 'edited' }], new Map())
    expect(r.restored).toBe(1)
    const doc = r.session.documents[0]!
    expect(doc.source).toBe('edited')
    expect(doc.saved).toBe('on disk')
    expect(isDirty(doc)).toBe(true)
  })

  it('opens a file that is not open, and recreates one that was deleted', () => {
    const r = restoreDrafts(empty, [
      { path: '/n/c.md', title: 'c.md', source: 'draft c' },
      { path: '/n/gone.md', title: 'gone.md', source: 'draft gone' },
    ], new Map([['/n/c.md', 'disk c'], ['/n/gone.md', null]]))
    expect(r.restored).toBe(2)
    expect(r.session.documents.map((d) => [d.path, d.source, d.saved])).toEqual([
      ['/n/c.md', 'draft c', 'disk c'],
      ['/n/gone.md', 'draft gone', ''],
    ])
    expect(r.session.activeId).toBeTruthy()
  })

  it('brings back untitled documents as unsaved', () => {
    const r = restoreDrafts(empty, [{ path: null, title: 'Untitled', source: '# idea' }], new Map())
    expect(r.session.documents[0]!.source).toBe('# idea')
    expect(isDirty(r.session.documents[0]!)).toBe(true)
  })

  it('skips drafts that match what is already there', () => {
    const s = open(empty, fromPath('/n/a.md', 'same'))
    expect(restoreDrafts(s, [{ path: '/n/a.md', title: 'a.md', source: 'same' }], new Map()).restored).toBe(0)
    expect(restoreDrafts(empty, [{ path: '/n/x.md', title: 'x', source: 'disk' }], new Map([['/n/x.md', 'disk']])).restored).toBe(0)
  })
})
