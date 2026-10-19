import type { PanelId } from '@/App'

interface RailProps {
  panel: PanelId
  onSelect: (p: PanelId) => void
  onSettings: () => void
}

/** The icon rail. 48px, always visible, never scrolls. Icons are the only decoration here —
 *  everything else in the chrome stays flat. */

/*
 * Rail glyphs are 24x24 stroke paths on a 1.6 stroke, so they sit on the same optical
 * weight as the 11.5px labels beside them.
 *
 * Files is a folder and outline is a list of lines with indents, because two three-line
 * glyphs next to each other are indistinguishable at 18px.
 */
const ITEMS: { id: Exclude<PanelId, null>; label: string; glyph: string }[] = [
  {
    id: 'files',
    label: 'Files',
    glyph: 'M3 7.2a1.8 1.8 0 0 1 1.8-1.8h3.6l2 2.4h7.8A1.8 1.8 0 0 1 20 9.6v8.6a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 18.2Z',
  },
  {
    id: 'outline',
    label: 'Outline',
    glyph: 'M4 6h5M4 12h5M4 18h5M12 6h8M12 12h8M12 18h8',
  },
  { id: 'search', label: 'Search', glyph: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 21 21' },
]

export function Rail({ panel, onSelect, onSettings }: RailProps) {
  return (
    <nav
      aria-label="Panels"
      className="flex shrink-0 flex-col items-center gap-1 py-3"
      style={{ width: 'var(--rail)', background: 'var(--surface)', borderRight: '1px solid var(--rule)' }}
    >
      {/* Wordmark. A letter, not the shell glyph: at 28px a detailed mark turns to mush,
          and the shell already carries the identity down the gutter on every screen. */}
      <div
        className="mb-3 grid h-7 w-7 place-items-center rounded-[7px] text-[14px] leading-none"
        style={{
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
        }}
        aria-hidden
      >
        V
      </div>

      {ITEMS.map((item) => {
        const active = panel === item.id
        return (
          <button
            key={item.id}
            onClick={() => onSelect(active ? null : item.id)}
            title={item.label}
            aria-label={item.label}
            aria-pressed={active}
            className="grid h-9 w-9 place-items-center rounded-[7px] transition-colors duration-100"
            style={{
              background: active ? 'var(--surface-2)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--ink-3)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d={item.glyph} />
            </svg>
          </button>
        )
      })}

      <div className="flex-1" />

      <button
        onClick={onSettings}
        title="Settings"
        aria-label="Settings"
        className="grid h-9 w-9 place-items-center rounded-[7px] text-[var(--ink-3)] transition-colors duration-100 hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </nav>
  )
}