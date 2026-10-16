import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COMMAND_GROUPS,
  searchCommands,
  type CommandDef,
  type ScoredCommand,
} from './commands'

interface PaletteProps {
  commands: readonly CommandDef[]
  onRun: (id: string) => void
  onClose: () => void
}

/** Enough to scan without scrolling; more than this is noise in a palette. */
const MAX_RESULTS = 40

/**
 * Command palette.
 *
 * Deliberately modal and deliberately keyboard-only once open. The mouse works, but nobody
 * should need it: the point of a palette is that you type three letters and press Enter.
 *
 * Two behaviours worth calling out, because both are what people expect and neither is the
 * default:
 *
 *  - the input keeps focus through re-renders, so results filter as you type without stealing
 *    the caret;
 *  - Escape closes, and so does Enter on an empty list rather than silently doing nothing.
 */
export function Palette({ commands, onRun, onClose }: PaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(
    () => searchCommands(commands, query).slice(0, MAX_RESULTS),
    [commands, query],
  )

  // A shorter list, or a list reordered by the filter, must not leave the selection pointing
  // past the end.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)))
  }, [results.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const grouped = useMemo(() => groupResults(results, query.trim().length === 0), [results, query])

  const run = (cmd: ScoredCommand | undefined) => {
    if (!cmd) return
    onRun(cmd.id)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (results.length ? (a + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(results[active])
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(Math.max(0, results.length - 1))
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-[12vh]"
      style={{ background: 'rgb(0 0 0 / 0.5)' }}
      onMouseDown={(e) => {
        // Click the backdrop to dismiss, but never a click that started inside the panel.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-[var(--radius)]"
        style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow)' }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a command"
          aria-label="Type a command"
          aria-activedescendant={results[active] ? `cmd-${results[active]!.id}` : undefined}
          aria-controls="palette-results"
          autoComplete="off"
          spellCheck={false}
          className="w-full px-4 py-3 text-[14px]"
          style={{
            background: 'var(--bg-input)',
            border: 'none',
            borderBottom: '1px solid var(--line)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />

        <div ref={listRef} id="palette-results" role="listbox" aria-label="Commands" className="max-h-[46vh] overflow-y-auto py-1">
          {!results.length && (
            <p className="px-4 py-6 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              No command matches “{query}”.
            </p>
          )}

          {grouped.map((section) => (
            <div key={section.group}>
              {section.showLabel && (
                <p
                  className="px-4 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: 'var(--text-faint)' }}
                >
                  {section.group}
                </p>
              )}
              {section.items.map((cmd) => {
                const index = results.indexOf(cmd)
                const isActive = index === active
                return (
                  <button
                    key={cmd.id}
                    id={`cmd-${cmd.id}`}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(cmd)}
                    className="flex w-full items-baseline gap-3 px-4 py-[7px] text-left text-[13px]"
                    style={{
                      background: isActive ? 'var(--bg-active)' : 'transparent',
                      color: 'var(--text)',
                    }}
                  >
                    <span className="truncate">
                      <Highlighted title={cmd.title} indices={cmd.indices} />
                    </span>
                    {cmd.keys && (
                      <span
                        className="ml-auto shrink-0 text-[11px]"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        {cmd.keys}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div
          className="flex items-center gap-3 px-4 py-2 text-[11px]"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--text-faint)' }}
        >
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}

interface Section {
  group: string
  items: ScoredCommand[]
  showLabel: boolean
}

/**
 * Groups results for display.
 *
 * Grouping only applies when nothing has been typed. Once someone is filtering, the ranking
 * is the answer and re-sorting by group would fight it — the top result must stay on top.
 */
function groupResults(results: readonly ScoredCommand[], grouped: boolean): Section[] {
  if (!grouped) {
    return results.length ? [{ group: '', items: [...results], showLabel: false }] : []
  }

  const order = [...COMMAND_GROUPS]
  const out: Section[] = []
  for (const group of order) {
    const items = results.filter((c) => c.group === group)
    if (items.length) out.push({ group, items, showLabel: true })
  }
  // Anything with a group not in COMMAND_GROUPS still has to appear, or it is unreachable.
  for (const c of results) {
    if (!order.includes(c.group as (typeof order)[number])) {
      let section = out.find((s) => s.group === c.group)
      if (!section) {
        section = { group: c.group, items: [], showLabel: true }
        out.push(section)
      }
      if (!section.items.includes(c)) section.items.push(c)
    }
  }
  return out
}

/** Renders a title with the matched characters emphasised. */
function Highlighted({ title, indices }: { title: string; indices: number[] }) {
  if (!indices.length) return <>{title}</>

  const marks = new Set(indices)
  const parts: React.ReactNode[] = []
  let run = ''
  let runMarked = marks.has(0)

  const flush = (key: number) => {
    if (!run) return
    parts.push(
      runMarked ? (
        <mark key={key} className="bg-transparent font-semibold" style={{ color: 'var(--accent)' }}>
          {run}
        </mark>
      ) : (
        <span key={key}>{run}</span>
      ),
    )
    run = ''
  }

  for (let i = 0; i < title.length; i++) {
    const marked = marks.has(i)
    if (marked !== runMarked) {
      flush(i)
      runMarked = marked
    }
    run += title[i]
  }
  flush(title.length)

  return <>{parts}</>
}