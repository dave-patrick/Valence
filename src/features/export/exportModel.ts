/**
 * Export model.
 *
 * The decisions here are the ones worth getting right, and they are worth testing without a
 * dialog on screen:
 *
 *  - which formats need Pandoc, and what Pandoc calls them (our ids are for our UI; Pandoc
 *    has its own vocabulary, and the mismatch is where silent empty exports come from);
 *  - what filename to suggest, derived from the document rather than invented;
 *  - that a missing Pandoc is a *disabled button with a reason*, never a thrown error at
 *    click time. Typora's behaviour, and the reason M3 says "never hard-fail".
 */

import type { ExportFormat } from '@platform'

/**
 * Pandoc output name per format id.
 *
 * Note `rtf` and `mediawiki` are here but absent from the default menu: they are real
 * Pandoc targets that most people never want, and the menu is deliberately short.
 */
export const PANDOC_TARGETS: Record<string, string> = {
  docx: 'docx',
  odt: 'odt',
  rtf: 'rtf',
  epub: 'epub',
  latex: 'latex',
  mediawiki: 'mediawiki',
}

/** Formats offered in the default menu, in the order they appear. */
export const DEFAULT_EXPORT_IDS = [
  'pdf',
  'html',
  'docx',
  'odt',
  'epub',
  'latex',
  'mediawiki',
] as const

/** How an export is produced. PDF is native; everything else goes through Pandoc. */
export type ExportRoute = 'native-pdf' | 'pandoc' | 'native-text'

export interface ExportPlan {
  format: ExportFormat
  route: ExportRoute
  /** Suggested filename, extension included. */
  suggestedName: string
  /** Null when the export can proceed. */
  blockedBy: string | null
}

/** Strips directories and any existing extension from a path or title. */
export function baseName(pathOrTitle: string | null, fallback = 'Untitled'): string {
  if (!pathOrTitle) return fallback
  const last = pathOrTitle.split(/[\\/]/).filter(Boolean).pop() ?? pathOrTitle
  const dot = last.lastIndexOf('.')
  // A leading dot means a dotfile, not an extension: `.gitignore` stays intact.
  const stem = dot > 0 ? last.slice(0, dot) : last
  return stem.trim() || fallback
}

/**
 * What to call the exported file.
 *
 * `Untitled` is deliberately not the default filename — an untitled document exports as
 * `Untitled.html`, which is worse than `Untitled-1.html` only cosmetically, but it also
 * means a user exporting two drafts silently overwrites the first.
 */
export function suggestedName(sourcePath: string | null, title: string | null, ext: string): string {
  const fromTitle = title && title.trim() && !/^untitled$/i.test(title.trim()) ? title.trim() : null
  return `${baseName(fromTitle ?? sourcePath, 'Untitled')}.${ext}`
}

export function routeFor(format: ExportFormat): ExportRoute {
  if (format.id === 'pdf') return 'native-pdf'
  if (format.pandoc) return 'pandoc'
  return 'native-text'
}

/**
 * Decides how one format will be exported.
 *
 * `pandocTarget` is separate from the format id because the two vocabularies genuinely
 * differ, and passing our id to Pandoc would silently produce a file with the wrong
 * internal structure rather than an error.
 */
export function planExport(
  format: ExportFormat,
  opts: { sourcePath: string | null; title: string | null; hasPandoc: boolean },
): ExportPlan {
  const route = routeFor(format)
  return {
    format,
    route,
    suggestedName: suggestedName(opts.sourcePath, opts.title, format.extension),
    blockedBy:
      route === 'pandoc' && !opts.hasPandoc
        ? 'Needs Pandoc, which is not installed. Install it from pandoc.org, then try again.'
        : null,
  }
}

/**
 * Applies the default menu order and drops anything the platform does not offer.
 *
 * A platform advertising fewer formats than the default list is a supported case — the
 * browser fallback offers only HTML and PDF, and it must not show a Pandoc entry that
 * cannot work.
 */
export function visibleFormats(
  available: readonly ExportFormat[],
  ids: readonly string[] = DEFAULT_EXPORT_IDS,
): ExportFormat[] {
  const byId = new Map(available.map((f) => [f.id, f]))
  const ordered = ids.map((id) => byId.get(id)).filter((f): f is ExportFormat => !!f)

  // Anything the platform offers that the default list does not mention is appended rather
  // than dropped, so a new format added to the main process appears without a UI change.
  const known = new Set(ordered.map((f) => f.id))
  const extra = available.filter((f) => !known.has(f.id)).sort((a, b) => a.label.localeCompare(b.label))

  return [...ordered, ...extra]
}

/** Groups the menu so Pandoc-only formats are visually separable from the native ones. */
export function groupFormats(formats: readonly ExportFormat[]): {
  native: ExportFormat[]
  pandoc: ExportFormat[]
} {
  return {
    native: formats.filter((f) => routeFor(f) !== 'pandoc'),
    pandoc: formats.filter((f) => routeFor(f) === 'pandoc'),
  }
}

/**
 * Extension Pandoc needs for a target.
 *
 * LaTeX is `.tex` in our UI but `latex` in Pandoc's `-t`, and the mismatch is invisible
 * until the file opens wrong, so it is asserted here rather than at the call site.
 */
export function extensionForPandocTarget(target: string): string {
  switch (target) {
    case 'latex':
      return 'tex'
    case 'mediawiki':
      return 'wiki'
    case 'markdown':
      return 'md'
    default:
      return target
  }
}