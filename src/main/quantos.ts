import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prepareQuantosDocument } from '../core/quantos'
import type { QuantosMoveRequest, QuantosMoveResult } from '../core/quantos'

const workspacePattern = /^[a-z0-9][a-z0-9_-]{0,63}$/
function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
async function directory(location: string, parent?: string): Promise<string> {
  const resolved = await fs.realpath(location)
  if (!(await fs.stat(resolved)).isDirectory() || (parent && !within(parent, resolved))) throw new Error(`Invalid or escaping Quantos directory: ${location}`)
  return resolved
}
async function vault(root: string): Promise<{ root: string; workspaces: string }> {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Choose an existing absolute Quantos vault folder.')
  const realRoot = await directory(root)
  return { root: realRoot, workspaces: await directory(path.join(realRoot, 'workspaces'), realRoot) }
}
export async function inspectQuantosVault(root: string): Promise<string[]> {
  const locations = await vault(root)
  const result: string[] = []
  for (const entry of await fs.readdir(locations.workspaces)) {
    if (!workspacePattern.test(entry)) continue
    try {
      const workspace = await directory(path.join(locations.workspaces, entry), locations.workspaces)
      await directory(path.join(workspace, 'nodes'), workspace)
      result.push(entry)
    } catch { /* Incomplete or escaping workspaces are not selectable. */ }
  }
  return result.sort()
}
export async function moveToQuantos(request: QuantosMoveRequest): Promise<QuantosMoveResult> {
  if (!request || typeof request !== 'object' || ['root', 'workspace', 'title', 'source', 'saved'].some(key => typeof request[key as keyof QuantosMoveRequest] !== 'string') || (request.path !== null && typeof request.path !== 'string')) throw new Error('Invalid Quantos move request.')
  if (!workspacePattern.test(request.workspace)) throw new Error('Invalid Quantos workspace name.')
  const locations = await vault(request.root)
  const workspace = await directory(path.join(locations.workspaces, request.workspace), locations.workspaces)
  const destination = await directory(path.join(workspace, 'nodes'), workspace)
  const prepared = prepareQuantosDocument(request)
  let original: string | undefined
  if (request.path !== null) {
    if (!path.isAbsolute(request.path)) throw new Error('The source file must have an absolute path.')
    const stat = await fs.lstat(request.path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The source must be a regular file, not a symbolic link.')
    original = path.join(await fs.realpath(path.dirname(request.path)), path.basename(request.path))
    if (path.dirname(original) === destination) throw new Error('This document is already in that Quantos workspace. Choose another workspace.')
    if (await fs.readFile(original, 'utf8') !== request.saved) throw new Error('The source changed on disk. Reload it before moving.')
  }
  const temporary = path.join(destination, `.valence-${randomUUID()}.tmp`)
  let backup: string | undefined
  let committed = false
  try {
    const handle = await fs.open(temporary, 'wx', 0o600)
    try { await handle.writeFile(prepared.content, 'utf8'); await handle.sync() } finally { await handle.close() }
    if (original) {
      const latest = await fs.lstat(original)
      if (!latest.isFile() || latest.isSymbolicLink()) throw new Error('The source is no longer a regular file. Reload it before moving.')
      if (await fs.readFile(original, 'utf8') !== request.saved) throw new Error('The source changed on disk. Reload it before moving.')
      backup = path.join(path.dirname(original), `.${path.basename(original).slice(0, 100)}.valence-move-${randomUUID()}.bak`)
      // Reserve the random recovery name before rename, which otherwise overwrites on POSIX.
      const reservation = await fs.open(backup, 'wx', 0o600); await reservation.close()
      try { await fs.rename(original, backup) } catch (error) { await fs.unlink(backup).catch(() => {}); backup = undefined; throw error }
      const moved = await fs.lstat(backup)
      if (!moved.isFile() || moved.isSymbolicLink() || await fs.readFile(backup, 'utf8') !== request.saved) throw new Error('The source changed during the move; it has been restored.')
    }
    for (let index = 1; index <= 10000; index++) {
      const target = path.join(destination, `${prepared.stem}${index === 1 ? '' : `-${index}`}.md`)
      try {
        await fs.link(temporary, target)
        committed = true
        return { path: target, content: prepared.content, ...(backup ? { recoveryPath: backup } : {}) }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    throw new Error('Too many documents have that name in the Quantos workspace.')
  } catch (error) {
    if (!committed && backup && original) {
      try { await fs.link(backup, original); await fs.unlink(backup) }
      catch { throw new Error(`Move failed. Your original is preserved at ${backup}; restore it after resolving the source path conflict. Cause: ${String(error)}`) }
    }
    throw error
  } finally { await fs.unlink(temporary).catch(() => {}) }
}
