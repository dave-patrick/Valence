/**
 * @vitest-environment jsdom
 *
 * Column reordering (M1.3, final piece).
 *
 * `reorderColumn` is the whole risk surface of drag-to-reorder: getting it wrong silently
 * shreds a user's table, and undo does not always save you from a mangled merge. So it is
 * written as a pure function and tested here directly, including the case it must refuse.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { createExtensions } from '../src/core/editor/extensions'
import { reorderColumn, columnAtOffset } from '../src/core/editor/table'

const THREE_COLS =
  '<table><tbody>' +
  '<tr><th><p>A</p></th><th><p>B</p></th><th><p>C</p></th></tr>' +
  '<tr><td><p>1</p></td><td><p>2</p></td><td><p>3</p></td></tr>' +
  '<tr><td><p>4</p></td><td><p>5</p></td><td><p>6</p></td></tr>' +
  '</tbody></table>'

function makeEditor(html = THREE_COLS): Editor {
  return new Editor({
    extensions: createExtensions(),
    content: html,
    element: document.createElement('div'),
  })
}

/** Cell text per row, so a reorder is legible in an assertion. */
function grid(editor: Editor): string[][] {
  const out: string[][] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'tableRow') return
    const row: string[] = []
    node.forEach((cell) => {
      let text = ''
      cell.forEach((p) => {
        p.forEach((t) => {
          text += t.text ?? ''
        })
      })
      row.push(text)
    })
    out.push(row)
  })
  return out
}

describe('reorderColumn', () => {
  let editor: Editor

  beforeEach(() => {
    editor?.destroy()
    editor = makeEditor()
  })

  it('moves a column right', () => {
    const table = editor.state.doc.firstChild!
    const next = reorderColumn(table, 0, 2)!
    expect(next).not.toBeNull()
    editor.commands.setContent(next.toJSON() ? { type: 'doc', content: [next.toJSON()] } : '')
    expect(grid(editor)[0]).toEqual(['B', 'C', 'A'])
    expect(grid(editor)[1]).toEqual(['2', '3', '1'])
    expect(grid(editor)[2]).toEqual(['5', '6', '4'])
  })

  it('moves a column left', () => {
    const table = editor.state.doc.firstChild!
    editor.commands.setContent({ type: 'doc', content: [reorderColumn(table, 2, 0)!.toJSON()] })
    expect(grid(editor)[0]).toEqual(['C', 'A', 'B'])
    expect(grid(editor)[1]).toEqual(['3', '1', '2'])
  })

  it('is a no-op when from equals to', () => {
    const table = editor.state.doc.firstChild!
    expect(reorderColumn(table, 1, 1)).toBeNull()
  })

  it('refuses an out-of-range column', () => {
    const table = editor.state.doc.firstChild!
    expect(reorderColumn(table, 0, 9)).toBeNull()
    expect(reorderColumn(table, -1, 1)).toBeNull()
  })

  it('refuses when rows have differing cell counts, rather than mangling the table', () => {
    // A colspan row means "column 1" is not a consistent concept across rows.
    const merged = makeEditor(
      '<table><tbody>' +
        '<tr><th colspan="2"><p>wide</p></th><th><p>C</p></th></tr>' +
        '<tr><td><p>1</p></td><td><p>2</p></td><td><p>3</p></td></tr>' +
        '</tbody></table>',
    )
    const table = merged.state.doc.firstChild!
    expect(reorderColumn(table, 0, 1)).toBeNull()
    merged.destroy()
  })

  it('carries alignment with the cell rather than resetting it', () => {
    const aligned = makeEditor(
      '<table><tbody>' +
        '<tr><th><p>A</p></th><th style="text-align: right"><p>B</p></th></tr>' +
        '<tr><td><p>1</p></td><td><p>2</p></td></tr>' +
        '</tbody></table>',
    )
    const next = reorderColumn(aligned.state.doc.firstChild!, 1, 0)!
    const movedFirst = next.child(0).child(0)
    expect(movedFirst.attrs['align']).toBe('right')
    aligned.destroy()
  })

  it('does not mutate the original node', () => {
    const table = editor.state.doc.firstChild!
    const before = grid(editor)
    reorderColumn(table, 0, 2)
    expect(grid(editor)).toEqual(before)
  })

  it('survives a round trip to markdown after reordering', async () => {
    const { htmlToBlocks } = await import('../src/core/htmlBridge')
    const { serialiseMarkdown } = await import('../src/core/markdown/serialise')

    const next = reorderColumn(editor.state.doc.firstChild!, 2, 0)!
    editor.commands.setContent({ type: 'doc', content: [next.toJSON()] })

    const { text } = serialiseMarkdown(null, htmlToBlocks(editor.getHTML()))
    const header = text.split('\n')[0]!
    expect(header).toBe('| C | A | B |')
    expect(text).toContain('| --- | --- | --- |')
  })
})

describe('columnAtOffset', () => {
  it('returns null without a table header', () => {
    const el = document.createElement('div')
    expect(columnAtOffset(el, 10)).toBeNull()
  })

  it('identifies the column under a point', () => {
    const table = document.createElement('table')
    table.innerHTML =
      '<thead><tr>' +
      '<th style="width:100px"></th><th style="width:100px"></th>' +
      '</tr></thead><tbody><tr><td></td><td></td></tr></tbody>'

    // jsdom reports zeroed rects, so stub a row spanning 0..200 with two 100px cells.
    const header = table.querySelector('tr')!
    const rowBox = { left: 0, top: 0, right: 200, bottom: 20, width: 200, height: 20 }
    header.getBoundingClientRect = () => rowBox as DOMRect
    const cells = header.children
    for (let i = 0; i < cells.length; i++) {
      ;(cells[i] as HTMLElement).getBoundingClientRect = () =>
        ({ left: i * 100, right: i * 100 + 100, top: 0, bottom: 20, width: 100, height: 20 }) as DOMRect
    }

    expect(columnAtOffset(table, 50)).toBe(0)
    expect(columnAtOffset(table, 150)).toBe(1)
    expect(columnAtOffset(table, 400)).toBeNull()
  })
})