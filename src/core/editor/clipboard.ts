/**
 * Clipboard handling as a ProseMirror plugin.
 *
 * Kept out of `App` because the interesting decisions — which clipboard flavour wins, where
 * a pasted image lands, whether a link is rewritten — are editor behaviour, not application
 * behaviour, and they want tests that do not need a React tree.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { blocksToHtml, htmlToBlocks } from '@core/htmlBridge'
import { serialiseMarkdown } from '@core/markdown/serialise'
import {
  extensionFor,
  imageMarkdown,
  imageName,
  resolvePaste,
  type PasteContext,
} from './paste'

export interface ClipboardHooks {
  /** Resolves context at paste time, so the active document is always current. */
  context: () => PasteContext
  /** Persists clipboard image bytes. Returns the path actually written. */
  writeImage: (data: ArrayBuffer, extension: string) => Promise<string>
  /** Files already beside the document, used to avoid clobbering on a pasted image. */
  neighbours: (dir: string) => Promise<string[]>
}

export const clipboardKey = new PluginKey('valence-clipboard')

export function ClipboardPaste(hooks: ClipboardHooks) {
  return Extension.create({
    name: 'clipboardPaste',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: clipboardKey,
          props: {
            handlePaste: (view: EditorView, event: ClipboardEvent) => {
              const data = event.clipboardData
              if (!data) return false

              // Images first: an image clipboard carries no text, and the two paths cannot
              // both reasonably win.
              const imageItem = [...data.items].find((i) => i.type.startsWith('image/'))
              if (imageItem) {
                const extension = extensionFor(imageItem.type)
                if (extension) {
                  event.preventDefault()
                  void pasteImage(view, imageItem.getAsFile(), extension, hooks)
                  return true
                }
              }

              const text = data.getData('text/plain')
              const html = data.getData('text/html')
              if (!text && !html) return false

              const resolved = resolvePaste({ text, html }, hooks.context())
              // Nothing usable: let ProseMirror try, rather than inserting nothing and making
              // the paste look ignored.
              if (!resolved || !resolved.markdown.trim()) return false

              event.preventDefault()
              insertMarkdown(view, resolved.markdown)
              return true
            },
          },
        }),
      ]
    },
  })
}

/**
 * Inserts markdown at the selection.
 *
 * The text is round-tripped through our own parse and serialise and then handed to
 * ProseMirror's DOM parser, rather than inserted as a string. Anything less loses the
 * structure the paste exists to preserve.
 */
function insertMarkdown(view: EditorView, markdown: string): boolean {
  const html = markdownToEditorHtml(markdown)
  const dom = document.createElement('div')
  dom.innerHTML = html

  const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(dom)
  view.dispatch(view.state.tr.replaceSelection(slice))
  return true
}

async function pasteImage(
  view: EditorView,
  file: File | null,
  extension: string,
  hooks: ClipboardHooks,
): Promise<void> {
  if (!file) return

  const ctx = hooks.context()
  const dir = ctx.documentPath ? dirnameOf(ctx.documentPath) : ''

  try {
    const taken = dir ? await hooks.neighbours(dir) : []
    const name = imageName(taken, extension)
    const written = await hooks.writeImage(await file.arrayBuffer(), extension)

    const relative = relativeTo(dir, written) ?? basenameOf(written)
    insertMarkdown(view, imageMarkdown(relative))
  } catch {
    // If the image cannot be written, say so in the document rather than silently dropping
    // the paste: the user has committed a gesture and deserves to know where it went.
    insertMarkdown(view, `_Could not save pasted image (${file.name})._`)
  }
}

/** Markdown to the HTML the editor's schema understands. */
function markdownToEditorHtml(markdown: string): string {
  const { text } = serialiseMarkdown(null, htmlToBlocks(markdown))
  return blocksToHtml(htmlToBlocks(text))
}

export function dirnameOf(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function basenameOf(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

function relativeTo(fromDir: string, to: string): string | null {
  if (!fromDir) return null
  const a = fromDir.split('/').filter(Boolean)
  const b = to.split(/[\\/]/).filter(Boolean)
  let common = 0
  while (common < a.length && common < b.length - 1 && a[common] === b[common]) common++
  if (common === 0) return null
  return [...Array(a.length - common).fill('..'), ...b.slice(common)].join('/')
}

/** Re-exported so `App` does not need to import the serialiser just to build the context. */
export { serialiseMarkdown }