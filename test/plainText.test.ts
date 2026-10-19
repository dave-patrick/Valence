import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../src/core/markdown/parse'
import { plainText } from '../src/core/markdown/serialise'

describe('plainText', () => {
  it('strips all markdown syntax from inline content', () => {
    const doc = parseMarkdown('# Hello **world**\n\n- a list\n- *another* item\n')
    expect(plainText(doc.blocks)).toContain('Hello world')
    expect(plainText(doc.blocks)).toContain('a list')
    expect(plainText(doc.blocks)).toContain('another item')
    expect(plainText(doc.blocks)).not.toContain('**')
    expect(plainText(doc.blocks)).not.toContain('#')
    expect(plainText(doc.blocks)).not.toContain('*')
  })

  it('keeps image alt text', () => {
    const doc = parseMarkdown('![alt text](image.png)\n')
    expect(plainText(doc.blocks)).toContain('alt text')
    expect(plainText(doc.blocks)).not.toContain('!')
    expect(plainText(doc.blocks)).not.toContain('[]')
    expect(plainText(doc.blocks)).not.toContain('()')
  })

  it('handles thematic breaks and blockquotes', () => {
    const doc = parseMarkdown('a quote\n\n---\n')
    const out = plainText(doc.blocks)
    expect(out).toContain('a quote')
    expect(out).toContain('---')
  })

  it('handles empty input', () => {
    const doc = parseMarkdown('')
    expect(plainText(doc.blocks)).toBe('')
  })

  it('handles links as plain text', () => {
    const doc = parseMarkdown('[link text](https://example.com)\n')
    const out = plainText(doc.blocks)
    expect(out).toContain('link text')
    expect(out).not.toContain('[')
    expect(out).not.toContain(']')
    expect(out).not.toContain('(')
    expect(out).not.toContain(')')
  })
})
