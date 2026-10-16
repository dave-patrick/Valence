/**
 * Mermaid rendering for the editor.
 *
 * Mermaid's default entry registers every diagram type, including ELK (2.5 MB) and
 * cytoscape (0.85 MB) — cost paid by every document that contains no diagram at all. This
 * module loads it lazily and registers only the diagram families that appear in practice,
 * so the 3 MB is never fetched unless a diagram is actually rendered.
 */

type MermaidApi = typeof import('mermaid').default

let api: Promise<MermaidApi> | null = null
let counter = 0

async function load(dark: boolean): Promise<MermaidApi> {
  if (!api) {
    api = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'default',
        fontFamily: 'var(--font-sans)',
        // `htmlLabels` puts node labels in a `<foreignObject>`, which Mermaid measures via
        // that element's layout. Where that measurement returns zero — some offscreen and
        // embedded webviews — Mermaid falls back to a nominal `width="400em"`, producing a
        // 400000-unit viewBox and a diagram ~7600px wide and 1px tall. Plain SVG `<text>`
        // measures reliably everywhere, and the visual difference is negligible for the
        // label content diagrams actually carry.
        flowchart: { htmlLabels: false, useMaxWidth: true },
      })
      return mermaid
    })
  }
  return api
}

/**
 * Renders `source` into `el`. Mermaid is async and can fail on half-typed syntax, so a
 * failure shows the source *and the reason* rather than an empty box — an author
 * mid-way through a diagram must never be left staring at a blank frame with no clue.
 */
export async function renderMermaid(el: HTMLElement, source: string): Promise<void> {
  const code = source.trim()
  if (!code) return

  // Mermaid measures the diagram by laying it out in a scratch element inside `<body>`. If
  // that happens before our container is attached — which it is, because a NodeView is
  // built during editor construction — Mermaid falls back to a nominal width and emits a
  // `viewBox` of hundreds of thousands of units, rendering the diagram illegibly.
  await whenAttached(el)

  const dark = document.documentElement.dataset.theme === 'dark'
  const mermaid = await load(dark)
  const id = `valence-mmd-${++counter}-${Math.random().toString(36).slice(2, 7)}`

  // Webfonts change text metrics, and Mermaid measures text to size the diagram. Rendering
  // before Newsreader lands produces a diagram sized for the fallback face.
  try {
    await document.fonts.ready
  } catch {
    /* Font Loading API absent; measuring anyway. */
  }

  try {
    // Passing `el` as the container tells Mermaid to measure inside an element that is
    // already in the document. Without it, Mermaid measures in a scratch node it creates
    // itself and emits its nominal fallback width (a 400000-unit viewBox) when that
    // measurement comes back zero — which renders the diagram ~7600px wide and 21px tall.
    const { svg } = await mermaid.render(id, code, el)
    el.innerHTML = svg
    const s = el.querySelector('svg')
    if (s) {
      // Mermaid emits an inline `max-width` in px; force the column width when that
      // measurement was the fallback, so a diagram can never blow out the measure.
      const vb = s.getAttribute('viewBox')
      const unmeasured = !vb || vb.split(/\s+/)[2] === '400000'
      s.style.display = 'block'
      s.style.height = 'auto'
      if (unmeasured) {
        s.style.maxWidth = '100%'
        s.style.width = '100%'
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    el.classList.add('is-error')
    el.textContent = code
    const note = document.createElement('div')
    note.className = 'valence-diagram-error'
    note.textContent = reason.split('\n').slice(0, 3).join(' ')
    el.appendChild(note)
  }
}

/**
 * Resolves once `el` is in the document, or after ~2s. ProseMirror attaches node views
 * synchronously during construction, so in practice this resolves on the next frame; the
 * cap stops a detached node from leaking the promise forever.
 */
function whenAttached(el: HTMLElement): Promise<void> {
  if (el.isConnected) return Promise.resolve()
  return new Promise((resolve) => {
    let frames = 0
    const check = () => {
      if (el.isConnected || ++frames > 120) {
        resolve()
        return
      }
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}

/** Warms the module so the first diagram does not stall on a 3 MB import. */
export function preloadMermaid(): void {
  void load(false)
}