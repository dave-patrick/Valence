/**
 * Note display names.
 *
 * Found by screenshot: on Windows the backlinks panel's empty state read
 *
 *   No backlinks yet. Link to this note with [[C:\repos\Valence\README]].
 *
 * because the name was produced by splitting on `/` only. Windows paths use `\`, so the
 * "last segment" was the entire path. Both separators have to work, since the renderer is
 * handed whatever shape the platform produced.
 */

import { describe, expect, it } from 'vitest'
import { displayName } from '../src/features/wiki/display'

describe('displayName', () => {
  it('uses the final segment of a posix path', () => {
    expect(displayName('/home/u/notes/README.md')).toBe('README')
    expect(displayName('notes/deep/nested/Note.md')).toBe('Note')
  })

  it('uses the final segment of a windows path', () => {
    expect(displayName('C:\\repos\\Valence\\README.md')).toBe('README')
    expect(displayName('\\\\server\\share\\notes\\Note.md')).toBe('Note')
  })

  it('strips only the extension', () => {
    expect(displayName('/notes/a.b.c.md')).toBe('a.b.c')
    expect(displayName('/notes/archive.2024/notes')).toBe('notes')
  })

  it('handles a bare filename', () => {
    expect(displayName('README.md')).toBe('README')
    expect(displayName('README')).toBe('README')
  })

  it('never leaks a separator into the name', () => {
    for (const p of [
      'C:\\repos\\Valence\\README.md',
      '/home/u/notes/README.md',
      'C:\\a\\b\\c\\d\\e\\Deep.md',
      '/a/b/c/d/e/Deep.md',
    ]) {
      expect(displayName(p), p).not.toMatch(/[\\/]/)
    }
  })

  it('degrades gracefully on nothing', () => {
    expect(displayName(null)).toBe('this note')
    expect(displayName('')).toBe('this note')
  })
})