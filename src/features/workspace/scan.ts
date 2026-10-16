/**
 * Workspace scanning.
 *
 * A workspace is a chosen folder. The file tree, the wiki index and the backlink panel all
 * derive from it; without one the app falls back to "whatever the active document's folder
 * is", which is what it did before this feature existed.
 *
 * The scanning itself is one recursive walk. It is separated from rendering on purpose, so
 * that the same pass can feed the tree and the indexer without walking the disk twice.
 */

import {DOCUMENT_EXTENSIONS} from '@core/wiki'

export interface VaultEntry {
  path: string
  isDirectory: boolean
}

export interface ScannedFile {
  path: string
  relative: string
}

/**
 * Pure decision: is this entry something the workspace cares about?
 *
 * Directories are tracked as structure only and never returned. Files are documents by
 * extension, and anything starting with a dot or sitting in a VCS/PM/cache folder is
 * dropped before it reaches the UI.
 */
export function isVaultDocument(path: string): boolean {
  const segments = path.split(/[\\/]/).filter(Boolean)
  // Skip anything inside a noise directory, anywhere in the path.
  const NOISE = new Set(['.git', '.obsidian', '.valence', 'node_modules', '.trash'])
  for (const seg of segments) {
    if (NOISE.has(seg) || seg.startsWith('.')) return false
  }
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return DOCUMENT_EXTENSIONS.includes(ext)
}

/**
 * Walks the vault seen through a `listDir` function and returns the document paths.
 *
 * Kept generic: the caller passes the platform's `fs.listDir` (the only side effect) and,
 * if the platform cannot list (a single-file web fallback), an empty list. Recursing on the
 * way up would be faster, but returning through the list keeps the order deterministic and
 * avoids the platform having to expose anything new.
 */
export async function scanVault(
  root: string,
  listDir: (path: string) => Promise<readonly VaultEntry[]>,
): Promise<ScannedFile[]> {
  const normRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const seen = new Set<string>()
  const out: ScannedFile[] = []

  async function walk(dir: string): Promise<void> {
    let entries: readonly VaultEntry[]
    try {
      entries = await listDir(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const path = entry.path.replace(/\\/g, '/')
      if (seen.has(path)) continue
      seen.add(path)
      if (entry.isDirectory) {
        await walk(path)
        continue
      }
      // A path outside the root should not be there, but a buggy listDir (or a file symlink
      // that escapes) must not pull the whole parent tree into the index.
      const segs = path.split(/[\\\\/]+/).filter(Boolean)
      const rootSegs = normRoot.split('/').filter(Boolean)
      if (rootSegs.length && !rootSegs.every((s, i) => segs[i] === s)) continue
      if (!isVaultDocument(path)) continue
      const relative = path.slice(normRoot.length + 1)
      if (!relative) continue
      out.push({ path, relative })
    }
  }

  await walk(normRoot)
  // Stable order: by relative path, which is how a user reads a file list.
  out.sort((a, b) => a.relative.localeCompare(b.relative))
  return out
}

/**
 * Builds the wiki index a page of documents needs: paths into VaultFile form for
 * `@core/wiki`'s resolver. No content reads here -- those happen on demand, so a large vault
 * does not block boot.
 */
export function toVaultFiles(files: readonly ScannedFile[]): { path: string }[] {
  return files.map((f) => ({ path: f.path }))
}