import { useEffect, useMemo } from 'react'
import type { OutlineEntry } from '@features/outline/outline'

interface StrataGutterProps {
  headings: OutlineEntry[]
  active: string
}

/**
 * The signature element — now a set of valence shells.
 *
 * Each heading is a shell drawn as a bracket whose width encodes nesting depth: level 1 is
 * the widest, level 6 the narrowest, and the arc on the outer edge thickens as you descend
 * the hierarchy. The active section is ember, everything above it recedes to the rule
 * colour, and the current depth picks up the cool accent — so a glance tells you both *where
 * you are* and *how deep you are*.
 *
 * It is clickable, so it is navigation rather than ornament. Everything else in the chrome
 * stays quiet so this reads as the product's identity.
 *
 * The name is kept in the component and its aria label rather than renamed: the file is
 * about the position indicator, and "strata" still describes stacked layers honestly. The
 * visual language is what changed.
 */
export function StrataGutter({ headings, active }: StrataGutterProps) {
  const geometry = useMemo(() => {
    if (!headings.length) return []
    const levels = headings.map((h) => h.level)
    const min = Math.min(...levels)
    const max = Math.max(...levels)
    const span = Math.max(1, max - min)
    return headings.map((h) => ({
      id: h.id,
      text: h.text,
      level: h.level,
      /** 0 for the outermost heading, 1 for the most deeply nested. */
      depth: (h.level - min) / span,
    }))
  }, [headings])

  const activeIndex = geometry.findIndex((s) => s.text === active)
  const deepest = geometry.length ? Math.max(...geometry.map((s) => s.level)) : 0

  useEffect(() => {
    if (!active) return
  }, [active])

  if (!geometry.length) return null

  return (
    <div
      role="navigation"
      aria-label="Document position"
      className="flex shrink-0 flex-col items-end justify-center gap-1.5 py-8 pr-2"
      style={{ width: 30 }}
    >
      {geometry.map((shell, i) => {
        const isActive = i === activeIndex
        const isPast = activeIndex > -1 && i < activeIndex

        // Radius shrinks with depth; stroke thickens slightly so a nested heading still reads
        // at a glance rather than becoming a hairline.
        const width = 6 + (1 - shell.depth) * 15
        const thickness = 1.5 + shell.depth * 1.5
        const colour = isActive
          ? 'var(--accent)'
          : isPast
            ? 'var(--rule)'
            : `color-mix(in oklab, var(--accent-cool) ${Math.round(28 + shell.depth * 34)}%, var(--ink-3))`

        return (
          <button
            key={shell.id + i}
            onClick={() =>
              document.getElementById(shell.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            title={`${shell.text}  (level ${shell.level})`}
            aria-label={`Go to ${shell.text}, heading level ${shell.level}`}
            className="rounded-sm transition-opacity duration-150"
            style={{ opacity: isActive ? 1 : isPast ? 0.35 : 0.62 }}
          >
            <svg width={22} height={9} viewBox={`0 0 ${22} 9`} aria-hidden>
              {/* A bracket open toward the text: the valence shell. */}
              <path
                d={`M ${22 - width} 1 L ${22 - width} 8`}
                stroke={colour}
                strokeWidth={thickness}
                strokeLinecap="round"
                fill="none"
              />
              {isActive && (
                <circle cx={22 - width - 4} cy={4.5} r={2} fill="var(--accent)" />
              )}
            </svg>
          </button>
        )
      })}
      <span className="sr-only">
        {geometry.length} headings, deepest level {deepest}
        {activeIndex > -1 ? `. Currently in section ${active}` : ''}
      </span>
    </div>
  )
}