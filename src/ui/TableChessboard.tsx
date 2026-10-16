import { useState } from 'react'
import { CHESSBOARD_SIZES } from '@core/editor/table'

/**
 * The chessboard picker.
 *
 * MarkText's `tableChessboard` is its most distinctive control, and the one people miss
 * most when they move elsewhere: an 8×8 grid where hovering paints the shape you are about
 * to insert. It communicates the result before the click, which a "2×3 table" menu item
 * cannot.
 */

interface ChessboardProps {
  onPick: (rows: number, cols: number) => void
}

export function Chessboard({ onPick }: ChessboardProps) {
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const max = CHESSBOARD_SIZES[CHESSBOARD_SIZES.length - 1]

  return (
    <div
      className="valence-chessboard"
      role="grid"
      aria-label="Insert table"
      onMouseLeave={() => setHover(null)}
    >
      {CHESSBOARD_SIZES.map((row) =>
        CHESSBOARD_SIZES.map((col) => {
          const on = hover !== null && row <= hover.row && col <= hover.col
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              className="valence-chessboard__cell"
              style={on ? { background: 'var(--accent)' } : undefined}
              onMouseEnter={() => setHover({ row, col })}
              onFocus={() => setHover({ row, col })}
              onClick={() => onPick(row, col)}
              aria-label={`${row} by ${col} table`}
            />
          )
        }),
      )}
      <div className="valence-chessboard__readout" aria-live="polite">
        {hover ? `${hover.row} × ${hover.col}` : `${max} × ${max} max`}
      </div>
    </div>
  )
}