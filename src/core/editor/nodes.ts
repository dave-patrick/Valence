/**
 * M1.2 — Math and diagram nodes.
 *
 * MarkText renders KaTeX, Mermaid, Vega and PlantUML inline with a hover toolbar and a
 * full-screen viewer; Typora does the same for MathJax and Mermaid. That inline-rendered
 * treatment is the biggest feature gap in the scaffold, and these nodes close it.
 *
 * Each node is an **atom** holding its source in an attribute rather than as text content.
 * That keeps the document model honest — the ProseMirror doc holds LaTeX/diagram source, and
 * rendering is a projection of it, never the other way round. Typing happens in a source
 * editor inside the NodeView, not in the rendered output, which is why you can edit a
 * formula without KaTeX's DOM fighting the caret.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRendererProps } from '@tiptap/core'
import type { Node as ProseNode } from '@tiptap/pm/model'
import katex from 'katex'
import { renderMermaid } from './mermaid'

/* ──────────────────────────────────────────────────────────────
 * Shared source-editing behaviour
 * ──────────────────────────────────────────────────────────────*/

interface SourceNode {
  attr: string
  placeholder: string
  label: string
}

/**
 * Builds a NodeView that shows rendered output until the user asks for the source, then
 * swaps in a plain textarea.
 *
 * This is the whole interaction, done once, rather than three near-copies. The rendered
 * surface is `contenteditable=false`; the textarea is the only editable thing, so the caret
 * can never land inside generated markup.
 */
function createSourceNodeView(spec: SourceNode, render: (el: HTMLElement, node: ProseNode) => void) {
  return (props: NodeViewRendererProps) => {
    const root = document.createElement('div')
    root.className = 'valence-atomic'

    const output = document.createElement('div')
    output.className = 'valence-atomic__output'

    const editor = document.createElement('textarea')
    editor.className = 'valence-atomic__source'
    editor.spellcheck = false
    editor.rows = 3

    const bar = document.createElement('div')
    bar.className = 'valence-atomic__bar'

    const label = document.createElement('span')
    label.className = 'valence-atomic__label'
    label.textContent = spec.label

    const toggle = document.createElement('button')
    toggle.className = 'valence-atomic__action'
    toggle.type = 'button'
    toggle.textContent = 'Edit source'

    let editing = false
    /** Suppresses repaint while we dispatch the transaction our own input caused. */
    let selfUpdate = false

    const paint = (node: ProseNode) => {
      const source = String(node.attrs[spec.attr] ?? '')

      if (editing) {
        output.style.display = 'none'
        editor.style.display = ''
        if (document.activeElement !== editor && editor.value !== source) {
          editor.value = source
        }
        editor.placeholder = spec.placeholder
        toggle.textContent = 'Done'
      } else {
        editor.style.display = 'none'
        output.style.display = ''
        output.textContent = ''
        output.classList.remove('is-error')
        render(output, node)
        toggle.textContent = source ? 'Edit source' : 'Empty'
      }
    }

    const setAttr = (value: string) => {
      const pos = props.getPos()
      if (typeof pos !== 'number') return
      const node = props.node
      props.editor.view.dispatch(
        props.editor.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          [spec.attr]: value,
        }),
      )
    }

    toggle.addEventListener('mousedown', (e) => {
      // Keep ProseMirror from stealing focus before the toggle takes effect.
      e.preventDefault()
      editing = !editing
      paint(props.node)
      if (editing) editor.focus()
      else props.editor.commands.focus()
    })

    editor.addEventListener('input', () => {
      selfUpdate = true
      setAttr(editor.value)
      selfUpdate = false
    })

    editor.addEventListener('keydown', (e) => {
      // Enter inserts a newline — the author is writing LaTeX or diagram source, and the
      // editor must not submit or insert a paragraph here.
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        editing = false
        paint(props.node)
        props.editor.commands.focus()
      }
    })

    bar.append(label, toggle)
    root.append(bar, output, editor)
    paint(props.node)

    // Repaint on every editor transaction rather than through the node view's `update`
    // hook. TipTap 3 documents `update(props)` but *types* it as ProseMirror's
    // `update(node, decorations, innerDecorations)`, and the two disagree about what
    // arrives — a disagreement that varies by code path. The transaction stream is the one
    // signal that is documented, typed, and always fires, and reading the node's current
    // attributes from it is a single source of truth rather than a reassigned props object.
    const repaint = () => {
      const pos = props.getPos()
      if (typeof pos !== 'number') return
      const node = props.editor.state.doc.nodeAt(pos)
      if (node && node.type === props.node.type) paint(node)
    }
    props.editor.on('transaction', repaint)

    return {
      dom: root,
      // The whole node is atomic: ProseMirror must never map a selection into generated
      // DOM, which is the failure mode that produces caret drift inside KaTeX and Mermaid.
      contentDOM: null,
      ignoreMutation: () => true,
      destroy: () => props.editor.off('transaction', repaint),
      selectNode: () => root.classList.add('is-selected'),
      deselectNode: () => root.classList.remove('is-selected'),
    }
  }
}

/* ──────────────────────────────────────────────────────────────
 * Math
 * ──────────────────────────────────────────────────────────────*/

function paintMath(el: HTMLElement, source: string, display: boolean): void {
  if (!source.trim()) {
    el.classList.add('is-empty')
    el.textContent = 'Empty formula'
    return
  }
  try {
    // `throwOnError: false` renders the broken part in red rather than throwing, so a
    // half-typed formula degrades instead of blanking the document.
    el.innerHTML = katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
      strict: false,
    })
  } catch {
    el.textContent = source
  }
}

export const InlineMathNode = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { latex: { default: '', parseHTML: (e) => e.getAttribute('data-latex') ?? '' } }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math"]' }]
  },

  // No content hole: an atom is a leaf, and ProseMirror rejects `0` in a leaf spec.
  // The attribute is renamed to `data-latex` so the HTML round-trips through
  // `htmlBridge`, which reads and writes exactly this shape.
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math',
        'data-latex': node.attrs['latex'],
      }),
    ]
  },

  renderText({ node }) {
    return `$${node.attrs['latex']}$`
  },

  addNodeView() {
    return createSourceNodeView(
      { attr: 'latex', placeholder: 'e^{i\\pi} + 1 = 0', label: 'math' },
      (el, node) => paintMath(el, String(node.attrs['latex'] ?? ''), false),
    )
  },
})

export const MathBlockNode = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return { latex: { default: '', parseHTML: (e) => e.getAttribute('data-latex') ?? '' } }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-block',
        'data-latex': node.attrs['latex'],
      }),
    ]
  },

  renderText({ node }) {
    return `$$\n${node.attrs['latex']}\n$$`
  },

  addNodeView() {
    return createSourceNodeView(
      { attr: 'latex', placeholder: '\\int_0^1 x^2\\,dx', label: 'display math' },
      (el, node) => paintMath(el, String(node.attrs['latex'] ?? ''), true),
    )
  },
})

/* ──────────────────────────────────────────────────────────────
 * Diagrams
 * ──────────────────────────────────────────────────────────────*/

export const DiagramNode = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      kind: { default: 'mermaid', parseHTML: (e) => e.getAttribute('data-kind') ?? 'mermaid' },
      code: { default: '', parseHTML: (e) => e.getAttribute('data-code') ?? '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="diagram"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'diagram',
        'data-kind': node.attrs['kind'],
        'data-code': node.attrs['code'],
      }),
    ]
  },

  renderText({ node }) {
    return `\`\`\`${node.attrs['kind']}\n${node.attrs['code']}\n\`\`\``
  },

  addNodeView() {
    return createSourceNodeView(
      { attr: 'code', placeholder: 'flowchart LR\n  A --> B', label: 'diagram' },
      (el, node) => {
        const code = String(node.attrs['code'] ?? '')
        if (!code.trim()) {
          el.classList.add('is-empty')
          el.textContent = 'Empty diagram'
          return
        }
        void renderMermaid(el, code)
      },
    )
  },
})