import { useMemo } from 'react'
import { displayName, stripExtension } from './display'
import type { Backlink } from '@core/wiki'
import { basenameOf } from '@shared/path'

interface BacklinksProps {
  /** Links pointing at the active document. */
  backlinks: readonly Backlink[]
  /** Source document paths, used only to make the list compact. */
  activePath: string | null
  onOpen: (path: string, line: number) => void
}

/**
 * Backlinks panel.
 *
 * A note with no incoming links shows a message that says so rather than an empty block.
 * Nothing about the page reads worse than a section that contains nothing.
 */
export function Backlinks({ backlinks, activePath, onOpen }: BacklinksProps) {
  void activePath

  const grouped = useMemo(() => {
    const out: Record<string, Backlink[]> = {}
    for (const b of backlinks) {
      ;(out[b.from] ??= []).push(b)
    }
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
  }, [backlinks])

  if (!backlinks.length) {
    return (
      <p
        className="px-3 py-2 text-[12px] leading-relaxed"
        style={{ color: 'var(--ink-3)' }}
      >
        No backlinks yet. Link to this note with [[{displayName(activePath ?? '')}]].
      </p>
    )
  }

  return (
    <ul className="flex flex-col">
      {grouped.map(([from, links]) => (
        <li key={from} className="flex flex-col">
          <button
            onClick={() => onOpen(from, links[0]!.line)}
            className="flex items-center gap-1.5 px-3 py-[4px] text-left text-[12.5px] truncate transition-colors duration-100 hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--ink-2)' }}
            title={from}
          >
            {stripExtension(basenameOf(from))}
          </button>
          {links.length > 1 && (
            <span className="pl-7 pb-1 text-[11px] leading-tight" style={{ color: 'var(--ink-3)' }}>
              {links.length} links
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}