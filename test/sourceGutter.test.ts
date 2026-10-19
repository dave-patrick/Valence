/**
 * @vitest-environment jsdom
 *
 * Line numbers in the source view.
 *
 * The source view is a plain textarea, so the numbers are a separate column rather than
 * decorations inside the text. The column has to be as long as the document and has to
 * follow the textarea as it scrolls.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { SourceGutter } from '../src/ui/SourceGutter'

let root: Root
let host: HTMLDivElement
let textarea: HTMLTextAreaElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  textarea = document.createElement('textarea')
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(text: string, visible = true) {
  act(() => {
    root.render(
      createElement(SourceGutter, { text, textareaRef: { current: textarea }, visible }),
    )
  })
}

describe('source gutter', () => {
  /** The number column, excluding the gutter element that holds it. */
  function numbers(): string[] {
    const gutter = host.firstElementChild as HTMLElement | null
    return [...(gutter?.children ?? [])].map((el) => el.textContent ?? '')
  }

  it('numbers every line of the document', () => {
    render('one\ntwo\nthree')
    expect(numbers()).toEqual(['1', '2', '3'])
  })

  it('counts a trailing empty line', () => {
    // "a\n" is two lines: the text and the empty one after it.
    render('a\n')
    expect(numbers()).toEqual(['1', '2'])
  })

  it('shows nothing when the setting is off', () => {
    render('one\ntwo', false)
    expect(numbers()).toEqual([])
  })

  it('follows the textarea when it scrolls', () => {
    render('one\ntwo\nthree')
    textarea.scrollTop = 40
    act(() => {
      textarea.dispatchEvent(new Event('scroll'))
    })
    const gutter = host.firstElementChild as HTMLElement
    expect(gutter.scrollTop).toBe(40)
  })
})
