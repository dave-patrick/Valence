import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPlatform } from '@platform'
import { scanVault, type ScannedFile } from '../workspace/scan'
import { normalise } from '@shared/path'

interface FileListProps {
  root: string | null
  activePath: string | null
  onOpen: (path: string) => void
  onError: (message: string) => void
}

/**
 * Flat list view.
 *
 * The tree is the default because it shows where a note *lives*, but a flat list sorted by
 * name is faster when a vault has hundreds of notes and you already know what you are
 * looking for. Typing filters both views identically; only the shape of the browse changes.
 */
export function FileList({ root, activePath, onOpen, onError }: FileListProps) {
  const [files, setFiles] = useState<ScannedFile[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    if (!root) { setFiles([]); return }
    setLoading(true)
    try {
      const scanned = await scanVault(root, (dir) =>
        getPlatform().fs.listDir(dir).then((xs) =>
          xs.map((e) => ({ path: e.path, isDirectory: e.isDirectory })),
        ),
      )
      setFiles(scanned)
    } catch {
      onError(`Could not read ${root}`)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [root, onError])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files.filter((f) => f.path.toLowerCase().includes(q))
  }, [files, query])

  if (!root) {
    return (
      <div className="px-4 py-6 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        No folder open. Open a workspace to list its files.
      </div>
    )
  }

  return (
    <div>
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
          className="w-full rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[12.5px]"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--line)', color: 'var(--text)', outline: 'none' }}
        />
      </div>
      {loading && <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>Reading folder…</p>}
      {!loading && files.length === 0 && (
        <p className="px-4 py-4 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          No documents in this folder yet.
        </p>
      )}
      {!loading && files.length > 0 && !filtered.length && (
        <p className="px-4 py-4 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Nothing matches “{query}”.
        </p>
      )}
      <ul role="list" aria-label="Workspace files" className="pb-4">
        {filtered.map((f) => {
          const active = normalise(f.path) === normalise(activePath ?? '')
          return (
            <li key={f.path}>
              <button
                onClick={() => onOpen(f.path)}
                title={f.relative}
                className="flex w-full items-center gap-2 py-[4px] text-left text-[12.5px] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                style={{ paddingLeft: 14, color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 500 : 400, background: active ? 'var(--bg-active)' : undefined }}
              >
                <span className="truncate">{f.relative}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}