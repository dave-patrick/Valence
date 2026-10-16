/**
 * Workspace tree.
 *
 * The logic worth testing is path handling: splitting, relative resolution, and the
 * collapsing that decides what a person actually sees in the sidebar.
 */

import { describe, expect, it } from 'vitest'
import {
  basename,
  buildTree,
  dirname,
  expandedFor,
  filterTree,
  flatten,
  isDocument,
  isIgnored,
  joinPath,
  normalise,
  relativeSegments,
  type FileEntry,
} from '../src/features/files/tree'

const f = (path: string): FileEntry => ({ path, isDirectory: false, size: 10 })
const d = (path: string): FileEntry => ({ path, isDirectory: true })

describe('path helpers', () => {
  it('normalises separators and trailing slashes', () => {
    expect(normalise('C:\\notes\\')).toBe('C:/notes')
    expect(normalise('/a/b/')).toBe('/a/b')
    expect(normalise('/a/b')).toBe('/a/b')
  })

  it('splits basename and dirname on either separator', () => {
    expect(basename('/a/b/c.md')).toBe('c.md')
    expect(dirname('/a/b/c.md')).toBe('/a/b')
    expect(dirname('c.md')).toBe('')
  })

  it('keeps the root rather than turning absolute paths relative', () => {
    // The bug this guards: splitting on '/' and rejoining drops the leading slash, which
    // made every tree path relative and collapsed `expandedFor` to nothing.
    expect(dirname('/file.md')).toBe('/')
    expect(dirname('/a')).toBe('/')
    expect(joinPath('/', 'a.md')).toBe('/a.md')
    expect(joinPath(dirname('/a/b.md'), 'c.md')).toBe('/a/c.md')
  })

  it('joins without doubling separators', () => {
    expect(joinPath('/a', 'b.md')).toBe('/a/b.md')
    expect(joinPath('/a/', 'b.md')).toBe('/a/b.md')
    expect(joinPath('', 'b.md')).toBe('b.md')
  })

  it('resolves a relative path under the root', () => {
    expect(relativeSegments('/a', '/a/b/c.md')).toEqual(['b', 'c.md'])
    expect(relativeSegments('/a/b', '/a/b/c.md')).toEqual(['c.md'])
  })

  it('returns null for a path outside the root', () => {
    expect(relativeSegments('/a', '/x/y.md')).toBeNull()
    expect(relativeSegments('/a/b', '/a')).toBeNull()
  })
})

describe('document detection', () => {
  it('accepts markdown extensions, case-insensitively', () => {
    expect(isDocument('a.md')).toBe(true)
    expect(isDocument('a.MARKDOWN')).toBe(true)
    expect(isDocument('a.mdown')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isDocument('a.png')).toBe(false)
    expect(isDocument('a.exe')).toBe(false)
    expect(isDocument('noext')).toBe(false)
  })

  it('hides dotfiles and known noise', () => {
    expect(isIgnored('.git')).toBe(true)
    expect(isIgnored('node_modules')).toBe(true)
    expect(isIgnored('.DS_Store')).toBe(true)
    expect(isIgnored('notes.md')).toBe(false)
  })
})

describe('buildTree', () => {
  it('nests by path segments', () => {
    const tree = buildTree('/n', [f('/n/a.md'), f('/n/sub/b.md'), f('/n/sub/deep/c.md')])
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual(['dir:sub', 'file:a.md'])

    const sub = tree[0]!
    if (sub.kind === 'dir') {
      expect(sub.children.map((n) => `${n.kind}:${n.name}`)).toEqual(['dir:deep', 'file:b.md'])
    }
  })

  it('puts directories before files, each alphabetical', () => {
    const tree = buildTree('/n', [f('/n/z.md'), f('/n/a.md'), f('/n/m/b.md')])
    expect(tree.map((n) => n.name)).toEqual(['m', 'a.md', 'z.md'])
  })

  it('ignores non-documents and dotfiles', () => {
    const tree = buildTree('/n', [f('/n/a.md'), f('/n/logo.png'), f('/n/.hidden.md')])
    expect(tree.map((n) => n.name)).toEqual(['a.md'])
  })

  it('skips paths outside the root', () => {
    const tree = buildTree('/n', [f('/n/a.md'), f('/elsewhere/b.md')])
    expect(tree.map((n) => n.name)).toEqual(['a.md'])
  })

  it('accepts Windows separators', () => {
    const tree = buildTree('C:\\n', [{ path: 'C:\\n\\a.md', isDirectory: false }])
    expect(tree).toHaveLength(1)
    expect(tree[0]!.name).toBe('a.md')
  })

  it('returns an empty tree for an empty listing', () => {
    expect(buildTree('/n', [])).toEqual([])
  })

  it('does not show empty directories', () => {
    const tree = buildTree('/n', [d('/n/empty'), f('/n/a.md')])
    expect(tree.map((n) => n.name)).toEqual(['a.md'])
  })
})

describe('filterTree', () => {
  const tree = buildTree('/n', [
    f('/n/alpha.md'),
    f('/n/beta.md'),
    f('/n/2026/journal.md'),
    f('/n/2026/notes.md'),
  ])

  it('returns everything for an empty query', () => {
    expect(filterTree(tree, '')).toHaveLength(tree.length)
  })

  it('keeps only matching files', () => {
    const r = filterTree(tree, 'alpha')
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('alpha.md')
  })

  it('keeps a directory whose name matches, with its contents', () => {
    const r = filterTree(tree, '2026')
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('2026')
    if (r[0]!.kind === 'dir') expect(r[0]!.children).toHaveLength(2)
  })

  it('keeps a directory that still contains a match', () => {
    const r = filterTree(tree, 'journal')
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('2026')
  })

  it('drops a directory with no matches at all', () => {
    expect(filterTree(tree, 'nothing-here')).toHaveLength(0)
  })

  it('matches case-insensitively', () => {
    expect(filterTree(tree, 'ALPHA')).toHaveLength(1)
  })
})

describe('flatten', () => {
  it('emits rows with depth', () => {
    const tree = buildTree('/n', [f('/n/a.md'), f('/n/sub/b.md')])
    const rows = flatten(tree)
    expect(rows.map((r) => `${r.depth}:${r.node.name}`)).toEqual([
      '0:sub',
      '1:b.md',
      '0:a.md',
    ])
  })
})

describe('expandedFor', () => {
  it('opens every ancestor of the given paths', () => {
    const out = expandedFor(['/n/2026/q1/journal.md'], new Set())
    expect(out.has('/n')).toBe(true)
    expect(out.has('/n/2026')).toBe(true)
    expect(out.has('/n/2026/q1')).toBe(true)
  })

  it('does not include the file itself', () => {
    const out = expandedFor(['/n/a.md'], new Set())
    expect(out.has('/n/a.md')).toBe(false)
  })

  it('preserves directories the user opened by hand', () => {
    const manual = new Set(['/n/manual'])
    expect(expandedFor(['/n/a.md'], manual).has('/n/manual')).toBe(true)
  })

  it('terminates rather than looping at the root', () => {
    const out = expandedFor(['/a.md'], new Set())
    expect(out.size).toBeGreaterThan(0)
    expect([...out].every((p) => typeof p === 'string')).toBe(true)
  })
})