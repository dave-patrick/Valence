import { useCallback, useEffect, useState } from 'react'
import { getPlatform } from '@platform'
import type { ExportFormat } from '@platform'
import {
  groupFormats,
  planExport,
  visibleFormats,
  type ExportPlan,
} from './exportModel'

interface ExportDialogProps {
  /** Markdown source, used for Pandoc and the HTML fallback. */
  markdown: string
  /** Fully rendered HTML, used for the print pipeline so CSS and images survive. */
  html: string
  sourcePath: string | null
  title: string | null
  onClose: () => void
  onNotice: (message: string) => void
  onError: (message: string) => void
}

/**
 * Export dialog.
 *
 * The one rule it enforces: a format that cannot be exported right now is shown *disabled
 * with its reason attached*, never hidden and never left to fail on click. Pandoc's
 * availability is a property of the user's machine, and the honest thing is to say so
 * before they pick.
 */
export function ExportDialog({
  markdown,
  html,
  sourcePath,
  title,
  onClose,
  onNotice,
  onError,
}: ExportDialogProps) {
  const [formats, setFormats] = useState<ExportFormat[]>([])
  const [hasPandoc, setHasPandoc] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [available, pandoc] = await Promise.all([
          getPlatform().export.formats(),
          getPlatform().export.hasPandoc().catch(() => false),
        ])
        if (cancelled) return
        setFormats(available)
        setHasPandoc(pandoc)
        // Preselect the first format that can actually run, so the dialog is one click
        // for the common case rather than two.
        const runnable = available.find((f) => !(f.pandoc && !pandoc))
        setSelected(runnable?.id ?? available[0]?.id ?? null)
      } catch (e) {
        if (!cancelled) onError(errorMessage(e, 'Could not list export formats.'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onError])

  const { native, pandoc } = groupFormats(visibleFormats(formats))

  const run = useCallback(
    async (format: ExportFormat) => {
      const platform = getPlatform()
      const plan = planExport(format, { sourcePath, title, hasPandoc })
      if (plan.blockedBy) {
        onError(plan.blockedBy)
        return
      }

      setBusy(true)
      try {
        const name = await platform.dialog.save(plan.suggestedName)
        // A cancelled save dialog is a decision, not a failure: stay silent and reopen-ready.
        if (!name) return

        switch (plan.route) {
          case 'native-pdf':
            await platform.export.toPdf(html, name)
            break
          case 'pandoc': {
            const target = format.id
            const converted = await platform.export.viaPandoc(markdown, 'markdown', target)
            await platform.fs.write(name, converted)
            break
          }
          case 'native-text':
            await platform.fs.write(name, markdown)
            break
        }
        onNotice(`Exported ${name}`)
        onClose()
      } catch (e) {
        onError(errorMessage(e, `Could not export as ${format.label}.`))
      } finally {
        setBusy(false)
      }
    },
    [markdown, html, sourcePath, title, hasPandoc, onClose, onNotice, onError],
  )

  const planFor = (f: ExportFormat): ExportPlan =>
    planExport(f, { sourcePath, title, hasPandoc })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export"
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgb(0 0 0 / 0.55)' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className="w-full max-w-[420px] rounded-[var(--radius)] p-5"
        style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow)' }}
      >
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            Export
          </h2>
          <button
            onClick={onClose}
            aria-label="Close export dialog"
            className="text-[12px]"
            style={{ color: 'var(--text-faint)' }}
          >
            Esc
          </button>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {title ?? 'This document'}
        </p>

        {!formats.length && (
          <p className="py-6 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
            Loading formats...
          </p>
        )}

        {native.length > 0 && <Section label="Built in">{native.map((f) => (
          <Row
            key={f.id}
            format={f}
            plan={planFor(f)}
            selected={selected === f.id}
            busy={busy}
            onSelect={() => setSelected(f.id)}
            onRun={() => void run(f)}
          />
        ))}</Section>}

        {pandoc.length > 0 && (
          <Section label={hasPandoc ? 'Via Pandoc' : 'Needs Pandoc'}>
            {pandoc.map((f) => (
              <Row
                key={f.id}
                format={f}
                plan={planFor(f)}
                selected={selected === f.id}
                busy={busy}
                onSelect={() => setSelected(f.id)}
                onRun={() => void run(f)}
              />
            ))}
          </Section>
        )}

        {formats.length > 0 && !hasPandoc && (
          <p
            className="mt-4 rounded-[var(--radius-sm)] px-3 py-2 text-[11.5px] leading-relaxed"
            style={{ background: 'var(--warn-wash)', color: 'var(--warn)' }}
          >
            Pandoc is not installed, so Word, EPUB, LaTeX and the rest are unavailable. PDF and
            HTML work without it.
          </p>
        )}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p
        className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: 'var(--text-faint)' }}
      >
        {label}
      </p>
      <div className="overflow-hidden rounded-[var(--radius-sm)]" style={{ border: '1px solid var(--line)' }}>
        {children}
      </div>
    </div>
  )
}

function Row({
  format,
  plan,
  selected,
  busy,
  onSelect,
  onRun,
}: {
  format: ExportFormat
  plan: ExportPlan
  selected: boolean
  busy: boolean
  onSelect: () => void
  onRun: () => void
}) {
  const disabled = plan.blockedBy !== null
  return (
    <button
      onClick={disabled ? undefined : selected ? onRun : onSelect}
      disabled={disabled}
      title={plan.blockedBy ?? plan.suggestedName}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px]"
      style={{
        background: selected ? 'var(--bg-active)' : 'transparent',
        color: disabled ? 'var(--text-faint)' : 'var(--text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <span
        className="shrink-0 rounded-full"
        style={{
          width: 5,
          height: 5,
          background: selected ? 'var(--accent)' : 'var(--line-strong)',
        }}
      />
      <span className="truncate">{format.label}</span>
      <span className="ml-auto shrink-0 text-[10.5px] tnum" style={{ color: 'var(--text-faint)' }}>
        .{format.extension}
      </span>
    </button>
  )
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}