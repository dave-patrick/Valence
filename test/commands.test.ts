/**
 * Command matching.
 *
 * The palette is only as good as its ranking, and ranking is the part nobody looks at until it
 * is wrong. These tests pin the behaviour a person actually depends on: a prefix beats a
 * substring, a word-start beats mid-word, and a title match beats a keyword match.
 */

import { describe, expect, it } from 'vitest'
import {
  COMMANDS,
  COMMAND_GROUPS,
  commandById,
  fuzzyMatch,
  searchCommands,
  type CommandDef,
} from '../src/features/commands/commands'

describe('fuzzyMatch', () => {
  it('matches characters in order, not contiguously', () => {
    // The case the feature exists for: nothing here is a contiguous substring.
    expect(fuzzyMatch('expdf', 'Export as PDF')).not.toBeNull()
    expect(fuzzyMatch('eport', 'Export')).not.toBeNull()
  })

  it('returns null when the order cannot be satisfied', () => {
    expect(fuzzyMatch('txe', 'Export')).toBeNull()
    expect(fuzzyMatch('zzz', 'Export')).toBeNull()
  })

  it('cannot match a character the text does not contain at all', () => {
    // "Export as PDF" has no h, so an abbreviation like "phl" is not a match. Returning
    // something here would be worse than returning nothing: the user gets a command they
    // did not ask for.
    expect(fuzzyMatch('exp phl', 'Export as PDF')).toBeNull()
  })

  it('treats spaces in the query as separators, not characters to match', () => {
    // e, x, p, t against "Export" — the space is dropped, the rest still matches.
    expect(fuzzyMatch('ex pt', 'Export')?.indices).toEqual([0, 1, 2, 5])
  })

  it('scores a prefix above a mid-word match', () => {
    const prefix = fuzzyMatch('exp', 'Export as PDF')!.score
    const midWord = fuzzyMatch('exp', 'Text expander')!.score
    expect(prefix).toBeGreaterThan(midWord)
  })

  it('scores a word-start above a mid-word start', () => {
    // "pd" should favour the PDF at the end of "Export as PDF" over the "pd" that only
    // exists by accident across "Copy and paste".
    const atStart = fuzzyMatch('pd', 'Export as PDF')!.score
    const inside = fuzzyMatch('pd', 'Copy and paste')!.score
    expect(atStart).toBeGreaterThan(inside)
  })

  it('rewards consecutive characters above word starts', () => {
    // The inversion that matters. Word starts are common in prose, so a generous word-start
    // bonus lets "port" rank "p o r t placeholder" above "Export", which is nonsense.
    const run = fuzzyMatch('port', 'Export')!.score
    const spread = fuzzyMatch('port', 'p o r t placeholder')!.score
    expect(run).toBeGreaterThan(spread)
  })

  it('skips an earlier match when a later one starts the match better', () => {
    // Leftmost-greedy would take the p in "Ex**p**ort". Matching the P in "P**DF**" both
    // scores higher and is what the user meant.
    const m = fuzzyMatch('pdf', 'Export as PDF')!
    expect(m.indices).toEqual([10, 11, 12])
  })

  it('reports the indices it matched so the UI can emphasise them', () => {
    expect(fuzzyMatch('exp', 'Export as PDF')?.indices).toEqual([0, 1, 2])
  })

  it('matches everything against an empty query', () => {
    expect(fuzzyMatch('', 'Anything')).toEqual({ score: 0, indices: [] })
  })

  it('cannot match a non-empty query against empty text', () => {
    expect(fuzzyMatch('a', '')).toBeNull()
  })
})

describe('searchCommands', () => {
  it('returns everything in declaration order for an empty query', () => {
    const r = searchCommands(COMMANDS, '')
    expect(r).toHaveLength(COMMANDS.length)
    expect(r.map((c) => c.id)).toEqual(COMMANDS.map((c) => c.id))
  })

  it('finds a command by its title', () => {
    const r = searchCommands(COMMANDS, 'export')
    expect(r[0]?.id).toBe('file.export')
  })

  it('finds a command by a keyword it does not display', () => {
    // "word" appears only in Export's keywords.
    const r = searchCommands(COMMANDS, 'word')
    expect(r.map((c) => c.id)).toContain('file.export')
  })

  it('prefers a title match over a better-scoring keyword match', () => {
    const r = searchCommands(COMMANDS, 'view')
    expect(r[0]?.id.startsWith('view.')).toBe(true)
  })

  it('separates the view commands from each other', () => {
    const r = searchCommands(COMMANDS, 'view source')
    expect(r[0]?.id).toBe('view.source')
  })

  it('returns nothing rather than everything when there is no match', () => {
    expect(searchCommands(COMMANDS, 'qqqqqq')).toEqual([])
  })

  it('is stable for equal scores', () => {
    const a = searchCommands(COMMANDS, 'toggle').map((c) => c.id)
    const b = searchCommands(COMMANDS, 'toggle').map((c) => c.id)
    expect(a).toEqual(b)
  })

  it('emphasises only title matches, never keyword matches', () => {
    const r = searchCommands(COMMANDS, 'docx')
    for (const c of r) {
      if (c.id === 'file.export') expect(c.indices).toEqual([])
    }
  })
})

describe('the registry', () => {
  it('has no duplicate ids, since dispatch is keyed on them', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('declares every group it lists, and no others', () => {
    const declared = new Set(COMMANDS.map((c) => c.group))
    for (const g of COMMAND_GROUPS) expect(declared.has(g)).toBe(true)
    for (const g of declared) expect(COMMAND_GROUPS).toContain(g)
  })

  it('gives every command a title and an id in dotted form', () => {
    for (const c of COMMANDS) {
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.id).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
    }
  })

  it('does not advertise a shortcut twice', () => {
    const bound = COMMANDS.map((c) => c.keys).filter(Boolean)
    expect(new Set(bound).size).toBe(bound.length)
  })

  it('looks commands up by id', () => {
    expect(commandById('file.export')?.title).toBe('Export')
    expect(commandById('nope')).toBeUndefined()
  })

  it('can be searched as a plain list, with no app state involved', () => {
    const custom: CommandDef[] = [{ id: 'x.y', title: 'Zebra', group: 'Test' }]
    expect(searchCommands(custom, 'zebra')[0]?.id).toBe('x.y')
  })
})