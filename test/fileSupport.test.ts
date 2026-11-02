/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { App } from '../src/renderer/src/App'
import { createExtensions } from '../src/core/editor/extensions'
import { blocksToHtml } from '../src/core/htmlBridge'
import { parseMarkdown } from '../src/core/markdown/parse'
import { DEFAULT_SETTINGS } from '../src/core/settings'
import { setPlatform } from '../src/platform'
import { createWebPlatform } from '../src/platform/web'
import { DOCUMENT_EXTENSIONS, isDocument, isMarkdownDocument } from '../src/shared/fileTypes'
import { buildTree } from '../src/features/files/tree'
import { scanVault } from '../src/features/workspace/scan'
import { outlineOf } from '../src/features/outline/outline'
import { headingIndex } from '../src/features/outline/navigation'
import { saveSnapshot } from '../src/features/history/history'

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.scrollIntoView ??= function () {}
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
})

let root: Root | undefined
afterEach(() => { root?.unmount(); root = undefined; document.body.innerHTML = ''; vi.restoreAllMocks() })

async function until(check: () => unknown) {
  for (let i = 0; i < 300; i++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('UI condition did not resolve')
}
function click(el: Element | null) {
  if (!el) throw new Error('missing click target')
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
function button(label: string) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null
}
function edit(el: HTMLTextAreaElement, text: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
async function mount(files: Record<string, string>) {
  localStorage.clear()
  const platform = createWebPlatform()
  for (const [path, source] of Object.entries(files)) await platform.fs.write(path, source)
  await platform.fs.write('valence.settings', JSON.stringify({ ...DEFAULT_SETTINGS, lastSession: Object.keys(files) }))
  setPlatform(platform)
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  root.render(createElement(App))
  await until(() => document.querySelector('[role="tab"]')?.textContent?.includes(Object.keys(files)[0].split('/').pop()!))
  click(document.querySelector('[role="tab"]'))
  return platform
}

describe('text file support', () => {
  it('discovers the same supported text formats in the tree and both workspace scan paths', async () => {
    const entries = DOCUMENT_EXTENSIONS.map((ext) => ({ path: `/notes/file.${ext.toUpperCase()}`, isDirectory: false }))
    entries.push({ path: '/notes/image.png', isDirectory: false })
    expect(buildTree('/notes', entries)).toHaveLength(DOCUMENT_EXTENSIONS.length)
    expect(await scanVault('/notes', async () => entries)).toHaveLength(DOCUMENT_EXTENSIONS.length)
    expect(await scanVault('/notes', async () => [], async () => entries)).toHaveLength(DOCUMENT_EXTENSIONS.length)
    expect(isDocument('/folder.yaml/no-extension')).toBe(false)
    expect(isMarkdownDocument(null)).toBe(true)
    expect(isMarkdownDocument('/notes/config.yml')).toBe(false)
  })

  it.each(['yaml', 'log'])('edits/saves %s verbatim, including CRLF, and survives tab/view switches', async (ext) => {
    const original = '# literal comment\r\nkey:  **literal**\r\n  nested: value\r\n'
    const path = `/notes/file.${ext}`
    const platform = await mount({ [path]: original, '/notes/other.md': '# Other\n' })
    await until(() => document.querySelector('[aria-label="Text source"]'))
    expect(await platform.fs.read(path)).toBe(original)
    const textarea = document.querySelector('textarea')!
    const edited = '# literal comment\nkey:  **changed**\n  nested: value\n\n'
    edit(textarea, edited)
    await until(() => document.body.textContent?.includes('Unsaved'))
    // A keyboard view command also cannot send this document into the rich editor.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, bubbles: true }))
    await until(() => document.querySelector('[aria-label="Text source"]'))
    expect(button('Hybrid')).toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    await until(() => document.body.textContent?.includes('All changes saved'))
    expect(await platform.fs.read(path)).toBe(edited.replace(/\n/g, '\r\n'))
    click(document.querySelector('[role="tab"][title="/notes/other.md"]') ?? [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.includes('other.md'))!)
    await until(() => document.querySelector('.ProseMirror h1')?.textContent === 'Other')
    click([...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.includes(`file.${ext}`))!)
    await until(() => document.querySelector('[aria-label="Text source"]'))
    expect(document.querySelector('textarea')!.value).toBe(edited)
    expect(document.querySelector('[aria-label="Document outline"]')).toBeNull()
  }, 15000)
})

describe('outline extraction and schema mapping', () => {
  it('syncs a restored source snapshot into the rich editor', async () => {
    const path = '/notes/history.md'
    await mount({ [path]: '# Current\n' })
    await until(() => document.querySelector('.ProseMirror h1')?.textContent === 'Current')
    await saveSnapshot(path, '# Restored\n')
    click(button('Source'))
    await until(() => document.querySelector('textarea'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true }))
    await until(() => button('Restore this version'))
    click(button('Restore this version'))
    await until(() => document.querySelector('textarea')!.value === '# Restored\n')
    click(button('Hybrid'))
    await until(() => document.querySelector('.ProseMirror h1')?.textContent === 'Restored')
  })

  it('exports the current text document as escaped HTML and PDF', async () => {
    const source = '# literal <tag> & text\n  key: value\n'
    const platform = await mount({ '/notes/config.yaml': source })
    await until(() => document.querySelector('[aria-label="Text source"]'))
    vi.spyOn(platform.dialog, 'save').mockResolvedValue('/notes/export.html')
    const pdf = vi.spyOn(platform.export, 'toPdf').mockResolvedValue()
    const openExport = async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }))
      await until(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Web Page')))
    }
    await openExport()
    click([...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Web Page'))!)
    await until(() => !document.querySelector('[aria-label="Export"]'))
    const html = await platform.fs.read('/notes/export.html')
    expect(html).toContain('# literal &lt;tag&gt; &amp; text')
    expect(html).toContain('  key: value')
    await openExport()
    const row = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('PDF'))!
    click(row)
    await new Promise((r) => setTimeout(r, 20))
    click(row)
    await until(() => pdf.mock.calls.length > 0)
    expect(pdf.mock.calls[0][0]).toBe(html)
  })

  it('maps formatted, duplicate, setext and nested headings to original CRLF offsets', () => {
    const source = '---\r\ntitle: test\r\n---\r\n# **Same**\r\n\r\n## Same\r\n\r\nSetext\r\n------\r\n\r\n> ### Nested\r\n'
    const outline = outlineOf(source)
    expect(outline.map((h) => h.text)).toEqual(['Same', 'Same', 'Setext', 'Nested'])
    expect(new Set(outline.map((h) => h.id)).size).toBe(4)
    expect(outline[1].offset).toBe(source.indexOf('## Same'))
    expect(outline[2].offset).toBe(source.indexOf('Setext'))
  })

  it('excludes fenced, display-math and footnote headings', () => {
    expect(outlineOf('````\n```\n# Hidden\n````\n\n$$\n# Math\n$$\n\n[^a]: # Footnote\n\n# Real\n').map((h) => h.text)).toEqual(['Real'])
  })

  it('does not treat Markdown-looking text inside raw HTML as a heading', () => {
    expect(outlineOf('<pre>\n# Phantom\n</pre>\n\n# <span>Target</span>').map((h) => h.text)).toEqual(['Target'])
    expect(outlineOf('<div>\n$$ x $$\n# Phantom\n</div>\n\n# Real').map((h) => h.text)).toEqual(['Real'])
  })

  it.each([
    '<h1>HTML</h1>\n\n# Target',
    '<pre><h1>fake</h1></pre>\n\n# Target',
    '[^a]: # Footnote\n\n# Target',
    '$$\n# Phantom\n$$\n\n# Target',
  ])('selects the schema heading after tricky prefix: %s', (source) => {
    const editor = new Editor({ extensions: createExtensions(), content: blocksToHtml(parseMarkdown(source).blocks) })
    try {
      const entry = outlineOf(source).find((h) => h.text === 'Target')!
      const index = headingIndex(source, entry.offset, editor.schema)
      const headings: string[] = []
      editor.state.doc.descendants((node) => { if (node.type.name === 'heading') headings.push(node.textContent) })
      expect(headings[index]).toBe('Target')
    } finally { editor.destroy() }
  })

  it('navigates both controls across source, hybrid and split, including repeated headings', async () => {
    const source = '# Same\r\n\r\nText\r\n\r\n## **Same**\r\n\r\nLast\r\n'
    await mount({ '/notes/navigation.md': source })
    await until(() => document.querySelectorAll('[aria-label="Document outline"] a').length === 2)
    click(button('Source'))
    await until(() => document.querySelector('textarea'))
    click(document.querySelectorAll('[aria-label="Document outline"] a')[1])
    expect(document.querySelector('textarea')!.selectionStart).toBe(source.replace(/\r\n/g, '\n').indexOf('##'))
    for (const mode of ['Hybrid', 'Split', 'Hybrid']) {
      click(button(mode))
      await until(() => document.querySelector('.ProseMirror h2'))
      const target = document.querySelector('.ProseMirror h2')!
      const scroll = vi.spyOn(target, 'scrollIntoView')
      click(document.querySelectorAll('[aria-label="Document outline"] a')[1])
      expect(scroll).toHaveBeenCalled()
      expect(document.querySelector('[aria-label="Document position"]')?.textContent).toContain('Currently in section Same')
      scroll.mockClear()
      click(document.querySelectorAll('[aria-label="Document position"] button')[1])
      expect(scroll).toHaveBeenCalled()
      scroll.mockRestore()
      if (mode === 'Hybrid') expect(document.querySelector('.ProseMirror')!.getAttribute('contenteditable')).toBe('true')
    }
  })
})

describe('file menu actions', () => {
  it('opens and saves through the menu and permits cancelling Open', async () => {
    const platform = await mount({ '/notes/first.txt': 'First' })
    await platform.fs.write('/notes/second.txt', 'Second')
    const picker = vi.spyOn(platform.dialog, 'openFile').mockResolvedValue({ paths: ['/notes/second.txt'] })
    const toolbar = document.querySelector('[aria-label="File actions"]')!
    click(toolbar.querySelector('[aria-label="Menu"]'))
    await until(() => [...document.querySelectorAll('.valence-appmenu button')].find(b => b.querySelector('span')?.textContent === 'Open file…') ?? null)
    click([...document.querySelectorAll('.valence-appmenu button')].find(b => b.querySelector('span')?.textContent === 'Open file…') ?? null)
    await until(() => document.querySelector('textarea')?.value === 'Second')
    edit(document.querySelector('textarea')!, 'Updated')
    await until(() => document.body.textContent?.includes('Unsaved'))
    click(toolbar.querySelector('[aria-label="Menu"]'))
    await until(() => document.querySelector('.valence-appmenu'))
    click([...document.querySelectorAll('.valence-appmenu button')].find(b => b.querySelector('span')?.textContent === 'Save') ?? null)
    await until(() => document.body.textContent?.includes('All changes saved'))
    expect(await platform.fs.read('/notes/second.txt')).toBe('Updated')
    const tabs = document.querySelectorAll('[role="tab"]').length
    picker.mockResolvedValue({ paths: [] })
    click(toolbar.querySelector('[aria-label="Menu"]'))
    await until(() => [...document.querySelectorAll('.valence-appmenu button')].find(b => b.querySelector('span')?.textContent === 'Open file…') ?? null)
    click([...document.querySelectorAll('.valence-appmenu button')].find(b => b.querySelector('span')?.textContent === 'Open file…') ?? null)
    await until(() => picker.mock.calls.length === 2)
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(tabs)
  })
})

it('removes the side tab pane and divider when the final document closes', async () => {
  await mount({ '/notes/only.txt': 'Saved text' })
  click(document.querySelector('[aria-label="Settings"]'))
  await until(() => button('Left'))
  click(button('Left'))
  click(document.querySelector('[aria-label="Close settings"]'))
  await until(() => document.querySelector('[aria-label="Resize document tabs"]'))
  click(document.querySelector('[aria-label="Close only.txt"]'))
  await until(() => !document.querySelector('[role="tablist"]'))
  expect(document.querySelector('[aria-label="Resize document tabs"]')).toBeNull()
})
