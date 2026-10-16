/**
 * Export model.
 *
 * The cases that matter are the ones where a wrong answer produces a *file* rather than an
 * error: a mis-derived extension, a Pandoc format id that does not exist, a menu offering a
 * format the platform cannot run.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPORT_IDS,
  PANDOC_TARGETS,
  baseName,
  extensionForPandocTarget,
  groupFormats,
  planExport,
  routeFor,
  suggestedName,
  visibleFormats,
} from '../src/features/export/exportModel'
import type { ExportFormat } from '../src/platform/types'

const native = (id: string, extension = id): ExportFormat => ({ id, label: id, extension })
const pandocFmt = (id: string, extension = id): ExportFormat => ({
  id,
  label: id,
  extension,
  pandoc: true,
})

const ALL: ExportFormat[] = [
  native('html', 'html'),
  native('pdf', 'pdf'),
  pandocFmt('docx', 'docx'),
  pandocFmt('odt', 'odt'),
  pandocFmt('epub', 'epub'),
  pandocFmt('latex', 'tex'),
  pandocFmt('mediawiki', 'wiki'),
]

describe('baseName', () => {
  it('takes the last path segment', () => {
    expect(baseName('/notes/2026/journal.md')).toBe('journal')
    expect(baseName('C:\\notes\\journal.md')).toBe('journal')
  })

  it('keeps a dotfile intact', () => {
    // A leading dot is a dotfile, not an extension.
    expect(baseName('.gitignore')).toBe('.gitignore')
  })

  it('falls back for empty input', () => {
    expect(baseName(null)).toBe('Untitled')
    expect(baseName('')).toBe('Untitled')
    expect(baseName('   ')).toBe('Untitled')
  })

  it('strips only the last extension', () => {
    expect(baseName('archive.tar.gz')).toBe('archive.tar')
  })
})

describe('suggestedName', () => {
  it('prefers the document title over the path', () => {
    expect(suggestedName('/notes/journal.md', 'Field Notes', 'pdf')).toBe('Field Notes.pdf')
  })

  it('falls back to the filename when the title is absent', () => {
    expect(suggestedName('/notes/journal.md', null, 'docx')).toBe('journal.docx')
  })

  it('ignores a placeholder title', () => {
    // "Untitled" carries no information the path does not already have.
    expect(suggestedName('/notes/journal.md', 'Untitled', 'pdf')).toBe('journal.pdf')
  })

  it('handles a document with no path and no title', () => {
    expect(suggestedName(null, null, 'html')).toBe('Untitled.html')
  })

  it('trims a padded title', () => {
    expect(suggestedName(null, '  Notes  ', 'html')).toBe('Notes.html')
  })
})

describe('routeFor', () => {
  it('sends PDF through the print pipeline', () => {
    expect(routeFor(native('pdf'))).toBe('native-pdf')
  })

  it('sends Pandoc formats through Pandoc', () => {
    expect(routeFor(pandocFmt('docx'))).toBe('pandoc')
  })

  it('sends everything else to a plain write', () => {
    expect(routeFor(native('html'))).toBe('native-text')
  })
})

describe('planExport', () => {
  it('plans a PDF without Pandoc installed', () => {
    const plan = planExport(native('pdf'), {
      sourcePath: '/a/b.md',
      title: null,
      hasPandoc: false,
    })
    expect(plan.blockedBy).toBeNull()
    expect(plan.suggestedName).toBe('b.pdf')
  })

  it('blocks a Pandoc format when Pandoc is missing, and says why', () => {
    const plan = planExport(pandocFmt('docx'), {
      sourcePath: '/a/b.md',
      title: null,
      hasPandoc: false,
    })
    expect(plan.blockedBy).toMatch(/Pandoc/)
    expect(plan.route).toBe('pandoc')
  })

  it('unblocks once Pandoc is present', () => {
    const plan = planExport(pandocFmt('docx'), {
      sourcePath: '/a/b.md',
      title: null,
      hasPandoc: true,
    })
    expect(plan.blockedBy).toBeNull()
  })

  it('uses the title for the filename', () => {
    const plan = planExport(native('html'), {
      sourcePath: '/a/b.md',
      title: 'My Essay',
      hasPandoc: false,
    })
    expect(plan.suggestedName).toBe('My Essay.html')
  })
})

describe('visibleFormats', () => {
  it('applies the default order', () => {
    expect(visibleFormats(ALL).map((f) => f.id)).toEqual([
      'pdf',
      'html',
      'docx',
      'odt',
      'epub',
      'latex',
      'mediawiki',
    ])
  })

  it('drops formats the platform does not offer', () => {
    // The browser fallback only has HTML and PDF; it must not advertise docx.
    const web: ExportFormat[] = [native('html'), native('pdf')]
    expect(visibleFormats(web).map((f) => f.id)).toEqual(['pdf', 'html'])
  })

  it('appends an unknown format rather than dropping it', () => {
    const withNew = [...ALL, native('txt')]
    const ids = visibleFormats(withNew).map((f) => f.id)
    expect(ids).toContain('txt')
    // Still after the known ones.
    expect(ids.indexOf('txt')).toBe(ids.length - 1)
  })

  it('honours a custom order, still appending anything it omits', () => {
    // The list is a preference order, not an allowlist: a format added to the main process
    // must appear without needing a UI change too. Appended formats are alphabetical by
    // label, since they arrive in no meaningful order of their own.
    expect(visibleFormats(ALL, ['html', 'pdf']).map((f) => f.id)).toEqual([
      'html',
      'pdf',
      'docx',
      'epub',
      'latex',
      'mediawiki',
      'odt',
    ])
  })

  it('tolerates an empty platform list', () => {
    expect(visibleFormats([])).toEqual([])
  })

  it('covers every default id in the full list, so nothing silently vanishes', () => {
    const ids = new Set(visibleFormats(ALL).map((f) => f.id))
    for (const id of DEFAULT_EXPORT_IDS) expect(ids.has(id)).toBe(true)
  })
})

describe('groupFormats', () => {
  it('separates native from Pandoc', () => {
    const { native: n, pandoc: p } = groupFormats(ALL)
    expect(n.map((f) => f.id)).toEqual(['html', 'pdf'])
    expect(p.map((f) => f.id)).toEqual(['docx', 'odt', 'epub', 'latex', 'mediawiki'])
  })
})

describe('pandoc target mapping', () => {
  it('has an entry for every Pandoc format in the menu', () => {
    const pandocIds = visibleFormats(ALL)
      .filter((f) => f.pandoc)
      .map((f) => f.id)
    for (const id of pandocIds) expect(PANDOC_TARGETS[id]).toBeDefined()
  })

  it('maps LaTeX to a .tex file even though Pandoc calls it latex', () => {
    // The mismatch is invisible until the file opens wrong, so it is asserted directly.
    expect(extensionForPandocTarget(PANDOC_TARGETS['latex']!)).toBe('tex')
    expect(visibleFormats(ALL).find((f) => f.id === 'latex')?.extension).toBe('tex')
  })

  it('maps mediawiki to .wiki', () => {
    expect(extensionForPandocTarget('mediawiki')).toBe('wiki')
  })

  it('passes unremarkable targets through', () => {
    expect(extensionForPandocTarget('docx')).toBe('docx')
    expect(extensionForPandocTarget('epub')).toBe('epub')
  })

  it('keeps the ui extension in step with the pandoc target', () => {
    for (const f of ALL.filter((x) => x.pandoc)) {
      const target = PANDOC_TARGETS[f.id]!
      expect(extensionForPandocTarget(target)).toBe(f.extension)
    }
  })
})