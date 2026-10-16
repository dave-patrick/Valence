import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { tableContext, type Align, type TableContext } from '@core/editor/table'
import { Chessboard } from './TableChessboard'

/**
 * The table toolbar.
 *
 * MarkText's row/column menu and chessboard picker are the best table tooling in either
 * reference app; this is that model. The toolbar floats above the table whenever the caret
 * is inside one, and offers exactly the operations a person reaches for when editing a
 * table by hand: add or remove rows and columns, set alignment, toggle header rows and
 * columns, merge and split.
 *
 * It subscribes to selection and transaction events rather than polling, so it stays in step
 * with the editor without a render per keystroke.
 */

interface TableToolbarProps {
  editor: Editor | null
}

const ALIGN_LABEL: Record<Exclude<Align, null>, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
}

export function TableToolbar({ editor }: TableToolbarProps) {
  const [ctx, setCtx] = useState<TableContext | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  // Recompute whenever the selection or document changes. `transaction` covers both and
  // fires for keyboard navigation as well as edits.
  useEffect(() => {
    if (!editor) {
      setCtx(null)
      return
    }
    const update = () => setCtx(tableContext(editor.state))
    update()

    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    editor.on('blur', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      editor.off('blur', update)
    }
  }, [editor])

  // Close the picker on any outside interaction — it is a transient control, not a panel.
  useEffect(() => {
    if (!boardOpen) return
    const onDown = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setBoardOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBoardOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [boardOpen])

  const run = useCallback(
    (fn: (e: Editor) => void) => {
      if (!editor) return
      fn(editor)
      editor.commands.focus()
    },
    [editor],
  )

  const setAlign = useCallback(
    (align: Align) => {
      run((e) => e.chain().setCellAttribute('align', align).run())
    },
    [run],
  )

  if (!editor || !ctx) return null

  const view = editor.view
  // Anchor above the table; fall back to the viewport centre if it cannot be located.
  const node = view.nodeDOM(ctx.pos)
  const box = node instanceof HTMLElement ? node.getBoundingClientRect() : null
  const style: React.CSSProperties = box
    ? { top: Math.max(8, box.top + window.scrollY - 46), left: box.left + window.scrollX }
    : { top: 96, left: '50%', transform: 'translateX(-50%)' }

  return (
    <div ref={hostRef} className="valence-table-toolbar" style={style} role="toolbar" aria-label="Table">
      <div className="valence-table-toolbar__group">
        <Btn onClick={() => run((e) => e.chain().addRowBefore().run())} title="Insert row above">
          <Icon d="M12 5v14M12 5 8 9M12 5l4 4M5 19h14" />
        </Btn>
        <Btn onClick={() => run((e) => e.chain().addRowAfter().run())} title="Insert row below">
          <Icon d="M12 19V5M12 19l-4-4M12 19l4-4M5 5h14" />
        </Btn>
        <Btn onClick={() => run((e) => e.chain().deleteRow().run())} title="Delete row">
          <Icon d="M5 5h14M5 5l1 14h12l1-14M10 9v6M14 9v6M5 5l1-2h12l1 2" />
        </Btn>
      </div>

      <div className="valence-table-toolbar__group">
        <Btn onClick={() => run((e) => e.chain().addColumnBefore().run())} title="Insert column left">
          <Icon d="M5 12h14M5 12l4-4M5 12l4 4M19 5v14" />
        </Btn>
        <Btn onClick={() => run((e) => e.chain().addColumnAfter().run())} title="Insert column right">
          <Icon d="M19 12H5M19 12l-4-4M19 12l-4 4M5 5v14" />
        </Btn>
        <Btn onClick={() => run((e) => e.chain().deleteColumn().run())} title="Delete column">
          <Icon d="M5 5v14M5 5l14 1M5 5l14 14M19 6 5 19" />
        </Btn>
      </div>

      <div className="valence-table-toolbar__group">
        <Btn
          onClick={() => setAlign(ctx.align === 'left' ? 'center' : ctx.align === 'center' ? 'right' : null)}
          title={ctx.align ? `Alignment: ${ALIGN_LABEL[ctx.align]}` : 'Alignment: default'}
        >
          {ctx.align ? ALIGN_LABEL[ctx.align] : 'Align'}
        </Btn>
        <Btn
          onClick={() => run((e) => e.chain().toggleHeaderRow().run())}
          active={ctx.inHeader}
          title="Toggle header row"
        >
          Header row
        </Btn>
        <Btn
          onClick={() => run((e) => e.chain().toggleHeaderColumn().run())}
          active={ctx.colIsHeader}
          title="Toggle header column"
        >
          Header col
        </Btn>
      </div>

      <div className="valence-table-toolbar__group">
        <Btn
          onClick={() => run((e) => e.chain().mergeOrSplit().run())}
          title="Merge or split the selected cells"
        >
          Merge
        </Btn>
        <Btn onClick={() => run((e) => e.chain().deleteTable().run())} title="Delete table">
          Delete
        </Btn>
      </div>

      <div className="valence-table-toolbar__group valence-table-toolbar__group--last">
        <Btn
          onClick={() => setBoardOpen((v) => !v)}
          active={boardOpen}
          title="Insert a table"
          text={`${ctx.rows}×${ctx.cols}`}
        />
        {boardOpen && (
          <Chessboard
            onPick={(rows, cols) => {
              setBoardOpen(false)
              run((e) => e.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run())
            }}
          />
        )}
      </div>
    </div>
  )
}

function Btn({
  onClick,
  title,
  active,
  children,
  text,
}: {
  onClick: () => void
  title: string
  active?: boolean
  children?: React.ReactNode
  text?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="valence-table-toolbar__btn"
      style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
    >
      {text ?? children}
    </button>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}