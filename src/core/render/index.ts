/**
 * The render pipeline: markdown -> HTML.
 *
 * Deliberately separate from the editor engine (docs/02-architecture.md Â§1.6). Editing needs
 * exactness and speed; export needs beauty and breadth. Forcing one pipeline to do both is
 * how you end up with either a slow editor or a lossy export. This one can afford to be slow
 * and to reach for high-quality renderers.
 */

import MarkdownIt from 'markdown-it'
import type { StateBlock, StateInline } from 'markdown-it'
import katex from 'katex'
import { codeToHtml } from 'shiki'
import { parseFrontMatter, readScalar } from '../../shared/frontMatter'

export interface RenderOptions {
  /** Emit a full standalone document. */
  standalone?: boolean
  title?: string
  /** 'light' | 'dark' | 'auto'. Drives syntax and diagram themes. */
  mode?: 'light' | 'dark'
  /** Theme name for the prose surface. */
  theme?: string
}

export interface RenderResult {
  /** Renderable immediately. Diagram fences are placeholders, not yet SVG. */
  html: string
  title: string
  /** How many diagram fences the document contains. */
  diagrams: number
  /**
   * The same document with every diagram resolved.
   *
   * Slow, and deliberately so: it pulls in Mermaid, which is megabytes of graph-rendering
   * library. Awaiting this before showing anything means a single diagram in an otherwise
   * plain document leaves the reader blank while that loads — so callers that render for
   * *reading* use `html` first and swap in `hydrated` when it lands. Callers that render for
   * *output* (export, print) must await it, because a placeholder in a PDF is a bug.
   */
  hydrated: Promise<string>
}

const MATH_BLOCK = (state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean => {
  if (silent) return true

  const start = state.bMarks[startLine] + state.tShift[startLine]!
  if (state.src.slice(start, start + 2) !== '$$') return false

  const firstLine = state.src.slice(start, state.eMarks[startLine]!)
  const trimmedFirst = firstLine.trim()
  if (!trimmedFirst.endsWith('$$') || trimmedFirst.length === 2) return false

  let lastLine = startLine
  let found = false
  for (let next = startLine + 1; next < endLine; next++) {
    const s = state.bMarks[next]! + state.tShift[next]!
    const line = state.src.slice(s, state.eMarks[next]!).trim()
    if (line === '$$' || (line.endsWith('$$') && line.length > 2)) {
      lastLine = next
      found = true
      break
    }
  }
  if (!found) return false

  state.line = lastLine + 1
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = state.getLines(startLine + 1, lastLine, state.blkIndent, false)
  token.map = [startLine, state.line]
  token.markup = '$$'
  return true
}

const MATH_INLINE = (state: StateInline, silent: boolean): boolean => {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false
  if (state.src.charCodeAt(start + 1) !== 0x24) return false
  const end = state.src.indexOf('$$', start + 2)
  if (end === -1) return false
  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.content = state.src.slice(start + 2, end)
  }
  state.pos = end + 2
  return true
}

let cachedHighlighter: ReturnType<typeof createHighlighter> | null = null

function createHighlighter() {
  return import('shiki').then((m) =>
    m.createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'docker', 'go', 'graphql', 'html',
        'java', 'javascript', 'json', 'kotlin', 'lua', 'markdown', 'nginx', 'objective-c',
        'perl', 'php', 'python', 'r', 'ruby', 'rust', 'scala', 'sql', 'swift', 'toml',
        'typescript', 'tsx', 'vue', 'xml', 'yaml', 'zig',
      ],
    }),
  )
}

export async function renderToHtml(source: string, options: RenderOptions = {}): Promise<RenderResult> {
  const mode = options.mode ?? 'light'
  const { data, body } = parseFrontMatter(source)
  const title = options.title ?? readScalar(data ?? '', 'title') ?? 'Untitled'

  cachedHighlighter ??= createHighlighter()
  const hl = await cachedHighlighter

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false, // never in export â€” it silently rewrites the user's bytes
  })
    .use((m) => {
      m.block.ruler.before('fence', 'valence_math_block', MATH_BLOCK)
      m.inline.ruler.push('valence_math_inline', MATH_INLINE)
    })
    .use((m) => {
      m.renderer.rules.math_inline = (tokens, idx) =>
        katex.renderToString(tokens[idx]!.content, { throwOnError: false, displayMode: false })
      m.renderer.rules.math_block = (tokens, idx) =>
        `<div class="valence-math">${katex.renderToString(tokens[idx]!.content, {
          throwOnError: false,
          displayMode: true,
        })}</div>`
    })
    .use((m) => {
      // Shiki is async and markdown-it's renderer is synchronous, so fences emit
      // placeholders that are swapped in after render() returns. This keeps the renderer
      // synchronous instead of forking markdown-it's render loop.
      const pending: { id: string; lang: string; code: string }[] = []
      m.renderer.rules.fence = (tokens, idx) => {
        const token = tokens[idx]!
        const lang = (token.info || '').trim().split(/\s+/)[0] || 'text'
        const id = `valence-code-${pending.length}`
        pending.push({ id, lang, code: token.content })
        return `<div id="${id}"></div>`
      }
      ;(m as unknown as { __pending: typeof pending }).__pending = pending
    })

  const bodyHtml = md.render(body, {})
  const pending =
    (md as unknown as { __pending: { id: string; lang: string; code: string }[] }).__pending ?? []

  let resolved = bodyHtml
  const theme = mode === 'dark' ? 'github-dark' : 'github-light'
  const diagrams: Diagram[] = []

  for (const item of pending) {
    // Diagram languages go to the diagram renderer, not the syntax highlighter. Shiki would
    // happily colour `graph TD; A-->B` as a code sample, which is exactly wrong.
    if (isDiagram(item.lang)) {
      diagrams.push({ lang: item.lang, source: item.code.trim() })
      resolved = resolved.replace(`<div id="${item.id}"></div>`, PLACEHOLDER)
      continue
    }

    const loaded = hl.getLoadedLanguages().includes(item.lang)
    const rendered = await hl.codeToHtml(item.code, {
      lang: loaded ? item.lang : 'text',
      theme,
    })
    resolved = resolved.replace(
      `<div id="${item.id}"></div>`,
      `<div class="valence-code" data-lang="${escapeHtml(item.lang)}">${rendered}</div>`,
    )
  }

  const withPlaceholders = resolved

  const hydratedDiagrams = renderDiagrams(withPlaceholders, diagrams, mode)

  const hydrated = hydratedDiagrams.then((h) =>
    options.standalone ? standaloneDocument(title, (data ?? '') + '\n' + h, options) : h,
  )

  return {
    title,
    html: withPlaceholders,
    diagrams: diagrams.length,
    hydrated: hydrated,
  }
}

function isDiagram(lang: string): boolean {
  return ['mermaid', 'vega', 'vega-lite', 'plantuml', 'abc', 'graphviz'].includes(lang)
}

interface Diagram {
  lang: string
  source: string
}

/** Exact markup for a diagram that has not rendered yet. */
const PLACEHOLDER = '<figure class="valence-diagram valence-diagram--pending"></figure>'
const DIAGRAM = 'valence-diagram'
const FAILURE = 'valence-diagram valence-diagram--failed'

/**
 * Resolves every diagram, or fails gracefully per-diagram.
 *
 * A diagram that will not render shows its own source instead of taking the document down
 * with it — one bad fence in a long note should cost you one figure, not the page.
 */
async function renderDiagrams(html: string, diagrams: readonly Diagram[], mode: 'light' | 'dark'): Promise<string> {
  if (!diagrams.length) return html

  const mermaid = (await import('mermaid')).default
  mermaid.initialize({
    startOnLoad: false,
    theme: mode === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: 'var(--font-sans)',
  })

  const rendered = await Promise.all(
    diagrams.map(async (d, i) => {
      try {
        const { svg } = await mermaid.render(`d${i + 1}`, d.source)
        return { body: svg, failed: false }
      } catch {
        return {
          body: `<pre class="valence-diagram__source">${escapeHtml(d.source)}</pre>`,
          failed: true,
        }
      }
    }),
  )

  // Every placeholder is byte-identical, so replacing the first remaining one per diagram
  // consumes them in document order. Nothing here depends on matching a unique token, which
  // is what made the previous single-pass `replace` fragile.
  let out = html
  for (const { body, failed } of rendered) {
    out = out.replace(PLACEHOLDER, `<figure class="${failed ? FAILURE : DIAGRAM}">${body}</figure>`)
  }
  return out
}

function standaloneDocument(title: string, bodyHtml: string, options: RenderOptions): string {
  const fonts = `
    @font-face{font-family:'Newsreader';src:local('Newsreader'),local('Georgia');font-display:swap}
    body{font-family:'Newsreader',Georgia,serif;font-size:19px;line-height:1.65;color:#1a1d23;background:#f4f5f7;
      max-width:34rem;margin:0 auto;padding:4rem 1.5rem;hyphens:auto}
    h1,h2,h3,h4{font-weight:600;line-height:1.2;margin:2em 0 .6em;letter-spacing:-.01em}
    h1{font-size:1.9em}h2{font-size:1.45em}h3{font-size:1.18em}
    a{color:#a8762a;text-underline-offset:.18em}
    code{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:.85em;background:#edeff2;padding:.15em .35em;border-radius:3px}
    pre{overflow-x:auto;padding:1rem;border-radius:6px;background:#f6f7f9;border:1px solid #dfe2e7}
    pre code{background:none;padding:0}
    blockquote{margin:1.4em 0;padding-left:1em;border-left:2px solid #a8762a;color:#4a515c}
    table{border-collapse:collapse;width:100%;font-size:.82em;font-family:var(--font-sans)}
    th,td{border:1px solid #dfe2e7;padding:.45em .7em;text-align:left}
    th{background:#edeff2;font-weight:600}
    .valence-math{margin:1.4em 0;overflow-x:auto}
    .valence-diagram{margin:1.6em 0;text-align:center}
    .valence-diagram--failed{font-family:ui-monospace,monospace;font-size:.8em;color:#a8762a;text-align:left;white-space:pre}
    img{max-width:100%;height:auto;border-radius:4px}
    hr{border:none;border-top:1px solid #dfe2e7;margin:2.5em 0}
    @media (prefers-color-scheme:dark){
      body{color:#e6e8ec;background:#131519}
      a{color:#d9a44b}code{background:#21252c}
      pre{background:#1a1d23;border-color:#2a2f37}
      blockquote{color:#a8afbb;border-left-color:#d9a44b}
      th{background:#21252c}th,td{border-color:#2a2f37}
    }
    @page{margin:22mm 18mm}
    @media print{body{background:#fff;padding:0;font-size:11.5pt}.valence-no-print{display:none}}
  `
  void options
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${fonts}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
