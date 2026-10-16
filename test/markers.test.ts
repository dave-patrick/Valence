/**
 * @vitest-environment jsdom
 *
 * Syntax markers (M1.1).
 *
 * The behaviour under test is the one that defines this category of editor: markdown markers
 * are invisible while you write and reappear when the caret enters them. These assertions
 * move a real selection through a real ProseMirror document and read the decoration set the
 * plugin produces — they are not checking that a CSS class exists somewhere.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { createExtensions } from '../src/core/editor/extensions'
import { syntaxMarkersKey } from '../src/core/editor/markers'
import type { DecorationSet } from '@tiptap/pm/view'

function makeEditor(html: string): Editor {
  return new Editor({
    extensions: createExtensions(),
    content: html,
    element: document.createElement('div'),
  })
}

/**
 * Marker text the plugin is currently rendering, in document order.
 *
 * `DecorationSet.getDecorations()` returns the flat list; a widget decoration carries its
 * renderer on `type.toDOM`, so recovering the text means asking that renderer for the node
 * it would produce.
 */
function markersFor(editor: Editor): string[] {
  const set = syntaxMarkersKey.getState(editor.state) as DecorationSet | undefined
  if (!set) return []

  return set
    .find()
    .map((d) => {
      const toDOM = (d.type as { toDOM?: (v: unknown) => Node }).toDOM
      return toDOM ? (toDOM({}).textContent ?? '') : ''
    })
    .filter(Boolean)
}

describe('syntax markers', () => {
  let editor: Editor

  beforeEach(() => {
    editor?.destroy()
  })

  it('shows nothing when there is no caret in a block', () => {
    editor = makeEditor('<p><strong>bold</strong> and <em>italic</em></p><p>plain</p>')
    // Caret in the second paragraph; the first paragraph's markers must stay hidden.
    editor.commands.setTextSelection(18)
    const markers = markersFor(editor)
    expect(markers.filter((m) => m === '**')).toHaveLength(0)
    expect(markers.filter((m) => m === '*')).toHaveLength(0)
  })

  it('reveals bold markers when the caret enters the bold run', () => {
    editor = makeEditor('<p>plain <strong>bold</strong> tail</p>')
    // Position inside "bold".
    editor.commands.setTextSelection(9)
    const markers = markersFor(editor)
    expect(markers.filter((m) => m === '**')).toHaveLength(2)
  })

  it('reveals italic markers independently of bold', () => {
    editor = makeEditor('<p><strong>bold</strong> <em>italic</em></p>')
    editor.commands.setTextSelection(12)
    const markers = markersFor(editor)
    expect(markers).toContain('*')
    expect(markers).not.toContain('**')
  })

  it('renders a link as [text](href)', () => {
    editor = makeEditor('<p><a href="https://example.com">the docs</a></p>')
    editor.commands.setTextSelection(6)
    const markers = markersFor(editor)
    expect(markers).toContain('[')
    expect(markers).toContain(']')
    expect(markers).toContain('(https://example.com)')
  })

  it('renders an image as ![alt](src)', () => {
    editor = makeEditor('<p><img src="a.png" alt="a cat" /></p>')
    editor.commands.setTextSelection(2)
    const markers = markersFor(editor)
    expect(markers).toContain('![a cat](a.png)')
  })

  it('hides every marker again when the caret leaves the block', () => {
    editor = makeEditor('<p><strong>bold</strong></p><p>elsewhere</p>')
    editor.commands.setTextSelection(3)
    expect(markersFor(editor).filter((m) => m === '**')).toHaveLength(2)

    editor.commands.setTextSelection(18)
    expect(markersFor(editor).filter((m) => m === '**')).toHaveLength(0)
  })

  it('emits exactly one marker pair per mark on a nested run', () => {
    editor = makeEditor('<p><strong>bold <em>and italic</em></strong></p>')
    editor.commands.setTextSelection(10)
    const markers = markersFor(editor)
    // `**bold *and italic* **` — two openers at one offset, two closers at the other.
    // Four asterisks where the document has four is correct; eight is the bug this guards.
    expect(markers.filter((m) => m === '*')).toHaveLength(2)
    expect(markers.filter((m) => m === '**')).toHaveLength(2)
    expect(markers).toHaveLength(4)
  })

  it('never leaks markers into the serialised document', () => {
    editor = makeEditor('<p><strong>bold</strong> text</p>')
    editor.commands.setTextSelection(4)
    markersFor(editor)
    // Widgets are not part of the doc, so they cannot reach the save path.
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' text' },
          ],
        },
      ],
    })
  })
})