/**
 * @vitest-environment jsdom
 *
 * App smoke test.
 *
 * Mounts the real application and drives it the way a person would. This catches the class
 * of breakage a unit test on the core cannot see — a bad import, a component that throws on
 * mount, a view switch that detaches the editor.
 *
 * It runs against the in-memory platform (src/platform/web.ts), which is also how the editor
 * is demonstrated without booting Electron.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

let container: HTMLDivElement
let root: Root

beforeAll(async () => {
  // jsdom ships neither of these and the editor uses both on mount.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia ??= ((q: string) =>
    ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as unknown as typeof window.matchMedia) as typeof window.matchMedia

  document.body.innerHTML = '<div id="root"></div>'
  container = document.getElementById('root')!

  const { App } = await import('../src/renderer/src/App')
  root = createRoot(container)
  root.render(createElement(App))
  await ready()
})

afterAll(() => root?.unmount())

/**
 * The app boots asynchronously: it loads settings, then restores the previous session (or
 * falls back to the welcome document), and only then pushes text into the editor.
 *
 * Polling for the editor's `<h1>` is not enough — the editor is constructed with the welcome
 * content immediately, long before the session resolves, so that matches too early. The
 * outline is derived from session state, so it is the honest readiness signal.
 *
 * The bound is deliberately generous. It is a backstop against a hang, not an assertion
 * about boot time: this file mounts the entire app inside jsdom while the other suites run
 * in parallel, and a tight budget here turns a loaded machine into a red build that says
 * nothing about the code.
 */
async function ready(timeoutMs = 30000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 25))
    if (container.querySelector('[aria-label="Document outline"] a')) return
  }
  throw new Error(
    `app did not finish booting; outline links found: ${
      container.querySelectorAll('[aria-label="Document outline"] a').length
    }`,
  )
}

/** Let React flush effects and any microtask-scheduled state updates. */
function tick(ms = 250): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function click(el: Element | null | undefined): void {
  if (!el) throw new Error('expected an element to click')
  ;(el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function byLabel(text: string): HTMLElement | null {
  return [...container.querySelectorAll('button,[role=group] > button')].find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLElement | null
}

/**
 * React installs its own `value` setter on inputs to detect changes. Writing through the
 * native prototype setter is what makes React see a programmatic edit as a real one.
 */
function setNativeValue(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('app shell', () => {
  it('mounts without throwing', () => {
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders a live editor surface', () => {
    const surface = container.querySelector('.editor-surface') as HTMLElement
    expect(surface).toBeTruthy()
    expect(surface.getAttribute('contenteditable')).toBe('true')
  })

  it('renders the welcome document as prose, not as source characters', () => {
    const html = container.querySelector('.editor-surface')!.innerHTML
    expect(html).toContain('<h1')
    expect(html).toContain('Valence')
    // Headings resolved into elements — the markdown markers are gone.
    expect(html).not.toContain('# Writing in Valence')
  })

  it('renders tables, code blocks and lists as structure', () => {
    const surface = container.querySelector('.editor-surface')!
    expect(surface.querySelectorAll('table').length).toBeGreaterThan(0)
    expect(surface.querySelectorAll('pre').length).toBeGreaterThan(0)
    expect(surface.querySelectorAll('ul, ol').length).toBeGreaterThan(0)
    expect(surface.querySelectorAll('blockquote').length).toBeGreaterThan(0)
  })

  it('has the signature strata gutter', () => {
    expect(container.querySelector('[aria-label="Document position"]')).toBeTruthy()
  })

  it('shows a word count and a reading time', () => {
    expect(container.textContent).toMatch(/[\d,]+ words/)
    expect(container.textContent).toContain('Reading time')
  })

  it('opens the outline panel by default, populated from the document', () => {
    const nav = container.querySelector('[aria-label="Document outline"]')
    expect(nav).toBeTruthy()
    expect(nav!.textContent).toContain('Writing in Valence')
  })

  it('has a resizable sidebar and an accessible rail', () => {
    expect(container.querySelector('[aria-label="Panels"]')).toBeTruthy()
    expect(container.querySelectorAll('[role="separator"]').length).toBeGreaterThan(0)
  })
})

describe('views over one document', () => {
  it('switches to source without detaching the document', async () => {
    click(byLabel('Source'))
    await tick()

    const textarea = container.querySelector('textarea[data-view="source"]') as HTMLTextAreaElement
    expect(textarea, 'source view should render an editable textarea').toBeTruthy()
    expect(textarea.value).toContain('# Writing in Valence')
    // Two-way bound, and editable — not a read-only mirror.
    expect(textarea.readOnly).toBe(false)
  })

  it('parses edits made in source back into editor state', async () => {
    const textarea = container.querySelector('textarea[data-view="source"]') as HTMLTextAreaElement
    const before = textarea.value

    setNativeValue(textarea, `${before}\n\n## A heading typed in source\n`)
    await tick()

    click(byLabel('Hybrid'))
    await tick()

    const surface = container.querySelector('.editor-surface')!
    const headings = [...surface.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headings).toContain('A heading typed in source')
  })

  it('renders the read pipeline beside the editor in split view', async () => {
    click(byLabel('Split'))
    await tick(700)

    const pane = container.querySelector('.split-pane')
    expect(pane).toBeTruthy()
    const read = container.querySelector('.read-surface') as HTMLElement
    expect(read).toBeTruthy()
    expect(read.innerHTML.length).toBeGreaterThan(0)
  })
})

describe('chrome', () => {
  it('switches theme and records it on the document element', async () => {
    click(container.querySelector('[aria-label="Switch to dark theme"]'))
    await tick()
    expect(document.documentElement.dataset.theme).toBe('dark')

    click(container.querySelector('[aria-label="Switch to light theme"]'))
    await tick()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('opens and closes panels from the rail', async () => {
    click(container.querySelector('[aria-label="Search"]'))
    await tick()
    expect(container.querySelector('[aria-label="Find in document"]')).toBeTruthy()

    click(container.querySelector('[aria-label="Search"]'))
    await tick()
    expect(container.querySelector('[aria-label="Find in document"]')).toBeNull()
  })
})

describe('export dialog', () => {
  /** Ctrl+E is handled on the document, so it needs a real KeyboardEvent. */
  async function pressCtrlE(): Promise<void> {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true, cancelable: true }),
    )
    await tick()
  }

  it('opens on Ctrl+E and lists the formats the platform offers', async () => {
    await pressCtrlE()
    const dialog = container.querySelector('[role="dialog"][aria-label="Export"]')
    expect(dialog).toBeTruthy()

    // The web platform offers HTML and PDF only -- it must not advertise Pandoc formats.
    const labels = [...dialog!.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(labels.some((l) => l.includes('Web Page'))).toBe(true)
    expect(labels.some((l) => l.includes('PDF'))).toBe(true)
    expect(labels.some((l) => l.includes('Word'))).toBe(false)
  })

  it('explains why Pandoc formats are unavailable rather than failing on click', async () => {
    await pressCtrlE()
    const dialog = container.querySelector('[role="dialog"][aria-label="Export"]')!
    // hasPandoc() is false in the browser fallback, so the dialog must say so outright.
    expect(dialog.textContent).toMatch(/Pandoc is not installed/i)
  })

  it('closes without exporting when dismissed', async () => {
    await pressCtrlE()
    click(container.querySelector('[aria-label="Close export dialog"]'))
    await tick()
    expect(container.querySelector('[role="dialog"][aria-label="Export"]')).toBeNull()
  })
})