import { useRef, type ReactNode } from 'react'

interface ResizeDividerProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  direction?: 1 | -1
  step?: number
  unitsPerPixel?: () => number
}

export function ResizeDivider({ label, value, min, max, onChange, direction = 1, step = 10, unitsPerPixel }: ResizeDividerProps) {
  const drag = useRef<{ id: number; x: number; value: number; scale: number } | null>(null)
  const change = (next: number) => onChange(Math.min(max, Math.max(min, next)))
  return (
    <div
      role="separator" aria-orientation="vertical" aria-label={label}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
      tabIndex={0} className="valence-resize-divider"
      onPointerDown={(e) => {
        if (e.button !== 0 || e.isPrimary === false || drag.current) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { id: e.pointerId, x: e.clientX, value, scale: unitsPerPixel?.() ?? 1 }
      }}
      onPointerMove={(e) => {
        const start = drag.current
        if (!start || start.id !== e.pointerId) return
        change(start.value + (e.clientX - start.x) * direction * start.scale)
      }}
      onPointerUp={(e) => {
        if (drag.current?.id !== e.pointerId) return
        drag.current = null
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={() => { drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={(e) => {
        const next = e.key === 'ArrowLeft' ? value - step * direction
          : e.key === 'ArrowRight' ? value + step * direction
          : e.key === 'Home' ? min : e.key === 'End' ? max : null
        if (next === null) return
        e.preventDefault()
        change(next)
      }}
    />
  )
}

export function ResizablePane({ width, min, max, onResize, edge, label, children, className = '' }: {
  width: number; min: number; max: number; onResize: (width: number) => void
  edge: 'left' | 'right'; label: string; children: ReactNode; className?: string
}) {
  const divider = <ResizeDivider label={label} value={width} min={min} max={max} onChange={onResize} direction={edge === 'right' ? 1 : -1} />
  return <div className={`valence-resizable-pane ${className}`} style={{ width: width + 6 }}>
    {edge === 'left' && divider}
    <div className="valence-resizable-pane__content">{children}</div>
    {edge === 'right' && divider}
  </div>
}
