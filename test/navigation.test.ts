/**
 * The app window only ever shows the app. A link in the Read view used to replace Valence
 * with the linked page, and that page got the preload bridge (read and write any file).
 */
import { describe, expect, it } from 'vitest'
import { decideNavigation, filePathFromUrl } from '../src/shared/navigation'

const APP = 'file:///C:/Users/me/Apps/Valence/resources/app.asar/out/renderer/index.html'

describe('decideNavigation', () => {
  it('lets the app move within its own page', () => {
    expect(decideNavigation(`${APP}#section`, APP)).toEqual({ kind: 'stay' })
  })

  it('sends web and mail links to the default browser', () => {
    expect(decideNavigation('https://example.com/a?b=1', APP)).toEqual({ kind: 'external', url: 'https://example.com/a?b=1' })
    expect(decideNavigation('http://example.com/', APP).kind).toBe('external')
    expect(decideNavigation('mailto:someone@example.com', APP).kind).toBe('external')
  })

  it('opens linked documents as tabs instead of loading them in the window', () => {
    expect(decideNavigation('file:///C:/notes/Other%20note.md', APP)).toEqual({ kind: 'open', path: 'C:/notes/Other note.md' })
    expect(decideNavigation('file:///home/me/notes/todo.txt', APP)).toEqual({ kind: 'open', path: '/home/me/notes/todo.txt' })
  })

  it('refuses everything else', () => {
    for (const url of ['file:///C:/Windows/System32/calc.exe', 'ms-settings:defaultapps', 'javascript:alert(1)', 'smb://server/share', 'data:text/html,<b>x</b>', 'not a url', 'file:///C:/notes/']) {
      expect(decideNavigation(url, APP), url).toEqual({ kind: 'block' })
    }
  })

  it('treats a new-window request (no current page) the same way', () => {
    expect(decideNavigation('https://example.com', '').kind).toBe('external')
    expect(decideNavigation('ms-settings:', '').kind).toBe('block')
  })
})

describe('filePathFromUrl', () => {
  it('handles drive letters, plain paths and network shares', () => {
    expect(filePathFromUrl(new URL('file:///D:/a/b.md'))).toBe('D:/a/b.md')
    expect(filePathFromUrl(new URL('file:///tmp/b.md'))).toBe('/tmp/b.md')
    expect(filePathFromUrl(new URL('file://server/share/b.md'))).toBe('//server/share/b.md')
    expect(filePathFromUrl(new URL('https://x/b.md'))).toBeNull()
  })
})

import { resolveDocumentLink } from '../src/shared/navigation'

describe('resolveDocumentLink', () => {
  const doc = 'C:/notes/projects/plan.md'
  it('keeps in-page anchors in the page', () => {
    expect(resolveDocumentLink('#goals', doc)).toEqual({ kind: 'anchor' })
  })
  it('opens web links in the browser', () => {
    expect(resolveDocumentLink('https://example.com', doc)).toEqual({ kind: 'external', url: 'https://example.com/' })
  })
  it('resolves relative document links against the document, not the app', () => {
    expect(resolveDocumentLink('other.md', doc)).toEqual({ kind: 'open', path: 'C:/notes/projects/other.md' })
    expect(resolveDocumentLink('../Read%20me.md#intro', doc)).toEqual({ kind: 'open', path: 'C:/notes/Read me.md' })
    expect(resolveDocumentLink('./a/./b.txt', '/home/me/n.md')).toEqual({ kind: 'open', path: '/home/me/a/b.txt' })
  })
  it('ignores links to things Valence does not open, and relative links in an unsaved document', () => {
    expect(resolveDocumentLink('setup.exe', doc)).toEqual({ kind: 'ignore' })
    expect(resolveDocumentLink('other.md', null)).toEqual({ kind: 'ignore' })
    expect(resolveDocumentLink('javascript:alert(1)', doc)).toEqual({ kind: 'ignore' })
  })
})
