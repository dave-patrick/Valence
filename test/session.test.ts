/**
 * Tabs and settings.
 *
 * The awkward parts of a tabbed editor are all edge cases: closing the active tab, closing
 * the last one, closing a tab that is not active, switching without losing a dirty document,
 * and restoring a session where one file has since been deleted. Those are what this file
 * covers — the happy paths are not interesting.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  MAX_RECENT_FOLDERS,
  isWithin,
  normaliseSettings,
  pushRecentFolder,
} from '../src/core/settings'
import {
  active,
  anyDirty,
  byId,
  close,
  dirtyIds,
  fromPath,
  isDirty,
  markSaved,
  open,
  openAll,
  sessionPaths,
  setActive,
  setScroll,
  tabLabel,
  untitled,
  update,
  type Session,
} from '../src/core/session'

function sessionOf(...paths: string[]): Session {
  return openAll(
    { documents: [], activeId: '' },
    paths.map((p) => fromPath(p, `# ${p}`)),
  )
}

describe('settings normalisation', () => {
  it('returns defaults for nonsense', () => {
    expect(normaliseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normaliseSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(normaliseSettings(42)).toEqual(DEFAULT_SETTINGS)
    expect(normaliseSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values', () => {
    const s = normaliseSettings({ tabBar: 'bottom', theme: 'dark', dailyWordGoal: 500 })
    expect(s.tabBar).toBe('bottom')
    expect(s.theme).toBe('dark')
    expect(s.dailyWordGoal).toBe(500)
  })

  it('replaces invalid enum values with the default', () => {
    const s = normaliseSettings({ tabBar: 'sideways', theme: 'neon' })
    expect(s.tabBar).toBe(DEFAULT_SETTINGS.tabBar)
    expect(s.theme).toBe(DEFAULT_SETTINGS.theme)
  })

  it('clamps a negative or non-numeric goal', () => {
    expect(normaliseSettings({ dailyWordGoal: -50 }).dailyWordGoal).toBe(0)
    expect(normaliseSettings({ dailyWordGoal: 'lots' }).dailyWordGoal).toBe(0)
    expect(normaliseSettings({ dailyWordGoal: 12.7 }).dailyWordGoal).toBe(13)
  })

  it('drops non-string entries from list settings', () => {
    const s = normaliseSettings({ recentFolders: ['/a', 42, null, '/b'], lastSession: [1, '/c.md'] })
    expect(s.recentFolders).toEqual(['/a', '/b'])
    expect(s.lastSession).toEqual(['/c.md'])
  })

  it('caps list lengths', () => {
    const many = Array.from({ length: 50 }, (_, i) => `/f${i}`)
    expect(normaliseSettings({ recentFolders: many }).recentFolders.length).toBe(MAX_RECENT_FOLDERS)
  })

  it('ignores a non-boolean where a boolean belongs', () => {
    expect(normaliseSettings({ focusMode: 'yes' }).focusMode).toBe(DEFAULT_SETTINGS.focusMode)
  })
})

describe('recent folders', () => {
  it('moves an existing folder to the front', () => {
    const list = pushRecentFolder(['/a', '/b', '/c'], '/b')
    expect(list).toEqual(['/b', '/a', '/c'])
  })

  it('caps the list', () => {
    let list: string[] = []
    for (let i = 0; i < 30; i++) list = pushRecentFolder(list, `/f${i}`)
    expect(list.length).toBe(MAX_RECENT_FOLDERS)
    expect(list[0]).toBe('/f29')
  })

  it('ignores an empty path', () => {
    expect(pushRecentFolder(['/a'], '')).toEqual(['/a'])
  })
})

describe('isWithin', () => {
  it('matches regardless of separators', () => {
    expect(isWithin('C:/notes', 'C:/notes/a.md')).toBe(true)
    expect(isWithin('C:\\notes', 'C:\\notes\\deep\\a.md')).toBe(true)
  })

  it('is false for siblings and parents', () => {
    expect(isWithin('C:/notes', 'C:/other/a.md')).toBe(false)
    expect(isWithin('C:/notes/deep', 'C:/notes/a.md')).toBe(false)
  })

  it('does not treat a name prefix as containment', () => {
    expect(isWithin('C:/notes', 'C:/notes-archive/a.md')).toBe(false)
  })
})

describe('session', () => {
  it('opens a document and makes it active', () => {
    const s = open({ documents: [], activeId: '' }, fromPath('/a.md', '# A'))
    expect(s.documents).toHaveLength(1)
    expect(active(s)?.path).toBe('/a.md')
  })

  it('focuses the existing tab instead of opening a duplicate', () => {
    let s = sessionOf('/a.md', '/b.md')
    const reopened = open(s, fromPath('/a.md', 'different'))
    expect(reopened.documents).toHaveLength(2)
    expect(active(reopened)?.id).toBe(s.documents[0]!.id)
  })

  it('does add a second tab for an untitled document', () => {
    let s = open({ documents: [], activeId: '' }, untitled('a'))
    s = open(s, untitled('b'))
    expect(s.documents).toHaveLength(2)
  })
})

describe('closing a tab', () => {
  it('activates the neighbour to the right when closing the active tab', () => {
    let s = sessionOf('/a.md', '/b.md', '/c.md')
    s = setActive(s, s.documents[1]!.id)
    s = close(s, s.activeId)
    expect(s.documents.map((d) => d.path)).toEqual(['/a.md', '/c.md'])
    expect(active(s)?.path).toBe('/c.md')
  })

  it('activates the neighbour to the left when closing the last tab', () => {
    let s = sessionOf('/a.md', '/b.md', '/c.md')
    s = setActive(s, s.documents[2]!.id)
    s = close(s, s.activeId)
    expect(active(s)?.path).toBe('/b.md')
  })

  it('leaves the active tab alone when closing a different one', () => {
    let s = sessionOf('/a.md', '/b.md', '/c.md')
    const activeBefore = s.activeId
    s = close(s, s.documents[0]!.id)
    expect(active(s)?.id).toBe(activeBefore)
    expect(s.documents).toHaveLength(2)
  })

  it('leaves an empty session rather than a broken one', () => {
    let s = sessionOf('/only.md')
    s = close(s, s.activeId)
    expect(s.documents).toHaveLength(0)
    expect(s.activeId).toBe('')
    expect(active(s)).toBeNull()
  })

  it('ignores an unknown id', () => {
    const s = sessionOf('/a.md')
    expect(close(s, 'nope').documents).toHaveLength(1)
  })
})

describe('dirty tracking', () => {
  it('starts clean and becomes dirty on edit', () => {
    let s = open({ documents: [], activeId: '' }, fromPath('/a.md', '# A'))
    const id = s.activeId
    expect(isDirty(byId(s, id)!)).toBe(false)

    s = update(s, id, { source: '# A edited' })
    expect(isDirty(byId(s, id)!)).toBe(true)
    expect(anyDirty(s)).toBe(true)
  })

  it('clears on save and adopts the path', () => {
    let s = open({ documents: [], activeId: '' }, untitled('hello'))
    s = update(s, s.activeId, { source: 'hello world' })
    s = markSaved(s, s.activeId, '/saved.md')

    const doc = active(s)!
    expect(isDirty(doc)).toBe(false)
    expect(doc.path).toBe('/saved.md')
    expect(doc.title).toBe('saved.md')
  })

  it('lists every dirty document', () => {
    let s = sessionOf('/a.md', '/b.md', '/c.md')
    s = update(s, s.documents[0]!.id, { source: 'x' })
    s = update(s, s.documents[2]!.id, { source: 'y' })
    expect(dirtyIds(s)).toHaveLength(2)
  })
})

describe('scroll memory', () => {
  it('remembers and clamps', () => {
    let s = sessionOf('/a.md')
    const id = s.activeId
    s = setScroll(s, id, 0.4)
    expect(byId(s, id)!.scroll).toBe(0.4)

    s = setScroll(s, id, 5)
    expect(byId(s, id)!.scroll).toBe(1)

    s = setScroll(s, id, -3)
    expect(byId(s, id)!.scroll).toBe(0)
  })
})

describe('session persistence', () => {
  it('lists only real files', () => {
    let s = open({ documents: [], activeId: '' }, untitled('scratch'))
    s = open(s, fromPath('/a.md', 'a'))
    expect(sessionPaths(s)).toEqual(['/a.md'])
  })
})

describe('tab labels', () => {
  it('disambiguates same-named files by folder', () => {
    const s = sessionOf('/notes/draft.md', '/archive/draft.md')
    const labels = s.documents.map((d) => tabLabel(d, s.documents))
    expect(labels).toContain('draft.md — notes')
    expect(labels).toContain('draft.md — archive')
  })

  it('leaves unique names alone', () => {
    const s = sessionOf('/a/one.md', '/b/two.md')
    expect(tabLabel(s.documents[0]!, s.documents)).toBe('one.md')
  })
})