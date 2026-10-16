/**
 * Wiki links.
 *
 * The resolution rules are the part worth pinning down: given a vault and a link, which file
 * does it mean, and what happens when more than one could. Everything here is pure, which is
 * the only reason it can be tested exhaustively — the alternative is building a vault on disk
 * for every case.
 */

import { describe, expect, it } from 'vitest'
import {
  buildBacklinks,
  displayPath,
  findWikiLinks,
  findWikiLinksOutsideCode,
  isDocumentPath,
  parseWikiLinkBody,
  resolveWikiLink,
  stripExtension,
  type VaultFile,
} from '../src/core/wiki'

const f = (path: string): VaultFile => ({ path })

describe('parseWikiLinkBody', () => {
  it('reads a bare target', () => {
    expect(parseWikiLinkBody('Ideas')).toEqual({
      target: 'Ideas',
      alias: undefined,
      heading: undefined,
      display: 'Ideas',
    })
  })

  it('reads an alias and shows it instead of the target', () => {
    expect(parseWikiLinkBody('Ideas|thoughts')).toEqual({
      target: 'Ideas',
      alias: 'thoughts',
      heading: undefined,
      display: 'thoughts',
    })
  })

  it('reads a heading anchor', () => {
    expect(parseWikiLinkBody('Ideas#Later')?.heading).toBe('Later')
    expect(parseWikiLinkBody('Ideas#Later')?.target).toBe('Ideas')
  })

  it('lets the alias win over the heading for display', () => {
    // `[[Note#Section|see here]]` navigates to the section but reads as "see here".
    const l = parseWikiLinkBody('Notes#Later|see here')!
    expect(l.heading).toBe('Later')
    expect(l.display).toBe('see here')
  })

  it('keeps a hash inside an alias out of the heading', () => {
    const l = parseWikiLinkBody('Notes|see #this')!
    expect(l.heading).toBeUndefined()
    expect(l.display).toBe('see #this')
  })

  it('rejects an empty target', () => {
    expect(parseWikiLinkBody('')).toBeNull()
    expect(parseWikiLinkBody('   ')).toBeNull()
    expect(parseWikiLinkBody('#HeadingOnly')).toBeNull()
    expect(parseWikiLinkBody('|alias only')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(parseWikiLinkBody('  Ideas  ')?.target).toBe('Ideas')
  })
})

describe('path helpers', () => {
  it('strips only a document extension', () => {
    expect(stripExtension('notes/Ideas.md')).toBe('notes/Ideas')
    expect(stripExtension('archive.tar.gz')).toBe('archive.tar')
    expect(stripExtension('.gitignore')).toBe('.gitignore')
  })

  it('recognises document extensions case-insensitively', () => {
    expect(isDocumentPath('a.md')).toBe(true)
    expect(isDocumentPath('a.MDX')).toBe(true)
    expect(isDocumentPath('a.png')).toBe(false)
    expect(isDocumentPath('noext')).toBe(false)
  })

  it('shows a path without its extension', () => {
    expect(displayPath('notes/2026/Ideas.md')).toBe('notes/2026/Ideas')
  })
})

describe('findWikiLinks', () => {
  it('finds every link in order', () => {
    const links = findWikiLinks('See [[One]] and [[Two|second]].')
    expect(links.map((l) => l.target)).toEqual(['One', 'Two'])
    expect(links[1]!.display).toBe('second')
  })

  it('ignores links inside fenced code', () => {
    // A document documenting its own syntax is the likely false positive.
    const src = 'Real [[Link]]\n\n```md\nNot a [[Link]]\n```\n'
    expect(findWikiLinksOutsideCode(src).map((l) => l.target)).toEqual(['Link'])
    expect(findWikiLinks(src).map((l) => l.target)).toEqual(['Link', 'Link'])
  })

  it('ignores links inside inline code', () => {
    expect(findWikiLinksOutsideCode('Type `[[NotALink]]` here.').length).toBe(0)
  })

  it('preserves line numbers when stripping code', () => {
    const src = '[[Real]]\n\n```\n[[Fake]]\n```\n'
    expect(findWikiLinksOutsideCode(src).map((l) => l.target)).toEqual(['Real'])
  })

  it('handles tilde fences', () => {
    expect(findWikiLinksOutsideCode('~~~\n[[Fake]]\n~~~\n').length).toBe(0)
  })
})

describe('resolveWikiLink', () => {
  const vault = [f('Ideas.md'), f('notes/Journal.md'), f('notes/Ideas.md'), f('archive/Ideas.md')]

  it('matches by name when the name is unique', () => {
    expect(resolveWikiLink('Journal', vault, null)).toEqual({
      kind: 'resolved',
      path: 'notes/Journal.md',
    })
  })

  it('ignores extension and case', () => {
    expect(resolveWikiLink('journal.md', vault, null)).toEqual({
      kind: 'resolved',
      path: 'notes/Journal.md',
    })
    expect(resolveWikiLink('JOURNAL', vault, null)).toEqual({
      kind: 'resolved',
      path: 'notes/Journal.md',
    })
  })

  it('prefers a sibling of the linking document', () => {
    // From inside notes/, `Ideas` should be notes/Ideas.md, not archive/Ideas.md.
    const r = resolveWikiLink('Ideas', vault, 'notes/anything.md')
    expect(r).toEqual({ kind: 'resolved', path: 'notes/Ideas.md' })
  })

  it('prefers an explicit path over everything', () => {
    expect(resolveWikiLink('archive/Ideas', vault, 'notes/anything.md')).toEqual({
      kind: 'resolved',
      path: 'archive/Ideas.md',
    })
  })

  it('reports ambiguity rather than guessing', () => {
    // No linking document, and three files called Ideas.
    const r = resolveWikiLink('Ideas', vault, null)
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') expect(r.candidates.length).toBe(3)
  })

  it('orders ambiguous candidates shallowest first', () => {
    const r = resolveWikiLink('Ideas', vault, null)
    if (r.kind === 'ambiguous') {
      expect(r.candidates[0]).toBe('Ideas.md')
      expect(r.candidates[1]).toBe('archive/Ideas.md')
    }
  })

  it('reports a target that is not there', () => {
    expect(resolveWikiLink('Missing', vault, null)).toEqual({ kind: 'missing', target: 'Missing' })
  })

  it('does not match non-documents', () => {
    expect(resolveWikiLink('logo', [f('logo.png')], null).kind).toBe('missing')
  })

  it('reports missing in an empty vault', () => {
    expect(resolveWikiLink('Anything', [], null).kind).toBe('missing')
  })

  it('does not treat a shared string prefix as a path match', () => {
    // '/notes-old' and '/notes' are unrelated directories.
    expect(resolveWikiLink('notes-old', [f('notes-old/A.md')], null).kind).toBe('missing')
  })
})

describe('buildBacklinks', () => {
  const files = [f('Ideas.md'), f('One.md'), f('Two.md'), f('Three.md')]
  const docs: Record<string, string> = {
    'Ideas.md': '# Ideas',
    'One.md': 'See [[Ideas]] for more.',
    'Two.md': 'Also [[Ideas|the ideas]] here.',
    'Three.md': 'Nothing here. But [[Missing]] is.',
  }

  it('finds documents linking to the target', () => {
    const links = buildBacklinks(files, (p) => docs[p] ?? null, 'Ideas.md')
    expect(links.map((l) => l.from)).toEqual(['One.md', 'Two.md'])
  })

  it('reports the line each link is on', () => {
    const links = buildBacklinks(files, (p) => docs[p] ?? null, 'Ideas.md')
    expect(links.every((l) => l.line === 1)).toBe(true)
  })

  it('keeps the display text, not the target', () => {
    const links = buildBacklinks(files, (p) => docs[p] ?? null, 'Ideas.md')
    expect(links.map((l) => l.target)).toEqual(['Ideas', 'the ideas'])
  })

  it('does not backlink a note to itself', () => {
    const links = buildBacklinks(
      [f('Ideas.md')],
      () => 'I link to [[Ideas]] from myself.',
      'Ideas.md',
    )
    expect(links).toEqual([])
  })

  it('ignores links that resolve elsewhere', () => {
    expect(buildBacklinks(files, (p) => docs[p] ?? null, 'One.md').map((l) => l.from)).toEqual([])
  })

  it('ignores links to notes that do not exist', () => {
    expect(buildBacklinks(files, (p) => docs[p] ?? null, 'Missing.md')).toEqual([])
  })

  it('ignores links inside code', () => {
    const links = buildBacklinks(
      files,
      (p) => (p === 'One.md' ? '```\n[[Ideas]]\n```' : null),
      'Ideas.md',
    )
    expect(links).toEqual([])
  })

  it('tolerates a document that cannot be read', () => {
    const links = buildBacklinks(files, (p) => (p === 'One.md' ? docs[p]! : null), 'Ideas.md')
    expect(links.map((l) => l.from)).toEqual(['One.md'])
  })

  it('resolves a link written with a path', () => {
    const links = buildBacklinks(files, (p) => (p === 'One.md' ? 'See [[Ideas.md]] here.' : null), 'Ideas.md')
    expect(links).toHaveLength(1)
  })

  it('treats a written extension as an explicit reference, not a name', () => {
    // `Ideas` is a name and collides; `Ideas.md` is a deliberate reference to one file.
    const vault = [f('Ideas.md'), f('archive/Ideas.md')]
    expect(resolveWikiLink('Ideas', vault, null).kind).toBe('ambiguous')
    expect(resolveWikiLink('Ideas.md', vault, null)).toEqual({
      kind: 'resolved',
      path: 'Ideas.md',
    })
  })

  it('reports an explicit reference to a file that is not there as missing', () => {
    const vault = [f('Ideas.md')]
    expect(resolveWikiLink('archive/Ideas.md', vault, null)).toEqual({
      kind: 'missing',
      target: 'archive/Ideas.md',
    })
  })
})