import type { ViewMode } from '@/App'
import type { DocumentStats } from '@features/stats/stats'
import type { UpdateState } from './TabBar'
import { formatCount } from '@features/stats/stats'

interface StatusBarProps {
  path: string | null
  stats: DocumentStats
  dirty: boolean
  tabCount: number
  dirtyCount: number
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  appVersion: string
  updateState: UpdateState | null
}

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'hybrid', label: 'Hybrid', hint: 'Live preview — ⌘\\ cycles views' },
  { id: 'source', label: 'Source', hint: 'Raw markdown, two-way bound' },
  { id: 'split', label: 'Split', hint: 'Editor beside rendered output' },
]

export function StatusBar({
  path,
  stats,
  dirty,
  tabCount,
  dirtyCount,
  view,
  onViewChange,
  appVersion,
  updateState,
}: StatusBarProps) {
  return (
    <footer
      className="flex shrink-0 items-center gap-4 px-3 text-[11.5px]"
      style={{ height: 'var(--status)', background: 'var(--surface)', borderTop: '1px solid var(--rule)' }}
    >
      <span className="truncate" style={{ color: 'var(--ink-3)' }} title={path ?? undefined}>
        {path ? basename(path) : 'Untitled'}
      </span>

      {tabCount > 1 && (
        <span className="tnum" style={{ color: 'var(--ink-3)' }} title={`${tabCount} documents open`}>
          {tabCount} open{dirtyCount > 1 ? `, ${dirtyCount} unsaved` : ''}
        </span>
      )}

      <span className="tnum" style={{ color: 'var(--ink-3)' }}>
        {formatCount(stats.words)} words
      </span>

      <div className="ml-auto flex items-center gap-1" role="group" aria-label="View mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onViewChange(m.id)}
            title={m.hint}
            aria-pressed={view === m.id}
            className="rounded px-2 py-[3px] transition-colors duration-100"
            style={{
              background: view === m.id ? 'var(--surface-2)' : 'transparent',
              color: view === m.id ? 'var(--ink)' : 'var(--ink-3)',
            }}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-2 tnum" style={{ color: 'var(--ink-3)' }} title={`Valence ${appVersion}`}>
          v{appVersion}
        </span>
        {updateState?.available && (
          <span
            className="ml-1 tnum"
            style={{ color: 'var(--brass)' }}
            title={`New version ${updateState.version} available`}
          >
            · update available
          </span>
        )}
      </div>

      <span
        className="transition-colors duration-300"
        style={{ color: dirty ? 'var(--brass)' : 'var(--ink-3)' }}
        aria-live="polite"
      >
        {dirty ? 'Unsaved' : 'All changes saved'}
      </span>
    </footer>
  )
}

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}