import { describe, expect, it } from 'vitest'
import {
  SLASH_GROUPS,
  SLASH_ITEMS,
  searchSlashItems,
  slashQueryPrefix,
} from '../src/features/slash/slashCommands'

describe('slashQueryPrefix', () => {
  it('triggers at the start of a block', () => {
    expect(slashQueryPrefix('/')).toBe('')
    expect(slashQueryPrefix('/hea')).toBe('hea')
  })

  it('triggers after whitespace', () => {
    expect(slashQueryPrefix('hello /table')).toBe('table')
  })

  it('does not trigger inside a word', () => {
    expect(slashQueryPrefix('a/b')).toBeNull()
    expect(slashQueryPrefix('path/folder')).toBeNull()
  })

  it('does not trigger after a space within the query', () => {
    // Once there is a space, it is no longer a single command.
    expect(slashQueryPrefix('/heading two')).toBeNull()
  })

  it('uses the last slash if several are present', () => {
    expect(slashQueryPrefix('/foo /bar')).toBe('bar')
  })

  it('returns null when there is no slash', () => {
    expect(slashQueryPrefix('hello')).toBeNull()
  })
})

describe('searchSlashItems', () => {
  it('returns everything for an empty query, so the menu opens full', () => {
    expect(searchSlashItems(SLASH_ITEMS, '')).toHaveLength(SLASH_ITEMS.length)
  })

  it('filters by label, prefix first', () => {
    const r = searchSlashItems(SLASH_ITEMS, 'hea')
    expect(r[0]?.id).toBe('h1')
    expect(r.map((i) => i.id)).toContain('h2')
    expect(r.map((i) => i.id)).toContain('h3')
  })

  it('does not return things that do not match', () => {
    expect(searchSlashItems(SLASH_ITEMS, 'qqzzzz')).toEqual([])
  })

  it('matches keywords', () => {
    const r = searchSlashItems(SLASH_ITEMS, 'todo')
    expect(r[0]?.id).toBe('list.task')
  })

  it('strips a leading slash if one is left in', () => {
    // Defensive: callers may pass the whole including-slash query.
    expect(searchSlashItems(SLASH_ITEMS, '/hea').map((i) => i.id)).toContain('h1')
  })

  it('every group is represented in the list', () => {
    const groups = new Set(SLASH_ITEMS.map((i) => i.group))
    expect(groups).toEqual(new Set(SLASH_GROUPS))
  })

  it('has no duplicate ids', () => {
    const ids = SLASH_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('prefers a direct label match over a keyword match', () => {
    const r = searchSlashItems(SLASH_ITEMS, 'quote')
    expect(r[0]?.id).toBe('quote')
  })
})