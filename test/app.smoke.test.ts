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

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
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
  // Also absent in jsdom. The command palette calls it to keep the highlighted row in view;
  // real browsers have had it for years, so this is a jsdom gap rather than a guarded call
  // in the component.
  Element.prototype.scrollIntoView ??= function scrollIntoView() {}
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

/**
 * Waits for a DOM predicate instead of sleeping a fixed amount.
 *
 * Every "click, then assert it appeared" test in this file used to wait a flat 250ms. That is
 * a guess about React's scheduling, and it holds only on a quiet machine: under parallel
 * load the commit lands later and the assertion fails, which is indistinguishable from a
 * real bug and trains everyone to re-run instead of reading. Polling makes these tests
 * deterministic at no cost when the machine is fast.
 */
async function waitFor<T>(
  read: () => T | null | undefined | false,
  label = 'condition',
  timeoutMs = 10000,
): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = read()
    if (value) return value as T
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${label}`)
    }
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** Clicks and waits for the result, so no test depends on a scheduler's timing. */
async function clickAndWait(label: string, what: string): Promise<HTMLElement> {
  const el = await waitFor(() => container.querySelector(what), `${label} (${what})`)
  click(el)
  await tick(60)
  return el as HTMLElement
}

/** Waits for something to disappear, which is how a close is asserted. */
async function waitGone(what: string, label = what, timeoutMs = 10000): Promise<void> {
  const start = Date.now()
  while (container.querySelector(what)) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label} to disappear`)
    await new Promise((r) => setTimeout(r, 20))
  }
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

    const textarea = await waitFor(
      () => container.querySelector('textarea[data-view="source"]') as HTMLTextAreaElement | null,
      'the source view',
    )
    expect(textarea.value).toContain('# Writing in Valence')
    // Two-way bound, and editable — not a read-only mirror.
    expect(textarea.readOnly).toBe(false)
  })

  it('parses edits made in source back into editor state', async () => {
    const textarea = await waitFor(
      () => container.querySelector('textarea[data-view="source"]') as HTMLTextAreaElement | null,
      'the source view',
    )
    const before = textarea.value

    setNativeValue(textarea, `${before}\n\n## A heading typed in source\n`)
    await tick()

    click(byLabel('Hybrid'))

    // Wait for the outcome, not the surface: switching back mounts the editor immediately,
    // but the source text has to be parsed into it asynchronously.
    const headings = await waitFor(() => {
      const surface = container.querySelector('.editor-surface')
      if (!surface) return null
      const found = [...surface.querySelectorAll('h2')].map((h) => h.textContent)
      return found.includes('A heading typed in source') ? found : null
    }, 'the typed heading to reach the editor')
    expect(headings).toContain('A heading typed in source')
  })

  it('renders the read pipeline beside the editor in split view', async () => {
    click(byLabel('Split'))

    const pane = await waitFor(() => container.querySelector('.split-pane'), 'the split pane')
    expect(pane).toBeTruthy()
    // The read pane is populated asynchronously by the render pipeline, so its content is
    // what to wait on — not the pane's existence.
    const read = await waitFor(() => {
      const el = container.querySelector('.read-surface') as HTMLElement | null
      return el && el.innerHTML.length > 0 ? el : null
    }, 'rendered read pane')
    expect(read.innerHTML.length).toBeGreaterThan(0)
  })
})

describe('chrome', () => {
  it('switches theme and records it on the document element', async () => {
    await clickAndWait('theme toggle', '[aria-label="Switch to dark theme"]')
    await waitFor(() => document.documentElement.dataset.theme === 'dark', 'dark theme')

    await clickAndWait('theme toggle', '[aria-label="Switch to light theme"]')
    await waitFor(() => document.documentElement.dataset.theme === 'light', 'light theme')
  })

  it('opens and closes panels from the rail', async () => {
    await clickAndWait('search panel', '[aria-label="Search"]')
    await waitFor(
      () => container.querySelector('[aria-label="Find in document"]'),
      'the search panel',
    )

    await clickAndWait('search panel', '[aria-label="Search"]')
    await waitGone('[aria-label="Find in document"]', 'the search panel')
  })
})

describe('export dialog', () => {
  /** Ctrl+E is handled on the document, so it needs a real KeyboardEvent. */
  async function pressCtrlE(): Promise<HTMLElement> {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true, cancelable: true }),
    )
    // The dialog fetches the format list on mount, so wait for the rows rather than the
    // shell — an empty dialog is the loading state, not the result.
    return waitFor(() => {
      const d = container.querySelector('[role="dialog"][aria-label="Export"]') as HTMLElement | null
      return d && d.querySelectorAll('button').length > 1 ? d : null
    }, 'the export dialog')
  }

  it('opens on Ctrl+E and lists the formats the platform offers', async () => {
    const dialog = await pressCtrlE()

    // The web platform offers HTML and PDF only -- it must not advertise Pandoc formats.
    const labels = [...dialog.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(labels.some((l) => l.includes('Web Page'))).toBe(true)
    expect(labels.some((l) => l.includes('PDF'))).toBe(true)
    expect(labels.some((l) => l.includes('Word'))).toBe(false)
  })

  it('explains why Pandoc formats are unavailable rather than failing on click', async () => {
    const dialog = await pressCtrlE()
    // hasPandoc() is false in the browser fallback, so the dialog must say so outright.
    expect(dialog.textContent).toMatch(/Pandoc is not installed/i)
  })

  it('closes without exporting when dismissed', async () => {
    await pressCtrlE()
    click(container.querySelector('[aria-label="Close export dialog"]'))
    await waitGone('[role="dialog"][aria-label="Export"]', 'the export dialog')
  })
})

describe('command palette', () => {
  const input = () => container.querySelector('[aria-label="Type a command"]') as HTMLInputElement | null
  const rows = () =>
    [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim() ?? '')
  const selected = () =>
    container.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim() ?? null

  function type(el: HTMLInputElement, text: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const press = (el: HTMLElement, key: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

  async function closeIfOpen(): Promise<void> {
    if (!input()) return
    press(input()!, 'Escape')
    await waitGone('[aria-label="Command palette"]', 'the palette', 2000)
  }

  /**
   * Opens a *fresh* palette.
   *
   * Closes one first if it is already up. Ctrl+P is inert while the palette is open — it has
   * to be, or typing "p" into the query would reopen the palette under you — so a test that
   * inherited a half-typed palette from the previous one would silently keep that query.
   */
  async function open(): Promise<HTMLInputElement> {
    await closeIfOpen()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }),
    )
    const el = await waitFor(() => input(), 'the palette input', 2000)
    await waitFor(() => rows().length > 0, 'palette results', 2000)
    return el
  }

  afterEach(closeIfOpen)

  it('opens on Ctrl+P with the input focused', async () => {
    const el = await open()
    expect(document.activeElement).toBe(el)
  })

  it('lists every command when nothing is typed', async () => {
    await open()
    // Grouped by category, so the first entries are the File group.
    expect(rows()[0]).toContain('New document')
    expect(container.textContent).toContain('File')
    expect(container.textContent).toContain('Writing')
  })

  it('filters as you type and ranks the best match first', async () => {
    const el = await open()
    type(el, 'export')
    await waitFor(() => rows()[0]?.includes('Export'), 'Export to rank first', 2000)
    expect(rows()[0]).toContain('Export')
  })

  it('finds a command by a keyword it does not display', async () => {
    const el = await open()
    type(el, 'word')
    await waitFor(() => rows().length > 0, 'keyword results', 2000)
    expect(rows().some((r) => r.includes('Export'))).toBe(true)
  })

  it('says so when nothing matches, rather than showing a bare list', async () => {
    const el = await open()
    type(el, 'zzzzz')
    await waitFor(() => rows().length === 0, 'an empty result list', 2000)
    expect(container.textContent).toMatch(/No command matches/i)
  })

  it('moves the selection with the arrow keys', async () => {
    const el = await open()
    type(el, 'view')
    await waitFor(() => rows().length > 1, 'several view commands', 2000)

    const first = selected()
    press(el, 'ArrowDown')
    await tick()
    expect(selected()).not.toBe(first)
  })

  it('wraps from the first entry to the last on ArrowUp', async () => {
    const el = await open()
    await waitFor(() => rows().length > 1, 'the full list', 2000)

    press(el, 'ArrowUp')
    await tick()
    expect(selected()).toBe(rows()[rows().length - 1])
  })

  it('runs the highlighted command on Enter and closes', async () => {
    const el = await open()
    type(el, 'view source')
    await waitFor(() => selected()?.includes('View: source'), 'View: source to rank first', 2000)

    press(el, 'Enter')
    await waitGone('[aria-label="Command palette"]', 'the palette', 2000)

    // The command really ran: the source view replaced the editor.
    expect(container.querySelector('textarea[data-view="source"]')).toBeTruthy()
  })

  it('closes on Escape without running anything', async () => {
    const el = await open()
    const before = !!container.querySelector('textarea[data-view="source"]')
    press(el, 'Escape')
    await waitGone('[aria-label="Command palette"]', 'the palette', 2000)
    expect(!!container.querySelector('textarea[data-view="source"]')).toBe(before)
  })

  it('closes when the backdrop is clicked, but not when the panel is', async () => {
    await open()
    // A press that starts inside must not dismiss.
    input()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await tick()
    expect(input()).toBeTruthy()

    container
      .querySelector('[aria-label="Command palette"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await waitGone('[aria-label="Command palette"]', 'the palette', 2000)
  })

  it('runs a command when its row is clicked', async () => {
    const el = await open()
    const before = document.documentElement.dataset.theme
    type(el, 'toggle light and dark theme')
    await waitFor(() => selected(), 'a selected row', 2000)

    click(container.querySelector('[role="option"][aria-selected="true"]'))
    await waitGone('[aria-label="Command palette"]', 'the palette', 2000)
    expect(document.documentElement.dataset.theme).not.toBe(before)
  })
})

describe('wiki links', () => {
  it('renders `[[Note]]` as a styled clickable mark instead of bracketed text', async () => {
    const src = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Source')
    click(src)
    const ta = await waitFor(
      () => container.querySelector('textarea[data-view="source"]') as HTMLTextAreaElement | null,
      'source view',
    )
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(ta, '# Doc\\n\\nSee [[Ideas]] and [[Ideas|alias]].\\n')
    ta.dispatchEvent(new Event('input', { bubbles: true }))

    // Give React time to process the source edit, then switch back to hybrid.
    await waitFor(() => ta.value.includes('alias'), 'the edited source')
    click([...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hybrid'))
    const el = await waitFor(
      () => container.querySelector('[data-type="wikilink"]') as HTMLElement | null,
      'the wikilink mark',
    )
    expect(el.textContent).not.toContain('[')
    expect(el.getAttribute('data-target')).toBe('Ideas')
    // The brackets never reach the screen.
    expect(container.textContent).not.toMatch(/\[\[Ideas/)
  })

  it('does not crash when a wikilink is clicked', async () => {
    const link = container.querySelector('[data-type="wikilink"]') as HTMLElement | null
    if (link) click(link)
    await tick()
    // Whatever the click does (or does not do), the app stays mounted.
    expect(container.querySelector('.ProseMirror')).toBeTruthy()
  })
})

describe('files panel', () => {
  const emptyState = () => /Open a folder to browse it/i.test(container.textContent ?? '')

  it('opens with an explained empty state and closes again', async () => {
    // Self-contained on purpose: this asserts the whole open/close cycle, so it must not
    // depend on which panel the previous test happened to leave open.
    await clickAndWait('files panel', '[aria-label="Files"]')
    await waitFor(emptyState, 'the files panel empty state', 4000)

    // The welcome document has no path, so there is no folder to root a tree at. The panel
    // has to say that rather than render an empty box or throw.
    expect(container.querySelector('[role="tree"]')).toBeNull()

    await clickAndWait('files panel', '[aria-label="Files"]')
    const start = Date.now()
    while (emptyState()) {
      if (Date.now() - start > 4000) throw new Error('the files panel did not close')
      await new Promise((r) => setTimeout(r, 20))
    }
  })
})