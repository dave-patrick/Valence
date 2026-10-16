import { useMemo, useState } from 'react'
import type { PanelId } from '@/App'
import type { OutlineEntry } from '@features/outline/outline'
import type { Backlink } from '@core/wiki'
import { FileTree } from '@features/files/FileTree'
import { Backlinks } from '@features/wiki/Backlinks'
import { dirname } from '@shared/path'

interface SidebarProps {
  width: number
  kind: Exclude<PanelId, null>
  headings: OutlineEntry[]
  source: string
  /** Path of the active document; the tree highlights it. */
  activePath: string | null
  backlinks: readonly Backlink[]
  workspaceRoot: string
  onOpenFile: (path: string) => void
  onWorkspaceOpen: () => void
  onBacklinkOpen: (path: string, line: number) => void
  onClose: () => void
  onResizeStart: (e: React.PointerEvent) => void
  onResizeMove: (e: React.PointerEvent) => void
  onResizeEnd: (e: React.PointerEvent) => void
}

export function Sidebar({
  width,
  kind,
  headings,
  source,
  activePath,
  backlinks,
  workspaceRoot,
  onOpenFile,
  onWorkspaceOpen,
  onBacklinkOpen,
  onClose,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: SidebarProps) {
  return (
    <aside
      className="flex shrink-0 flex-col"
      style={{ width, background: 'var(--surface)', minWidth: 200, maxWidth: 420 }}
    >
      <header
        className="flex h-11 shrink-0 items-center justify-between px-4"
        style={{ borderBottom: '1px solid var(--rule)' }}
      >
        <h2 className="text-[13px] font-medium" style={{ color: 'var(--ink-2)' }}>
          {kind === 'outline' ? 'Outline' : kind === 'files' ? 'Files' : 'Search'}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="grid h-6 w-6 place-items-center rounded text-[var(--ink-3)] transition-colors duration-100 hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {kind === 'outline' && (
          <div className="flex flex-col gap-2">
            <OutlineList headings={headings} />
            <div className="border-t border-[var(--rule)] pt-2">
              <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
                Backlinks
              </p>
              <Backlinks backlinks={backlinks} activePath={activePath} onOpen={onBacklinkOpen} />
            </div>
          </div>
        )}
        {kind === 'search' && <SearchPanel source={source} />}
        {kind === 'files' && (
          <FileTree
            root={workspaceRoot || (activePath ? dirname(activePath) : null)}
            activePath={activePath}
            onOpen={onOpenFile}
            onWorkspaceOpen={onWorkspaceOpen}
            onError={() => undefined}
          />
        )}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        className="h-1.5 w-full shrink-0 cursor-col-resize"
        style={{ background: 'transparent' }}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
      />
    </aside>
  )
}

function OutlineList({ headings }: { headings: OutlineEntry[] }) {
  if (!headings.length) {
    return <Empty>No headings yet. Start a line with # to add one.</Empty>
  }
  return (
    <nav className="py-2" aria-label="Document outline">
      {headings.map((h) => (
        <a
          key={h.id + h.text}
          href={`#${h.id}`}
          onClick={(e) => {
            e.preventDefault()
            document
              .getElementById(h.id)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="block truncate py-[5px] pr-3 text-[13px] leading-snug transition-colors duration-100 hover:bg-[var(--surface-2)]"
          style={{
            paddingLeft: `${12 + (h.level - 1) * 13}px`,
            color: h.level <= 2 ? 'var(--ink)' : 'var(--ink-2)',
            fontWeight: h.level === 1 ? 600 : 400,
          }}
        >
          {h.text}
        </a>
      ))}
    </nav>
  )
}

function SearchPanel({ source }: { source: string }) {
  const [query, setQuery] = useState('')
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const lines = source.split('\n')
    return lines
      .map((line, i) => ({ line, n: i }))
      .filter(({ line }) => line.toLowerCase().includes(q))
      .slice(0, 200)
  }, [query, source])

  return (
    <div className="py-3">
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in document"
          aria-label="Find in document"
          className="w-full rounded-md px-2.5 py-1.5 text-[13px]"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--rule)',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
      </div>
      {query.trim().length >= 2 && (
        <p className="px-3 pb-1.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {hits.length} {hits.length === 1 ? 'line' : 'lines'}
        </p>
      )}
      <ul>
        {hits.map(({ line, n }) => (
          <li
            key={n}
            className="cursor-default truncate px-3 py-[5px] text-[12.5px] leading-snug transition-colors duration-100 hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--ink-2)' }}
            title={line}
          >
            <span className="mr-2 tnum" style={{ color: 'var(--ink-3)' }}>
              {n + 1}
            </span>
            {line}
          </li>
        ))}
      </ul>
      {query.trim().length >= 2 && !hits.length && <Empty>No matches.</Empty>}
    </div>
  )
}


function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-6 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
      {children}
    </p>
  )
}