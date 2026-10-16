import type { DocumentStats } from '@features/stats/stats'
import { formatCount, formatDuration } from '@features/stats/stats'

interface InspectorProps {
  stats: DocumentStats
  headings: number
  goal?: number
}

/** Document inspector.
 *
 *  Every number here is prose-only — code, URLs and math are excluded, because a count that
 *  includes `import` is a worse lie than no count at all.
 *
 *  This panel is reference material, not a dashboard. It gives up real estate to the document
 *  permanently, so it stays deliberately quiet: small type, tight rhythm, no display figures.
 *  Word count already lives in the status bar and the goal is only there because a goal you
 *  cannot check is just a number in settings. Anything that wants to shout does not belong
 *  in a column the size of a phone.
 */

export function Inspector({ stats, headings, goal = 0 }: InspectorProps) {
  return (
    <aside
      aria-label="Document statistics"
      className="hidden shrink-0 flex-col overflow-y-auto px-4 py-5 xl:flex"
      style={{ width: 'var(--inspector-w)', borderLeft: '1px solid var(--rule)' }}
    >
      {goal > 0 && <Goal words={stats.words} goal={goal} />}

      <dl className={`flex flex-col gap-2 ${goal > 0 ? 'mt-5' : ''}`}>
        <Row label="Words" value={formatCount(stats.words)} />
        <Row label="Reading time" value={formatDuration(stats.readingMinutes)} />
        <Row label="Characters" value={formatCount(stats.characters)} />
        <Row label="No spaces" value={formatCount(stats.charactersNoSpaces)} />
        <Row label="Paragraphs" value={formatCount(stats.paragraphs)} />
        <Row label="Headings" value={formatCount(headings)} />
        <Row label="Code blocks" value={formatCount(stats.codeBlocks)} />
        <Row label="Links" value={formatCount(stats.links)} />
        <Row label="Images" value={formatCount(stats.images)} />
      </dl>

      {/* Sits directly under the numbers it qualifies. Pinned to the bottom with `mt-auto`
          it read as a stray card floating in dead space. */}
      <p className="mt-4 text-[10.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        Prose only — code, links and math are excluded.
      </p>
    </aside>
  )
}

function Goal({ words, goal }: { words: number; goal: number }) {
  const pct = Math.min(100, (words / goal) * 100)
  const met = words >= goal

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
          Daily goal
        </span>
        <span className="text-[11px] tnum" style={{ color: met ? 'var(--sage)' : 'var(--ink-3)' }}>
          {formatCount(words)} / {formatCount(goal)}
        </span>
      </div>
      <div
        className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: 'var(--surface-2)' }}
        role="progressbar"
        aria-valuenow={words}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-label="Progress toward the daily word goal"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            // A 1% fill of a 3px bar is invisible and reads as broken rather than as "just
            // started". Floor it at a visible nub so the control always looks live.
            width: pct > 0 ? `max(3px, ${pct}%)` : '0px',
            background: met ? 'var(--sage)' : 'var(--accent)',
          }}
        />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </dt>
      <dd className="text-[11.5px] tnum" style={{ color: 'var(--ink-2)' }}>
        {value}
      </dd>
    </div>
  )
}