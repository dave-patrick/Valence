/** @vitest-environment jsdom */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
let editor: Editor | null = null
vi.mock('@tiptap/react', async original => {
  const actual = await original<typeof import('@tiptap/react')>()
  return { ...actual, useEditor: (...args: Parameters<typeof actual.useEditor>) => { editor = actual.useEditor(...args); return editor } }
})
let root: Root
let container: HTMLDivElement
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
beforeAll(async () => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.scrollIntoView ??= function () {}
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  container = document.createElement('div'); document.body.append(container)
  const { App } = await import('../src/renderer/src/App')
  root = createRoot(container); root.render(createElement(App))
  for (let i = 0; i < 500 && !container.querySelector('[aria-label="Document outline"] a'); i++) await pause()
}, 20000)
afterAll(() => root?.unmount())
it('updates rich counts before serialization pauses, and resets when changing documents', async () => {
  await act(async () => { editor!.commands.setContent('<p>one two</p>'); await pause() })
  expect(container.querySelector('[aria-label="Word count"]')?.textContent).toBe('2 words')
  for (let i = 0; i < 3; i++) {
    await act(async () => { editor!.commands.insertContentAt(editor!.state.doc.content.size - 1, ' more'); await pause(25) })
    expect(container.querySelector('[aria-label="Word count"]')?.textContent).toBe(`${3 + i} words`)
  }
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', ctrlKey: true, shiftKey: true, bubbles: true })); await pause() })
  expect(container.querySelector('[aria-label="Word count"]')?.textContent).toBe('0 words')
  await act(async () => { (container.querySelector('[role="tab"]') as HTMLElement).click(); await pause() })
  expect(container.querySelector('[aria-label="Word count"]')?.textContent).toBe('5 words')
})
