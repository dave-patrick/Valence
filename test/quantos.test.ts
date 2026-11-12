import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prepareQuantosDocument } from '../src/core/quantos'
import { inspectQuantosVault, moveToQuantos } from '../src/main/quantos'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'valence-quantos-')); roots.push(root)
  const nodes = path.join(root, 'workspaces', 'home', 'nodes'); await fs.mkdir(nodes, { recursive: true })
  return { root, nodes, request: { root, workspace: 'home', title: 'Note', source: '# edited', saved: '# original', path: null as string | null } }
}
describe('Quantos document preparation', () => {
  it('preserves existing Markdown and IDs byte for byte', () => {
    const source = '---\r\nid: stable\r\ntitle: Note\r\n---\r\nbody\r\n'
    expect(prepareQuantosDocument({ title: 'CON.md', source, path: 'x.md' })).toEqual({ stem: '_CON', content: source })
  })
  it('strips only untitled top-level IDs and retains body line endings', () => {
    const result = prepareQuantosDocument({ title: 'A', source: '---\r\nid: old\r\nnested:\r\n  id: keep\r\n---\r\nbody\r\n', path: null })
    expect(result.content).not.toContain('id: old'); expect(result.content).toContain('  id: keep'); expect(result.content).toContain('---\r\nbody\r\n')
  })
  it('rejects malformed, non-map and unmatched front matter', () => {
    for (const source of ['---\n[id\n---\n', '---\n- item\n---\n', '---\nid: x']) expect(() => prepareQuantosDocument({ title: 'A', source, path: null })).toThrow()
  })
  it('wraps raw text in a sufficiently long fence and sanitizes names', () => {
    const result = prepareQuantosDocument({ title: '../a:bad', source: 'raw\r\n````end', path: 'x.txt' })
    expect(result.stem).not.toMatch(/[/:]/); expect(result.content).toContain('`````txt\nraw\r\n````end\n`````')
    expect(prepareQuantosDocument({ title: 'a'.repeat(200), source: '', path: null }).stem).toHaveLength(100)
  })
})
describe('Quantos moves', () => {
  it('moves edited content and retains a byte-identical original recovery file', async () => {
    const { root, request } = await setup(); request.path = path.join(root, 'original.md'); await fs.writeFile(request.path, request.saved)
    const result = await moveToQuantos(request)
    expect(await fs.readFile(result.path, 'utf8')).toBe(request.source)
    expect(await fs.readFile(result.recoveryPath!, 'utf8')).toBe(request.saved)
    await expect(fs.stat(request.path)).rejects.toThrow()
  })
  it('publishes unsaved documents concurrently without overwriting', async () => {
    const { request, nodes } = await setup()
    const results = await Promise.all([moveToQuantos(request), moveToQuantos(request)])
    expect(new Set(results.map(result => result.path)).size).toBe(2)
    expect((await fs.readdir(nodes)).sort()).toEqual(['Note-2.md', 'Note.md'])
  })
  it('rejects changed source without mutation', async () => {
    const { root, request, nodes } = await setup(); request.path = path.join(root, 'source.md'); await fs.writeFile(request.path, 'external')
    await expect(moveToQuantos(request)).rejects.toThrow('changed on disk')
    expect(await fs.readFile(request.path, 'utf8')).toBe('external'); expect(await fs.readdir(nodes)).toEqual([])
  })
  it('requires existing vaults and workspaces and rejects traversal', async () => {
    const { root, request } = await setup()
    expect(await inspectQuantosVault(root)).toEqual(['home'])
    await expect(moveToQuantos({ ...request, workspace: '../escape' })).rejects.toThrow()
    await expect(moveToQuantos({ ...request, workspace: 'missing' })).rejects.toThrow()
    await expect(inspectQuantosVault(path.join(root, 'missing'))).rejects.toThrow()
  })
  it('rejects an escaping workspace symlink', async () => {
    const { root, request } = await setup(); const external = await fs.mkdtemp(path.join(os.tmpdir(), 'valence-outside-')); roots.push(external)
    await fs.mkdir(path.join(external, 'nodes')); await fs.symlink(external, path.join(root, 'workspaces', 'escape'), 'junction')
    await expect(moveToQuantos({ ...request, workspace: 'escape' })).rejects.toThrow('escaping')
  })
  it('restores the original when publishing a hard link fails', async () => {
    const { root, request, nodes } = await setup(); request.path = path.join(root, 'source.md'); await fs.writeFile(request.path, request.saved)
    const link = fs.link
    vi.spyOn(fs, 'link').mockImplementation(async (source, target) => {
      if (String(source).endsWith('.tmp')) throw new Error('injected publish failure')
      return link(source, target)
    })
    await expect(moveToQuantos(request)).rejects.toThrow('injected publish failure')
    expect(await fs.readFile(request.path, 'utf8')).toBe(request.saved); expect(await fs.readdir(nodes)).toEqual([])
  })
  it('retains recovery when a new source file blocks rollback', async () => {
    const { root, request } = await setup(); request.path = path.join(root, 'source.md'); await fs.writeFile(request.path, request.saved)
    const link = fs.link
    vi.spyOn(fs, 'link').mockImplementation(async (source, target) => {
      if (String(source).endsWith('.tmp')) { await fs.writeFile(request.path!, 'new occupant'); throw new Error('publish failed') }
      return link(source, target)
    })
    await expect(moveToQuantos(request)).rejects.toThrow('original is preserved at')
    expect(await fs.readFile(request.path, 'utf8')).toBe('new occupant')
    const backup = (await fs.readdir(root)).find(name => name.endsWith('.bak'))!
    expect(await fs.readFile(path.join(root, backup), 'utf8')).toBe(request.saved)
  })
  it('detects an external edit made while creating the temporary document', async () => {
    const { root, request, nodes } = await setup(); request.path = path.join(root, 'source.md'); await fs.writeFile(request.path, request.saved)
    const open = fs.open
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args)
      if (String(args[0]).endsWith('.tmp')) await fs.writeFile(request.path!, 'external edit')
      return handle
    })
    await expect(moveToQuantos(request)).rejects.toThrow('changed on disk')
    expect(await fs.readFile(request.path, 'utf8')).toBe('external edit'); expect(await fs.readdir(nodes)).toEqual([])
  })
  it('returns committed success even when temporary cleanup fails', async () => {
    const { request } = await setup(); const unlink = fs.unlink
    vi.spyOn(fs, 'unlink').mockImplementation(async location => {
      if (String(location).endsWith('.tmp')) throw new Error('cleanup failed')
      return unlink(location)
    })
    const result = await moveToQuantos(request)
    expect(await fs.readFile(result.path, 'utf8')).toBe(request.source)
  })
})
