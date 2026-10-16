/**
 * Smart paste (M1.4).
 *
 * Typora's behaviour, which is the best part of its clipboard handling: paste HTML and it
 * keeps the semantics -- an `<h1>` arrives as a heading, a `<ul>` as a list -- rather than
 * collapsing to text. Plain markdown pasted into the editor would otherwise lose its
 * structure the moment it passes through as plain text.
 *
 * `htmlToBlocks` already does the hard part; this is the policy around it:
 *
 * - HTML present in the paste wins over the plain-text flavour, because the HTML carries the
 *   structure. Falling back to text is deliberate, not incidental.
 * - Internal links resolve against open documents, so pasting a link to another note in the
 *   session produces a relative path rather than a broken absolute one.
 * - Images from the clipboard become files next to the active document, referenced relatively,
 *   which is what keeps a folder of notes portable.
 */

import { htmlToBlocks } from '@core/htmlBridge'
import { serialiseMarkdown } from '@core/markdown/serialise'
import type { AnyBlock } from '@core/types'

export interface ClipboardPayload {
  text: string
  html: string
}

export interface PasteContext {
  /** Path of the document being edited, for resolving relative links and image paths. */
  documentPath: string | null
  /** Paths currently open, for turning internal links into relative ones. */
  openPaths: string[]
}

export interface ResolvedPaste {
  markdown: string
  /** True when the HTML flavour was used. */
  usedHtml: boolean
  /** Blocks that lost information, surfaced so the user is not surprised. */
  lossy: string[]
}

/**
 * Turns a clipboard payload into markdown.
 *
 * Returns `null` when there is nothing sensible to insert, so the caller can fall back to the
 * editor's default handling rather than inserting nothing.
 */
export function resolvePaste(payload: ClipboardPayload, ctx: PasteContext): ResolvedPaste | null {
  const html = payload.html.trim()
  const text = payload.text.trim()

  if (!html && !text) return null

  if (!html) {
    // No structure available. Treat it as markdown, which is what it almost always is when
    // copied from another editor's source view.
    return { markdown: text, usedHtml: false, lossy: [] }
  }

  let blocks: AnyBlock[]
  try {
    blocks = htmlToBlocks(html)
  } catch {
    return text ? { markdown: text, usedHtml: false, lossy: [] } : null
  }

  const rewritten = rewriteLinks(blocks, ctx)
  const { text: markdown, lossy } = serialiseMarkdown(null, rewritten)

  // If the HTML produced nothing usable, the clipboard's HTML flavour was decorative
  // (a cell copied out of a spreadsheet, say) and the text is the real content.
  if (!markdown.trim() && text) return { markdown: text, usedHtml: false, lossy: [] }

  return { markdown, usedHtml: true, lossy }
}

/**
 * Rewrites links and image sources to be relative to the current document.
 *
 * Only absolute paths and URLs are touched; already-relative links are left alone, because
 * the author wrote them that way.
 */
function rewriteLinks(blocks: AnyBlock[], ctx: PasteContext): AnyBlock[] {
  return blocks.map((block) => {
    const spans = block.spans?.map((span) => ({
      ...span,
      marks: span.marks.map((mark) => {
        if (mark.type !== 'link' && mark.type !== 'image') return mark

        const raw = mark.type === 'link' ? mark.href : mark.src
        const next = relativise(raw, ctx)
        return mark.type === 'link' ? { ...mark, href: next } : { ...mark, src: next }
      }),
    }))

    return {
      ...block,
      spans,
      children: block.children ? rewriteLinks(block.children, ctx) : block.children,
    }
  })
}

function relativise(target: string, ctx: PasteContext): string {
  if (!target) return target
  // Leave web URLs, anchors, and already-relative links untouched.
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target
  if (target.startsWith('#') || target.startsWith('./') || target.startsWith('../')) return target
  if (!isAbsolute(target)) return target

  const base = ctx.documentPath ? dirname(ctx.documentPath) : null
  if (!base) return target

  const relative = relativePath(base, target)
  // Only rewrite when it genuinely points at something we know about, or when both are
  // on the same drive — otherwise a short relative path is harder to debug than an
  // absolute one.
  if (!relative) return target
  return relative
}

function isAbsolute(p: string): boolean {
  return /^([a-z]:[\\/]|\\\\|\/)/i.test(p)
}

function dirname(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function relativePath(fromDir: string, to: string): string | null {
  const a = fromDir.split('/').filter(Boolean)
  const b = to.split(/[\\/]/).filter(Boolean)

  let common = 0
  while (common < a.length && common < b.length - 1 && a[common] === b[common]) common++
  if (common === 0) return null

  const up = a.length - common
  const down = b.slice(common)
  if (up === 0) return down.join('/')

  return [...Array(up).fill('..'), ...down].join('/')
}

/* ──────────────────────────────────────────────────────────────
 * Clipboard images
 * ──────────────────────────────────────────────────────────────*/

export interface ImagePayload {
  /** Raw bytes; the caller writes them through the platform. */
  data: ArrayBuffer
  /** Source extension, from the clipboard MIME type. */
  extension: string
}

/** Filename for a pasted image, avoiding collisions with anything already in `taken`. */
export function imageName(taken: readonly string[], extension: string, when = new Date()): string {
  const ext = extension.replace(/^\./, '').toLowerCase() || 'png'
  const stamp = when.toISOString().slice(0, 19).replace(/[:T-]/g, '')

  let name = `image-${stamp}.${ext}`
  let n = 1
  while (taken.some((t) => t.toLowerCase() === name.toLowerCase())) {
    name = `image-${stamp}-${n++}.${ext}`
  }
  return name
}

/** Maps a clipboard MIME type to a file extension. */
export function extensionFor(mime: string): string | null {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    default:
      return null
  }
}

/** Markdown for an image written alongside the current document. */
export function imageMarkdown(relativeSrc: string, alt = ''): string {
  const safeAlt = alt.replace(/[[\]]/g, '')
  return `![${safeAlt}](${relativeSrc.replace(/ /g, '%20')})`
}