import { useState, useEffect } from 'react'
import { getPlatform } from '@platform'
import { loadSnapshots, saveSnapshot, formatAge, type Snapshot } from './history'
import { diff } from '@core/diff'
import { serialiseMarkdown } from '@core/markdown/serialise'
import { parseMarkdown } from '@core/markdown/parse'
import { blocksToHtml, htmlToBlocks } from '@core/htmlBridge'

interface HistoryPanelProps {
  markdown: string
  sourcePath: string | null
  onClose: () => void
  onNotice?: (m: string) => void
  onError?: (m: string) => void
  onRestore: (source: string) => void
}

export function HistoryPanel({ markdown, sourcePath, onClose, onNotice, onError, onRestore }: HistoryPanelProps) {
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const [selected, setSelected] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const path = sourcePath ?? null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!path) {
        setSnaps([])
        setLoading(false)
        return
      }
      const s = await loadSnapshots(path)
      if (cancelled) return
      setSnaps(s)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [path])

  const d = snaps.length ? diff(snaps[selected]!.source, markdown) : null

  const runSave = async () => {
    if (!path) { onError?.('Save the document first.'); return }
    setSaving(true)
    const ok = await saveSnapshot(path, markdown)
    setSaving(false)
    if (ok) {
      const s = await loadSnapshots(path)
      setSnaps(s)
      setSelected(0)
      onNotice?.('Snapshot saved.')
    } else {
      onNotice?.('Nothing changed since the last snapshot.')
    }
  }

  const runRestore = () => {
    if (!snaps[selected]) return
    onRestore(snaps[selected].source)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgb(0 0 0 / 0.55)' }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div
        className="flex w-full max-w-[780px] flex-col overflow-hidden rounded-[var(--radius)]"
        style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow)', maxHeight: '80vh' }}
      >
        <div className="flex items-baseline justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            Version history
          </h2>
          <div className="flex items-center gap-2">
            <button
              disabled={!path || saving}
              onClick={() => void runSave()}
              className="rounded-[var(--radius-sm)] px-2.5 py-1 text-[11.5px] disabled:opacity-40"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              title="Save a new snapshot of the current document"
            >
              {saving ? 'saving…' : 'Snapshot now'}
            </button>
            <button
              onClick={onClose}
              aria-label="Close history"
              className="text-[12px]"
              style={{ color: 'var(--text-faint)' }}
            >
              Esc
            </button>
          </div>
        </div>

        {!path && (
          <p className="px-5 py-8 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            Save the document to a file first. History lives beside the note on disk, because a
            snapshot nobody can find when they need it is a fiction.
          </p>
        )}

        {path && loading && (
          <p className="px-5 py-8 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Loading…</p>
        )}

        {path && !loading && snaps.length === 0 && (
          <p className="px-5 py-8 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            No snapshots yet. Press "Snapshot now" to capture the current document, and subsequent
            saves will capture automatically.
          </p>
        )}

        {path && snaps.length > 0 && (
          <div className="flex min-h-0 flex-1">
            <div
              className="w-[220px] shrink-0 overflow-y-auto border-r"
              style={{ borderColor: 'var(--line)' }}
            >
              {snaps.map((s, i) => {
                const active = i === selected
                return (
                  <button
                    key={s.ts}
                    onClick={() => setSelected(i)}
                    className="flex w-full flex-col px-4 py-2 text-left text-[11.5px]"
                    style={{ background: active ? 'var(--bg-active)' : 'transparent' }}
                  >
                    <span className="tnum" style={{ color: active ? 'var(--text)' : 'var(--ink-2)' }}>
                      {new Date(s.ts).toLocaleString()}
                    </span>
                    <span style={{ color: 'var(--text-faint)' }}>
                      {formatAge(s.ts)}
                      · {s.source.split(/\s+/).filter(Boolean).length} words
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {d && d.identical && (
                <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                  Identical to the current document.
                </p>
              )}
              {d && !d.identical && (
                <>
                  <p className="mb-3 text-[11.5px] tnum" style={{ color: 'var(--ink-3)' }}>
                    {d.stats.added} added · {d.stats.removed} removed
                  </p>
                  {d.hunks.map((h, i) => (
                    <pre
                      key={i}
                      className="mb-4 text-[11.5px] leading-[1.6]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {h.lines.map((line, j) => (
                        <div
                          key={j}
                          style={{
                            color:
                              line.startsWith('+')
                                ? 'var(--sage)'
                                : line.startsWith('-')
                                  ? 'var(--danger)'
                                  : 'var(--ink-3)',
                            background: line.startsWith('+')
                              ? 'var(--ok-wash)'
                              : line.startsWith('-')
                                ? 'var(--danger-wash)'
                                : 'transparent',
                          }}
                        >
                          {line}
                        </div>
                      ))}
                    </pre>
                  ))}
                </>
              )}
              <button
                onClick={runRestore}
                className="mt-2 rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                Restore this version
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}