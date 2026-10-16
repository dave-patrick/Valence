/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../src/core/markdown/parse'
import { serialiseMarkdown } from '../src/core/markdown/serialise'

function roundtrip(text: string) {
  const { blocks } = parseMarkdown(text, { html: true, linkify: true, typographer: false })
  const out = serialiseMarkdown(null, blocks)
  return { input: text.trim(), output: out.text.trim() }
}

describe('wiki links', () => {
  it('parses `[[Note]]` as a wikilink mark', () => {
    const { blocks } = parseMarkdown('See [[Ideas]] here.', { html: true, linkify: false, typographer: false })
    expect(JSON.stringify(blocks)).toContain('"type":"wikilink"')
  })

  it('records the target separately from display text', () => {
    const { blocks } = parseMarkdown('See [[Ideas|alias]] here.', { html: true, linkify: false, typographer: false })
    const json = JSON.stringify(blocks)
    expect(json).toContain('"target":"Ideas"')
    expect(json).toContain('"alias":"alias"')
  })

  it('round-trips a bare link', () => {
    const { input, output } = roundtrip('See [[Ideas]] here.')
    expect(output).toBe(input)
  })

  it('round-trips an aliased link', () => {
    const { input, output } = roundtrip('See [[Ideas|my idea]] here.')
    expect(output).toBe(input)
  })

  it('round-trips a link with a heading', () => {
    const { input, output } = roundtrip('See [[Ideas#Later]] here.')
    expect(output).toBe(input)
  })

  it('round-trips a fully specified link', () => {
    const { input, output } = roundtrip('See [[Notes/Concepts#Intro|start here]] here.')
    expect(output).toBe(input)
  })

  it('does not touch a link that has an alias in its display text', () => {
    const { input, output } = roundtrip('Read [[A]] and write [[B]] in the same line.')
    expect(output).toBe(input)
  })

  it('survives a heading that contains brackets only by adjacency', () => {
    const { input, output } = roundtrip('# Top\n\n[[Ideas]]')
    expect(output).toBe(input)
  })

  it('html bridge preserves wikilink data on roundtrip through htmlToBlocks', async () => {
    const { blocksToHtml, htmlToBlocks } = await import('../src/core/htmlBridge')
    const { blocks } = parseMarkdown('See [[Ideas]] here.', { html: true, linkify: false, typographer: false })
    const html = blocksToHtml(blocks)
    expect(html).toContain('data-type="wikilink"')
    expect(html).toContain('data-target="Ideas"')
    const back = htmlToBlocks(html)
    expect(JSON.stringify(back)).toContain('"type":"wikilink"')
  })
})