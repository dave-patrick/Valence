import type { PanelId } from '@/App'

interface RailProps {
  panel: PanelId
  onSelect: (p: PanelId) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
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

export function Rail({ panel, onSelect, theme, onToggleTheme, onSettings }: RailProps) {
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
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="2.8" />
          <path d="M12 3.4v1.8M12 18.8v1.8M20.6 12h-1.8M5.2 12H3.4M18.1 5.9l-1.3 1.3M7.2 16.8l-1.3 1.3M18.1 18.1l-1.3-1.3M7.2 7.2 5.9 5.9" strokeLinecap="round" />
        </svg>
      </button>

      <button
        onClick={onToggleTheme}
        title={theme === 'light' ? 'Dark theme' : 'Light theme'}
        aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        className="grid h-9 w-9 place-items-center rounded-[7px] text-[var(--ink-3)] transition-colors duration-100 hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
      >
        {theme === 'light' ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M21 13.2A9 9 0 1 1 10.8 3a7 7 0 0 0 10.2 10.2Z" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </nav>
  )
}