import { describe, expect, it } from 'vitest'
import { isVaultDocument, scanVault } from '../src/features/workspace/scan'

describe('isVaultDocument', () => {
  it('accepts markdown extensions, off-disk noise excluded', () => {
    expect(isVaultDocument('notes/a.md')).toBe(true)
    expect(isVaultDocument('notes/a.MDX')).toBe(true)
    expect(isVaultDocument('notes/a.mdown')).toBe(true)
    expect(isVaultDocument('notes/a.txt')).toBe(true)
  })

  it('rejects non-documents', () => {
    expect(isVaultDocument('notes/logo.png')).toBe(false)
    expect(isVaultDocument('notes/a.exe')).toBe(false)
    expect(isVaultDocument('notes/noext')).toBe(false)
  })

  it('hides dotfiles and VCS/cache directories at any level', () => {
    expect(isVaultDocument('.git/config')).toBe(false)
    expect(isVaultDocument('notes/.hidden.md')).toBe(false)
    expect(isVaultDocument('node_modules/a/index.md')).toBe(false)
    expect(isVaultDocument('.obsidian/workspace.json')).toBe(false)
    expect(isVaultDocument('notes/.trash/junk.md')).toBe(false)
  })

  it('does not count the extension as part of a folder name', () => {
    // A directory called "bad.md" must not make every file inside it a candidate.
    expect(isVaultDocument('notes/a.md/foo.png')).toBe(false)
  })
})

describe('scanVault', () => {
  interface Entry { path: string; isDirectory: boolean }

  it('walks nested directories', async () => {
    const list = new Map<string, Entry[]>()
    list.set('/v', [
      { path: '/v/a.md', isDirectory: false },
      { path: '/v/sub', isDirectory: true },
    ])
    list.set('/v/sub', [{ path: '/v/sub/b.md', isDirectory: false }])

    const out = await scanVault('/v', async (p) => list.get(p) ?? [])
    expect(out.map((f) => f.relative)).toEqual(['a.md', 'sub/b.md'])
  })

  it('filters noise while still walking the rest', async () => {
    const list = new Map<string, Entry[]>()
    list.set('/v', [
      { path: '/v/.obsidian', isDirectory: true },
      { path: '/v/good.md', isDirectory: false },
      { path: '/v/noise/node_modules', isDirectory: true },
    ])
    list.set('/v/.obsidian', [{ path: '/v/.obsidian/x.md', isDirectory: false }])
    list.set('/v/noise/node_modules', [{ path: '/v/noise/node_modules/y.md', isDirectory: false }])

    const out = await scanVault('/v', async (p) => list.get(p) ?? [])
    expect(out.map((f) => f.relative)).toEqual(['good.md'])
  })

  it('survives a directory that cannot be listed', async () => {
    const list = new Map<string, Entry[]>()
    list.set('/v', [
      { path: '/v/ok.md', isDirectory: false },
      { path: '/v/broken', isDirectory: true },
    ])
    list.set('/v/broken', [] as never)

    // Override: make the broken directory throw.
    const orig = list.get.bind(list)
    const fixed = new Map(list)
    fixed.set('/v/broken', [] as any)
    const reader = async (p: string) => {
      if (p === '/v/broken') throw new Error(' denied')
      return fixed.get(p) ?? []
    }
    const out = await scanVault('/v', reader)
    expect(out.map((f) => f.relative)).toEqual(['ok.md'])
  })

  it('returns an empty list for an empty vault', async () => {
    const out = await scanVault('/v', async () => [])
    expect(out).toEqual([])
  })

  it('does not loop on a self-referential guard', async () => {
    const list = new Map<string, Entry[]>()
    list.set('/v', [{ path: '/v/a.md', isDirectory: false }])
    const out = await scanVault('/v', async (p) => list.get(p) ?? [])
    expect(out.length).toBe(1) // guarded by `seen`
  })

  it('ignores entries outside the root space', async () => {
    const list = new Map<string, Entry[]>()
    list.set('/v', [{ path: '/elsewhere/x.md', isDirectory: false }])
    const out = await scanVault('/v', async (p) => list.get(p) ?? [])
    expect(out).toEqual([])
  })

  it('sorts by relative path', async () => {
    const list = new Map<string, Entry[]>()
    list.set('/v', [
      { path: '/v/z.md', isDirectory: false },
      { path: '/v/a.md', isDirectory: false },
    ])
    const out = await scanVault('/v', async (p) => list.get(p) ?? [])
    expect(out.map((f) => f.relative)).toEqual(['a.md', 'z.md'])
  })
})