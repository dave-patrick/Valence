import { useCallback, useEffect, useRef, useState } from 'react'
import { getPlatform } from '@platform'
import { scanVault, type ScannedFile } from '../workspace/scan'
import { searchWorkspace, type WorkspaceHit } from './searchWorkspaceFn'
// (no @shared/path helpers needed here)

interface WorkspaceSearchProps {
  workspaceRoot: string
  onOpen: (path: string, line?: number) => void
}

export function WorkspaceSearch({ workspaceRoot, onOpen }: WorkspaceSearchProps) {
  const [files, setFiles] = useState<ScannedFile[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WorkspaceHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const scanned = await scanVault(workspaceRoot, (dir) =>
          getPlatform().fs.listDir(dir).then((xs) => xs.map((e) => ({ path: e.path, isDirectory: e.isDirectory }))),
        )
        if (!cancelled) setFiles(scanned)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [workspaceRoot])

  const runSearch = useCallback(async () => {
    if (!query.trim()) { setResults([]); return }
    const id = ++seq.current
    setLoading(true)
    const read = async (p: string) => {
      try { return await getPlatform().fs.read(p) } catch { return null }
    }
    const hits = await searchWorkspace(files, read, query)
    if (seq.current !== id) return
    setResults(hits)
    setLoading(false)
  }, [files, query])

  useEffect(() => {
    // Debounce a little, for late-cpu peace.
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(() => { void runSearch() }, 200)
    return () => clearTimeout(t)
  }, [query, runSearch])

  return (
    <div className="py-3">
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the workspace"
          aria-label="Search the workspace"
          className="w-full rounded-md px-2.5 py-1.5 text-[13px]"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--line)', color: 'var(--text)', outline: 'none' }}
        />
      </div>
      {error && <p className="px-3 text-[11px]" style={{ color: 'var(--danger)' }}>{error}</p>}
      {!query.trim() && (
        <p className="px-3 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
          {files.length} documents · type to search.
        </p>
      )}
      {query.trim() && loading && (
        <p className="px-3 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>Searching…</p>
      )}
      {query.trim() && !loading && (
        <p className="px-3 pb-1.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {results.length} {results.length === 1 ? 'hit' : 'hits'} ·{' '}
          {new Set(results.map((r) => r.path)).size} files
        </p>
      )}
      <ul>
        {results.map((r, i) => (
          <li key={`${r.path}:${r.line}:${i}`}>
            <button
              onClick={() => onOpen(r.path, r.line)}
              className="flex w-full flex-col px-3 py-[4px] text-left transition-colors duration-100 hover:bg-[var(--surface-2)]"
            >
              <span className="truncate text-[12.5px]" style={{ color: 'var(--ink)' }}>
                {r.path.split('/').pop()}
                <span className="ml-2 tnum text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                  :{r.line}
                </span>
              </span>
              <span className="truncate text-[11.5px]" style={{ color: 'var(--ink-3)' }} title={r.snippet}>
                {r.snippet}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {query.trim() && !loading && !results.length && (
        <p className="px-3 py-4 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Nothing matches.
        </p>
      )}
    </div>
  )
}