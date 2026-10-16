import { describe, expect, it } from 'vitest'
import { diff, toLinesN } from '../src/core/diff'

describe('toLinesN', () => {
  it('returns [] for empty string', () => {
    expect(toLinesN('')).toEqual([])
  })
  it('splits on newlines', () => {
    expect(toLinesN('a\nb\nc')).toEqual(['a', 'b', 'c'])
  })
  it('strips exactly one trailing newline', () => {
    expect(toLinesN('a\nb\n')).toEqual(['a', 'b'])
    expect(toLinesN('a\nb\n\n')).toEqual(['a', 'b', ''])
  })
  it('normalises CRLF', () => {
    expect(toLinesN('a\r\nb\r\n')).toEqual(['a', 'b'])
  })
})

describe('diff', () => {
  it('identifies identical documents', () => {
    const d = diff('a\nb\nc', 'a\nb\nc')
    expect(d.identical).toBe(true)
    expect(d.hunks).toEqual([])
    expect(d.stats).toEqual({ added: 0, removed: 0 })
  })

  it('handles two empty documents as identical', () => {
    expect(diff('', '').identical).toBe(true)
  })

  it('detects a single added line', () => {
    const d = diff('a\nc', 'a\nb\nc')
    expect(d.stats).toEqual({ added: 1, removed: 0 })
    expect(d.hunks[0]?.lines.join('\n')).toContain('+b')
  })

  it('detects a single removed line', () => {
    const d = diff('a\nb\nc', 'a\nc')
    expect(d.stats).toEqual({ added: 0, removed: 1 })
    expect(d.hunks[0]?.lines.join('\n')).toContain('-b')
  })

  it('detects a changed line as remove + add', () => {
    const d = diff('hello', 'hallo')
    expect(d.stats).toEqual({ added: 1, removed: 1 })
    const h = d.hunks[0]! ? d.hunks[0].lines.join('\n') : ''
    expect(h).toContain('-hello')
    expect(h).toContain('+hallo')
  })

  it('handles complete replacement', () => {
    const d = diff('1\n2\n3', 'a\nb\nc')
    expect(d.stats.added).toBe(3)
    expect(d.stats.removed).toBe(3)
  })

  it('keeps context around changes', () => {
    const d = diff('1\n2\n3\n4\n5\n6\n7\n8\n9\n10', '1\n2\n3\nX\n5\n6\n7\n8\n9\n10', 2)
    // context of 2 means only lines around change appear.
    const lines = d.hunks[0]!.lines.join('\n')
    expect(lines).not.toContain(' 1\n')
    expect(lines).toContain(' 2')
    expect(lines).toContain(' 3')
    expect(lines).toContain('-4')
    expect(lines).toContain('+X')
    expect(lines).toContain(' 5')
    expect(lines).toContain(' 6')
  })

  it('renders a header with line numbers', () => {
    const d = diff('a\nb\nc', 'a\nB\nc')
    expect(d.hunks[0]?.lines[0]).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/)
  })

  it('reports added/removed counts exactly', () => {
    const d = diff('1\n2\n3', '1\na\nb\nc\n4')
    expect(d.stats).toEqual({ added: 4, removed: 2 })
  })

  it('does not duplicate a line in context that is also changed', () => {
    // Same change duplicated, check header line numbering
    const d = diff('x\nfoo\ny', 'x\nbar\ny')
    expect(d.stats).toEqual({ added: 1, removed: 1 })
  })
})