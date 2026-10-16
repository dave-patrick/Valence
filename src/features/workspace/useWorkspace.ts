import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getPlatform } from '@platform'
import { scanVault, toVaultFiles, type ScannedFile } from './scan'
import type { VaultFile } from '@core/wiki'

export interface WorkspaceState {
  root: string
  files: ScannedFile[]
  /** All markdown documents seen on the last scan, path-only, for the resolver and indexer. */
  vault: VaultFile[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const CLOSED: WorkspaceState = {
  root: '',
  files: [],
  vault: [],
  loading: false,
  error: null,
  refresh: async () => {},
}

export const WorkspaceContext = createContext<WorkspaceState>(CLOSED)

/**
 * Reads and caches a workspace document's source on demand.
 *
 * Backed by a `Map` keyed by path, and re-populated whenever the root or scan changes. A
 * scan returns paths only — reading 10k files during boot would be a bad idea.
 */
export function useWorkspace(root: string): WorkspaceState {
  const [state, setState] = useState<WorkspaceState>(root ? { ...CLOSED, root, loading: true } : CLOSED)

  const refresh = useCallback(async () => {
    if (!root) {
      setState(CLOSED)
      return
    }
    setState((prev) => ({ ...prev, root, loading: true, error: null }))
    try {
      const listFiles = async (dir: string) => {
        const entries = await getPlatform().fs.listDir(dir)
        return entries.map((e) => ({ path: e.path, isDirectory: e.isDirectory }))
      }
      const files = await scanVault(root, listFiles)
      setState({
        root,
        files,
        vault: toVaultFiles(files),
        loading: false,
        error: null,
        refresh,
      })
    } catch (e) {
      setState((prev) => ({
        ...prev,
        root,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }))
    }
  }, [root])

  // Track `refresh` inside state so callers always get the current identity.
  useEffect(() => {
    if (!root) {
      setState(CLOSED)
      return
    }
    void refresh()
  }, [root, refresh])

  // Keep an up-to-date `refresh` on the closed state holder too.
  const current: WorkspaceState =
    state.refresh === refresh ? state : { ...state, refresh }

  return current
}

/** Async read that caches the result for repeated callers. */
const caches = new WeakMap<WorkspaceState, Map<string, string>>()

export function cachedRead(rootState: WorkspaceState, read: (path: string) => Promise<string>): (path: string) => Promise<string> {
  return async (path: string): Promise<string> => {
    let cache = caches.get(rootState)
    if (!cache) {
      cache = new Map()
      caches.set(rootState, cache)
    }
    const cached = cache.get(path)
    if (cached !== undefined) return cached
    const text = await read(path)
    cache.set(path, text)
    return text
  }
}