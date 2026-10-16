/**
 * @vitest-environment jsdom
 *
 * Smart paste (M1.4).
 *
 * The point of this feature is that pasting HTML preserves structure. A test that only
 * checked "some text arrived" would pass while the feature was completely broken, so these
 * assert the *shape* of what comes out.
 */

import { describe, expect, it } from 'vitest'
import {
  extensionFor,
  imageMarkdown,
  imageName,
  relativePath,
  resolvePaste,
  type PasteContext,
} from '../src/core/editor/paste'

const CTX: PasteContext = { documentPath: '/notes/deep/doc.md', openPaths: [] }

describe('resolvePaste', () => {
  it('prefers the HTML flavour so structure survives', () => {
    const r = resolvePaste(
      { text: 'Heading', html: '<h2>Heading</h2>' },
      CTX,
    )!
    expect(r.usedHtml).toBe(true)
    expect(r.markdown.trim()).toBe('## Heading')
  })

  it('preserves lists pasted as HTML', () => {
    const r = resolvePaste(
      { text: 'one\ntwo', html: '<ul><li>one</li><li>two</li></ul>' },
      CTX,
    )!
    expect(r.markdown).toContain('- one')
    expect(r.markdown).toContain('- two')
  })

  it('preserves a pasted table', () => {
    const r = resolvePaste(
      {
        text: 'a b',
        html: '<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>',
      },
      CTX,
    )!
    expect(r.markdown).toContain('| a | b |')
    expect(r.markdown).toContain('| --- | --- |')
  })

  it('treats plain text as markdown when no HTML is present', () => {
    const r = resolvePaste({ text: '# Already markdown', html: '' }, CTX)!
    expect(r.usedHtml).toBe(false)
    expect(r.markdown).toBe('# Already markdown')
  })

  it('returns null for an empty clipboard', () => {
    expect(resolvePaste({ text: '', html: '' }, CTX)).toBeNull()
    expect(resolvePaste({ text: '   ', html: '  ' }, CTX)).toBeNull()
  })

  it('falls back to text when the HTML yields nothing', () => {
    const r = resolvePaste({ text: 'fallback', html: '<span></span>' }, CTX)!
    expect(r.markdown).toContain('fallback')
  })

  it('rewrites an absolute link into one relative to the document', () => {
    const r = resolvePaste(
      { text: '', html: '<a href="/notes/deep/target.md">target</a>' },
      CTX,
    )!
    expect(r.markdown).toContain('target.md')
    expect(r.markdown).not.toContain('/notes/deep/target.md')
  })

  it('leaves web URLs alone', () => {
    const r = resolvePaste(
      { text: '', html: '<a href="https://example.com/x">x</a>' },
      CTX,
    )!
    expect(r.markdown).toContain('https://example.com/x')
  })

  it('leaves already-relative and anchor links alone', () => {
    const rel = resolvePaste({ text: '', html: '<a href="./a.md">a</a>' }, CTX)!
    expect(rel.markdown).toContain('./a.md')

    const anchor = resolvePaste({ text: '', html: '<a href="#top">t</a>' }, CTX)!
    expect(anchor.markdown).toContain('#top')
  })
})

describe('relativePath', () => {
  it('produces a same-folder sibling', () => {
    expect(relativePath('/a/b', '/a/b/c.md')).toBe('c.md')
  })

  it('uses .. when climbing', () => {
    expect(relativePath('/a/b', '/a/c/d.md')).toBe('../c/d.md')
  })

  it('returns null with no shared root, rather than a misleading path', () => {
    expect(relativePath('/x/y', '/p/q/r.md')).toBeNull()
  })
})

describe('imageName', () => {
  const when = new Date('2026-10-16T10:20:30Z')

  it('stamps the name so repeated pastes do not collide', () => {
    expect(imageName([], 'png', when)).toBe('image-20261016102030.png')
  })

  it('avoids an existing name', () => {
    const first = imageName([], 'png', when)
    const second = imageName([first], 'png', when)
    expect(second).not.toBe(first)
    expect(second.endsWith('.png')).toBe(true)
  })

  it('normalises a dotted extension and defaults to png', () => {
    expect(imageName([], '.JPEG', when).endsWith('.jpeg')).toBe(true)
    expect(imageName([], '', when).endsWith('.png')).toBe(true)
  })
})

describe('extensionFor', () => {
  it('maps the common clipboard types', () => {
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('IMAGE/JPEG')).toBe('jpg')
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('image/svg+xml')).toBe('svg')
  })

  it('returns null for anything unhandled', () => {
    expect(extensionFor('image/avif')).toBeNull()
    expect(extensionFor('text/plain')).toBeNull()
  })
})

describe('imageMarkdown', () => {
  it('escapes brackets in the alt text', () => {
    expect(imageMarkdown('a.png', '[brackets]')).toBe('![brackets](a.png)')
  })

  it('percent-encodes spaces in the path', () => {
    expect(imageMarkdown('my image.png')).toBe('![](my%20image.png)')
  })
})