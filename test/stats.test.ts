import { describe, expect, it } from 'vitest'
import { computeStats } from '../src/features/stats/stats'
describe('document statistics', () => {
  it('excludes inline code, math, URLs and frontmatter from prose', () => {
    expect(computeStats('---\ntitle: Secret words\n---\nHello `const value = 42` $x + y = z$ https://example.com/foo world').words).toBe(2)
  })
  it('counts plain text literally, including Markdown-looking lines', () => {
    expect(computeStats('```\nhello world\n```', 'text').words).toBe(2)
  })
  it('keeps a longer fence open when a shorter fence occurs inside', () => {
    expect(computeStats('````\ncode\n```\nstill code\n````\nhello').words).toBe(1)
  })
})
