import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { searchSlashItems, slashQueryPrefix, type SlashItem } from './slashCommands'

interface SlashMenuProps {
  /** Range [slashPos, caretPos] to delete when running. */
  onRun: (cmd: SlashItem, range: { from: number; to: number }) => void
  onClose: () => void
}

/**
 * Floating slash menu.
 *
 * Positioned by the caller (it needs the caret coordinates from the editor surface). The
 * component itself only owns the input-less filtering + keyboard handling, and the
 * `SlashItem[]` it renders.
 */
export function SlashMenu({ items, position, onRun, onClose }: SlashMenuProps & { items: SlashItem[]; position: { top: number; left: number } }) {
  const [active, setActive] = useState(0)
  const initialLen = items.length

  // Kept in a ref so Enter works even when results are empty at mount.
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (items.length ? (a + 1) % items.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0))
      } else if (e.key === 'Enter') {
        if (items[active]) {
          e.preventDefault()
          onRun(items[active]!, { from: 0, to: 0 }) // caller sets range
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    // Capture on window so the editor does not fight us for the keys.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items, active, onRun, onClose])

  const filtered = items

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Insert block"
      className="fixed z-50 flex w-[280px] flex-col overflow-hidden rounded-[var(--radius)] py-1 max-h-[50vh]"
      style={{
        top: position.top,
        left: position.left,
        background: 'var(--bg-raised)',
        border: '1px solid var(--line)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {!filtered.length ? (
        <p className="px-4 py-6 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          No entry matches “{slashQueryPrefix('')} ”. 
        </p>
      ) : (
        filtered.map((item, i) => (
          <button
            key={item.id}
            role="option"
            aria-selected={i === active}
            data-active={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => onRun(item, { from: 0, to: 0 })}
            className="flex items-center gap-2 px-3 py-[6px] text-left text-[13px]"
            style={{
              background: i === active ? 'var(--bg-active)' : 'transparent',
              color: 'var(--text)',
            }}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-[4px] text-[10.5px] font-semibold tnum"
              style={{ background: 'var(--bg-input)', color: 'var(--ink-3)', border: '1px solid var(--line)' }}
            >
              {item.tag ?? '·'}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))
      )}
    </div>
  )
}