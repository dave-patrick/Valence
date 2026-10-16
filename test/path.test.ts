/**
 * Shared path helpers.
 *
 * This module exists because the codebase had three `dirname` implementations and they
 * disagreed. The specific contract worth locking down is root preservation: splitting a
 * path on separators and rejoining the pieces turns `/notes/a.md` into `notes`, and every
 * caller downstream then believes it is looking at a relative path.
 */

import { describe, expect, it } from 'vitest'
import {
  basename,
  basenameOf,
  dirname,
  dirnameOf,
  joinPath,
  normalise,
  relativePath,
  relativeSegments,
} from '../src/shared/path'

describe('normalise', () => {
  it('converts backslashes and drops trailing slashes', () => {
    expect(normalise('C:\\notes\\')).toBe('C:/notes')
    expect(normalise('/a/b/')).toBe('/a/b')
    expect(normalise('/a//b')).toBe('/a/b')
    expect(normalise('/a/b')).toBe('/a/b')
  })

  it('flattens the root, which is why joinPath handles it explicitly', () => {
    expect(normalise('/')).toBe('')
  })
})

describe('basename', () => {
  it('takes the last segment on either separator', () => {
    expect(basename('/a/b/c.md')).toBe('c.md')
    expect(basename('C:\\notes\\journal.md')).toBe('journal.md')
    expect(basename('c.md')).toBe('c.md')
  })

  it('keeps a dotfile whole', () => {
    // A leading dot is part of the name; stripping it would hide the file.
    expect(basename('/a/.gitignore')).toBe('.gitignore')
  })

  it('returns the input when there is nothing to strip', () => {
    expect(basename('')).toBe('')
  })
})

describe('dirname', () => {
  it('returns the parent directory', () => {
    expect(dirname('/a/b/c.md')).toBe('/a/b')
    expect(dirname('C:\\notes\\journal.md')).toBe('C:/notes')
    expect(dirname('c.md')).toBe('')
  })

  it('preserves the leading slash', () => {
    // The bug this guards. `dirname` used to split and rejoin, which yielded 'notes'
    // instead of '/notes' -- so every derived path looked relative and a directory
    // expansion built on top of it could expand nothing.
    expect(dirname('/notes/a.md')).toBe('/notes')
    expect(dirname('/notes')).toBe('/')
  })

  it('distinguishes the root from having no parent', () => {
    expect(dirname('/a.md')).toBe('/')
    expect(dirname('a.md')).toBe('')
  })

  it('keeps a Windows drive root', () => {
    expect(dirname('C:/notes/a.md')).toBe('C:/notes')
    expect(dirname('C:/a.md')).toBe('C:/')
  })
})

describe('the Of aliases', () => {
  it('agree with the canonical functions', () => {
    for (const p of ['/a/b/c.md', '/c.md', 'c.md', 'C:\\a\\b.md', '']) {
      expect(dirnameOf(p)).toBe(dirname(p))
      expect(basenameOf(p)).toBe(basename(p))
    }
  })
})

describe('joinPath', () => {
  it('joins without doubling separators', () => {
    expect(joinPath('/a', 'b.md')).toBe('/a/b.md')
    expect(joinPath('/a/', 'b.md')).toBe('/a/b.md')
    expect(joinPath('C:/a', 'b.md')).toBe('C:/a/b.md')
  })

  it('handles the root, which normalise flattens to an empty string', () => {
    expect(joinPath('/', 'a.md')).toBe('/a.md')
    expect(joinPath('', 'a.md')).toBe('a.md')
  })

  it('round-trips with dirname', () => {
    const joined = joinPath(dirname('/a/b/c.md'), 'c.md')
    expect(joined).toBe('/a/b/c.md')
  })
})

describe('relativeSegments', () => {
  it('resolves a path under the root', () => {
    expect(relativeSegments('/a', '/a/b/c.md')).toEqual(['b', 'c.md'])
    expect(relativeSegments('/a/b', '/a/b/c.md')).toEqual(['c.md'])
  })

  it('returns null outside the root rather than guessing', () => {
    expect(relativeSegments('/a', '/x/y.md')).toBeNull()
    expect(relativeSegments('/a/b', '/a')).toBeNull()
  })

  it('accepts either separator on both sides', () => {
    expect(relativeSegments('C:\\a', 'C:/a/b.md')).toEqual(['b.md'])
  })
})

describe('relativePath', () => {
  it('produces a same-folder sibling', () => {
    expect(relativePath('/a/b', '/a/b/c.md')).toBe('c.md')
  })

  it('climbs out of a folder', () => {
    expect(relativePath('/a/b', '/a/c/d.md')).toBe('../c/d.md')
    expect(relativePath('/a/b/c', '/a/d.md')).toBe('../../d.md')
  })

  it('refuses to climb out of the top-level folder', () => {
    // '../../d.md' would technically resolve, but a link that climbs to the filesystem root
    // and back down is not a link anyone wants inside a document — and the fallback
    // (the bare filename) is far more use than a broken relative chain.
    expect(relativePath('/a/b', '/d.md')).toBeNull()
    expect(relativePath('/notes', '/elsewhere/a.md')).toBeNull()
  })

  it('returns null when the two paths share no root', () => {
    // A chain of '..' climbing out of the vault is worse than the bare filename.
    expect(relativePath('/x/y', '/p/q/r.md')).toBeNull()
  })

  it('returns null when there is no source directory', () => {
    expect(relativePath('', '/a/b.png')).toBeNull()
  })

  it('is not confused by a shared prefix that is not a shared root', () => {
    // '/notes-old' and '/notes' share a string prefix but are unrelated directories.
    expect(relativePath('/notes-old/deep', '/notes/a.md')).toBeNull()
  })
})