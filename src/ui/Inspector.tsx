import type { DocumentStats } from '@features/stats/stats'
import { formatCount, formatDuration } from '@features/stats/stats'

interface InspectorProps {
  stats: DocumentStats
  headings: number
  goal?: number
}

/** Document inspector. Every number here is prose-only — code, URLs and math are excluded,
 *  because a count that includes `import` is a worse lie than no count at all. */

export function Inspector({ stats, headings, goal = 0 }: InspectorProps) {
  return (
    <aside
      aria-label="Document statistics"
      className="hidden shrink-0 flex-col gap-5 px-5 py-8 lg:flex"
      style={{ width: 190, borderLeft: '1px solid var(--rule)' }}
    >
      <div>
        <p className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>
          Reading time
        </p>
        <p className="mt-0.5 text-[15px] tnum" style={{ color: 'var(--ink)' }}>
          {formatDuration(stats.readingMinutes)}
        </p>
      </div>

      {goal > 0 && (
        <div>
          <p className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>
            Daily goal
          </p>
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--surface-2)' }}
            role="progressbar"
            aria-valuenow={stats.words}
            aria-valuemin={0}
            aria-valuemax={goal}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.min(100, (stats.words / goal) * 100)}%`,
                background: stats.words >= goal ? 'var(--sage)' : 'var(--accent)',
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px] tnum" style={{ color: 'var(--ink-3)' }}>
            {formatCount(stats.words)} of {formatCount(goal)} words
          </p>
        </div>
      )}

      <dl className="flex flex-col gap-3">
        <Row label="Words" value={formatCount(stats.words)} />
        <Row label="Characters" value={formatCount(stats.characters)} />
        <Row label="No spaces" value={formatCount(stats.charactersNoSpaces)} />
        <Row label="Paragraphs" value={formatCount(stats.paragraphs)} />
        <Row label="Headings" value={formatCount(headings)} />
        <Row label="Code blocks" value={formatCount(stats.codeBlocks)} />
        <Row label="Images" value={formatCount(stats.images)} />
        <Row label="Links" value={formatCount(stats.links)} />
      </dl>

      <div
        className="mt-auto rounded-md p-3 text-[11.5px] leading-relaxed"
        style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
      >
        Counts cover prose only. Code, links and math are left out.
      </div>
    </aside>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </dt>
      <dd className="text-[13px] tnum" style={{ color: 'var(--ink-2)' }}>
        {value}
      </dd>
    </div>
  )
}