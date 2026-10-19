/**
 * @vitest-environment jsdom
 *
 * Line numbers.
 *
 * The "Line numbers" setting was a dead switch: it was stored, it had a toggle, and
 * nothing read it. This test mounts a real editor with the extension on and checks that
 * the numbers actually appear -- because a setting that does nothing is exactly the kind
 * of thing that only shows up when someone tries to use it.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { createExtensions } from '../src/core/editor/extensions'
import { LINE_NUMBERS_TOGGLE } from '../src/core/editor/lineNumbers'

const DOC = `
<h1>Heading</h1>
<p>First paragraph.</p>
<ul><li><p>An item</p></li></ul>
<p>Second paragraph.</p>
`.trim()

let editor: Editor

beforeEach(() => {
  editor = new Editor({
    extensions: createExtensions({ lineNumbers: () => true }),
    content: DOC,
  })
})

afterEach(() => {
  editor.destroy()
})

/** The numbers the gutter is currently showing, in document order. */
function numbers(): string[] {
  return [...editor.view.dom.querySelectorAll('.valence-lineno')].map(
    (el) => el.textContent ?? '',
  )
}

describe('line numbers', () => {
  it('numbers each top-level block', () => {
    expect(numbers()).toEqual(['1', '2', '3', '4'])
  })

  it('does not number the contents of a list', () => {
    // The list is one block. Its item is a paragraph, but descending into it would put
    // numbers inside the list's own indentation.
    expect(numbers()).toHaveLength(4)
    expect(numbers()).not.toContain('5')
  })

  it('renumbers when the document changes', () => {
    editor.commands.insertContentAt(1, '<p>Inserted.</p>')
    expect(numbers()).toEqual(['1', '2', '3', '4', '5'])
  })

  it('marks the editor so the gutter has room', () => {
    expect(editor.view.dom.classList.contains('has-line-numbers')).toBe(true)
  })

  it('shows nothing when the setting is off', () => {
    const off = new Editor({
      extensions: createExtensions({ lineNumbers: () => false }),
      content: DOC,
    })
    try {
      expect(off.view.dom.querySelectorAll('.valence-lineno')).toHaveLength(0)
      expect(off.view.dom.classList.contains('has-line-numbers')).toBe(false)
    } finally {
      off.destroy()
    }
  })

  it('takes effect the moment the setting is toggled', () => {
    // A settings change carries no document or selection change, so without the toggle
    // meta the decorations would not be recomputed and the user would be told to turn
    // line numbers on and see nothing happen.
    //
    // The getter is a closure over a mutable flag, which is how the app reads the
    // setting: the extension never sees the setting change, only the getter's answer.
    let on = false
    const live = new Editor({
      extensions: createExtensions({ lineNumbers: () => on }),
      content: DOC,
    })
    try {
      expect(live.view.dom.querySelectorAll('.valence-lineno')).toHaveLength(0)

      on = true
      live.view.dispatch(live.state.tr.setMeta(LINE_NUMBERS_TOGGLE, true))

      expect(live.view.dom.querySelectorAll('.valence-lineno').length).toBe(4)
      expect(live.view.dom.classList.contains('has-line-numbers')).toBe(true)
    } finally {
      live.destroy()
    }
  })
})
