import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

type Side = 'left' | 'right'

/** Shared rail/header menu. Keep the trigger mounted so docking preserves focus. */
export function useSidebarDockMenu(side: Side, onChange?: (side: Side) => void) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  const close = (restore = false) => {
    setPosition(null)
    if (restore) trigger.current?.focus()
  }
  useEffect(() => {
    if (!position) return
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    const outside = (event: globalThis.MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setPosition(null)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('click', outside)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('click', outside)
    }
  }, [position])
  const open = (element: HTMLElement, x: number, y: number) => {
    if (!onChange) return
    trigger.current = element
    setPosition({ x: Math.max(0, Math.min(x, window.innerWidth - 190)), y: Math.max(0, Math.min(y, window.innerHeight - 88)) })
  }
  const handlers = {
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (!onChange) return
      event.preventDefault()
      const target = (event.target as HTMLElement).closest<HTMLElement>('button') ?? event.currentTarget
      open(target, event.clientX, event.clientY)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (!onChange || !(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return
      event.preventDefault()
      const target = event.target as HTMLElement
      const rect = target.getBoundingClientRect()
      open(target, rect.left, rect.bottom)
    },
  }
  const content = position && createPortal(
    <div ref={menu} role="menu" aria-label="Sidebar position" style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 1000, minWidth: 184, padding: 4, border: '1px solid var(--rule)', borderRadius: 7, background: 'var(--sidebar-bg)', color: 'var(--ink)', boxShadow: '0 6px 24px #0003' }}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close(true) }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const buttons = [...event.currentTarget.querySelectorAll('button')]
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
          buttons[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (current + 1) % 2]?.focus()
        }
      }}>
      {(['left', 'right'] as const).map(value => <button key={value} role="menuitemradio" aria-checked={side === value}
        className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[12px] hover:bg-[var(--surface-2)] focus:bg-[var(--surface-2)]"
        onClick={() => { onChange?.(value); close(true) }}>
        <span aria-hidden="true" style={{ width: 12 }}>{side === value ? '✓' : ''}</span>Move sidebar {value}
      </button>)}
    </div>, document.body,
  )
  return { handlers, content }
}
