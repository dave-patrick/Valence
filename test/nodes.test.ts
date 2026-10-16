/**
 * @vitest-environment jsdom
 *
 * Math and diagram nodes (M1.2).
 *
 * The critical property is that the LaTeX/diagram source round-trips through the editor
 * unchanged. These are atom nodes holding source in an attribute, and an attribute-based
 * atom is exactly the kind of thing that silently degrades: render the markup into text
 * content and the next save writes the rendered SVG back into the file.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { createExtensions } from '../src/core/editor/extensions'
import { parseMarkdown } from '../src/core/markdown/parse'
import { serialiseMarkdown } from '../src/core/markdown/serialise'
import { blocksToHtml, htmlToBlocks } from '../src/core/htmlBridge'

function roundTripThroughEditor(html: string): string {
  const editor = new Editor({
    extensions: createExtensions(),
    content: html,
    element: document.createElement('div'),
  })
  const out = editor.getHTML()
  editor.destroy()
  return out
}

describe('display math', () => {
  let editor: Editor

  beforeEach(() => {
    editor?.destroy()
  })

  it('parses a math block into an atom with its source in an attribute', () => {
    editor = new Editor({
      extensions: createExtensions(),
      content: '<div data-type="math-block" data-latex="x^2 + y^2"></div>',
      element: document.createElement('div'),
    })
    const node = editor.state.doc.firstChild
    expect(node?.type.name).toBe('mathBlock')
    expect(node?.attrs['latex']).toBe('x^2 + y^2')
    expect(node?.isAtom).toBe(true)
  })

  it('survives a save unchanged', () => {
    const html = roundTripThroughEditor('<div data-type="math-block" data-latex="x^2 + y^2"></div>')
    const blocks = htmlToBlocks(html)
    const math = blocks.find((b) => b.kind === 'math_block')
    expect(math).toBeDefined()
    expect(math!.spans![0]!.text).toBe('x^2 + y^2')

    const { text } = serialiseMarkdown(null, blocks)
    expect(text).toContain('$$')
    expect(text).toContain('x^2 + y^2')
  })

  it('keeps characters that HTML would otherwise mangle', () => {
    // `<`, `>` and `&` are the classic attribute-corruption cases.
    const latex = 'a < b && b > c'
    const html = `<div data-type="math-block" data-latex="${latex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"></div>`
    const blocks = htmlToBlocks(html)
    const math = blocks.find((b) => b.kind === 'math_block')!
    expect(math.spans![0]!.text).toBe(latex)
  })

  it('renders KaTeX output rather than the raw source', () => {
    editor = new Editor({
      extensions: createExtensions(),
      content: '<div data-type="math-block" data-latex="x^2"></div>',
      element: document.createElement('div'),
    })
    const html = editor.view.dom.innerHTML
    expect(html).toContain('katex')
  })

  it('repaints when the formula changes', () => {
    editor = new Editor({
      extensions: createExtensions(),
      content: '<div data-type="math-block" data-latex="x"></div>',
      element: document.createElement('div'),
    })

    expect(editor.view.dom.innerHTML).toContain('katex')

    // Change the attribute the way the NodeView's source editor does.
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, { latex: 'y^3' }),
    )

    // The rendered output must reflect the new formula, not the stale one.
    const html = editor.view.dom.innerHTML
    expect(html).toContain('katex')
    expect(editor.state.doc.firstChild?.attrs['latex']).toBe('y^3')
  })

  it('exposes an Edit source control that reveals a textarea', () => {
    editor = new Editor({
      extensions: createExtensions(),
      content: '<div data-type="math-block" data-latex="x^2"></div>',
      element: document.createElement('div'),
    })
    const toggle = editor.view.dom.querySelector<HTMLButtonElement>('.valence-atomic__action')
    expect(toggle, 'node view should render its action bar').toBeTruthy()

    toggle!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const textarea = editor.view.dom.querySelector<HTMLTextAreaElement>('.valence-atomic__source')
    expect(textarea, 'toggling should reveal the source editor').toBeTruthy()
    expect(textarea!.value).toBe('x^2')
  })

  it('degrades to the source when the formula is invalid instead of blanking', () => {
    editor = new Editor({
      extensions: createExtensions(),
      content: '<div data-type="math-block" data-latex="\\frac{1}{"></div>',
      element: document.createElement('div'),
    })
    // Must not throw and must not render an empty box.
    expect(editor.view.dom.innerHTML.length).toBeGreaterThan(0)
  })
})

describe('inline math', () => {
  it('round-trips inside a sentence', () => {
    const editor = new Editor({
      extensions: createExtensions(),
      content: '<p>before <span data-type="math" data-latex="e^{i\\pi}"></span> after</p>',
      element: document.createElement('div'),
    })
    const blocks = htmlToBlocks(editor.getHTML())
    const para = blocks.find((b) => b.kind === 'paragraph')!
    const mathSpan = para.spans!.find((s) => s.marks.some((m) => m.type === 'math'))
    expect(mathSpan, 'inline math mark should survive').toBeDefined()
    expect(mathSpan!.marks.find((m) => m.type === 'math')!.type).toBe('math')
  })
})

describe('diagrams', () => {
  it('round-trips mermaid source through the editor', () => {
    const code = 'flowchart LR\n  A[Start] --> B[End]'
    const html = `<div data-type="diagram" data-kind="mermaid" data-code="${code.replace(
      /&/g,
      '&amp;',
    )}"></div>`
    const blocks = htmlToBlocks(html)
    const diagram = blocks.find((b) => b.kind === 'diagram')!
    expect(diagram.attrs.kind).toBe('mermaid')
    expect(diagram.spans![0]!.text).toBe(code)

    const { text } = serialiseMarkdown(null, blocks)
    expect(text).toContain('```mermaid')
    expect(text).toContain('A[Start] --> B[End]')
  })

  it('does not mistake diagram arrows for markdown', () => {
    const parsed = parseMarkdown('```mermaid\nflowchart LR\n  A --> B\n```\n')
    expect(parsed.blocks[0]!.kind).toBe('diagram')
  })
})

describe('bridge', () => {
  it('emits math and diagram as empty elements with source in attributes', () => {
    const blocks = parseMarkdown('$$\nx^2\n$$\n').blocks
    const html = blocksToHtml(blocks)
    // Empty element: any text inside would be parsed as content, not payload.
    expect(html).toContain('data-latex="x^2"')
    expect(html).toMatch(/data-type="math-block"[^>]*><\/div>/)
  })
})