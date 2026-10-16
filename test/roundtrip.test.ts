/**
 * The round-trip gate.
 *
 * `parse -> serialise` must be idempotent. This is the single most valuable test in the
 * project: round-trip loss is what silently eats a user's work in every editor that
 * converts between a source buffer and a rendered view on demand. Both Typora and MarkText
 * have shipped multi-year bugs in exactly this area — cursor and scroll loss on mode switch,
 * footnote mangling, nested-list corruption.
 *
 * This suite is the adaptation of MarkText's best practice (spec conformance in CI) aimed at
 * the thing that actually broke both apps: the round trip, not the parser.
 */

import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../src/core/markdown/parse'
import { serialiseMarkdown } from '../src/core/markdown/serialise'
import type { AnyBlock } from '../src/core/types'

/** Parse, serialise, parse again. Both passes must agree. */
function roundTrip(source: string): { first: string; second: string; blocks: AnyBlock[] } {
  const a = parseMarkdown(source)
  const first = serialiseMarkdown(a.frontMatter, a.blocks).text
  const b = parseMarkdown(first)
  const second = serialiseMarkdown(b.frontMatter, b.blocks).text
  return { first, second, blocks: a.blocks }
}

function expectStable(source: string): void {
  const { first, second } = roundTrip(source)
  expect(second, `not idempotent for:\n${source}`).toBe(first)
}

describe('round-trip idempotence', () => {
  const cases: Record<string, string> = {
    'plain paragraph': 'Just some text.\n',
    emphasis: 'Some *emphasis* and **strong**.\n',
    'cjk emphasis': '这是*强调*文本，需要正确处理。\n',
    'cjk strong': '这是**强调**文本。\n',
    headings: '# One\n\n## Two\n\n### Three\n',
    'setext heading': 'Title\n=====\n\nSubtitle\n--------\n',
    'all heading levels': '# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f\n',
    'bullet list': '- one\n- two\n- three\n',
    'nested bullet list': '- one\n  - nested\n  - also nested\n- two\n',
    'ordered list': '1. one\n2. two\n3. three\n',
    'ordered start': '5. five\n6. six\n',
    'mixed list types': '- outer\n  1. inner ordered\n  2. inner again\n- outer two\n',
    'task list': '- [ ] todo\n- [x] done\n',
    'task list nested': '- [ ] parent\n  - [x] child done\n  - [ ] child todo\n',
    blockquote: '> A quote.\n',
    'blockquote with list': '> - one\n> - two\n',
    'nested blockquote': '> outer\n> > inner\n',
    'thematic break': '---\n',
    'inline code': 'Use `npm install` first.\n',
    'code with backticks': 'Use `` `backticks` `` here.\n',
    fence: '```js\nconst a = 1\n```\n',
    'fence with meta': '```python title="x.py"\nprint(1)\n```\n',
    'tilde fence': '~~~\ncode\n~~~\n',
    'fence containing backticks': '```\n```\n```\n',
    'fenced code with pipes': '```\na | b\n--- | ---\n1 | 2\n```\n',
    table: '| a | b |\n|---|---|\n| 1 | 2 |\n',
    'table with alignment': '| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n',
    link: 'See [the docs](https://example.com).\n',
    'link with title': '[t](https://example.com "Title")\n',
    image: '![alt](image.png)\n',
    strikethrough: '~~gone~~\n',
    hardbreak: 'line one  \nline two\n',
    'html block': '<div class="x">raw</div>\n',
    'escaped chars': 'Literal \\*asterisks\\* and \\_underscores\\_.\n',
    'literal backslash': 'Path C:\\Users\\test\n',
    'pipe in table cell': '| a |\n|---|\n| x \\| y |\n',
    'empty document': '',
    'whitespace only': '\n\n\n',
  }

  for (const [name, source] of Object.entries(cases)) {
    it(name, () => expectStable(source))
  }
})

describe('front matter', () => {
  it('is preserved verbatim', () => {
    const source = '---\ntitle: Test\ntags: [a, b]\n---\n\n# Heading\n'
    const parsed = parseMarkdown(source)
    expect(parsed.frontMatter).toBe('title: Test\ntags: [a, b]')
    const { text } = serialiseMarkdown(parsed.frontMatter, parsed.blocks)
    expect(text).toContain('title: Test')
    expect(text).toContain('# Heading')
  })

  it('does not mistake a thematic break for front matter', () => {
    const source = '---\n\nJust text after a rule.\n'
    expect(parseMarkdown(source).frontMatter).toBeNull()
  })
})

describe('footnotes', () => {
  it('lifts definitions into blocks', () => {
    const parsed = parseMarkdown('Text[^a].\n\n[^a]: The note.\n')
    const fn = parsed.blocks.find((b) => b.kind === 'footnote')
    expect(fn).toBeDefined()
    expect(fn!.attrs.id).toBe('a')
  })

  it('round-trips', () => {
    expectStable('Text with a note[^1].\n\n[^1]: The note body.\n')
  })
})

describe('structure preservation', () => {
  it('keeps heading levels through a round trip', () => {
    const src = '# a\n\n### c\n\n## b\n'
    const { blocks } = roundTrip(src)
    const levels = blocks.filter((b) => b.kind === 'heading').map((b) => (b as AnyBlock).attrs.level)
    expect(levels).toEqual([1, 3, 2])
  })

  it('keeps a list strictly nested through a round trip', () => {
    const src = '- one\n  - two\n    - three\n'
    const { first, second, blocks } = roundTrip(src)
    expect(second).toBe(first)
    expect(first).toBe('- one\n  - two\n    - three\n')

    // And the nesting is real structure, not just indentation in the text.
    const list = blocks.find((b) => b.kind === 'bullet_list')!
    expect(list.children).toHaveLength(1)
    const nested = list.children![0]!.children!.find((c) => c.kind === 'bullet_list')
    expect(nested, 'expected a nested bullet_list').toBeDefined()
    expect(nested!.children).toHaveLength(1)
  })

  it('preserves table alignment', () => {
    const { blocks } = roundTrip('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n')
    const table = blocks.find((b) => b.kind === 'table')
    expect(table).toBeDefined()
    expect(table!.attrs.alignments).toEqual(['left', 'center', 'right'])
  })

  it('does not rewrite a setext heading as ATX', () => {
    const { first } = roundTrip('Title\n=====\n')
    expect(first.trimEnd()).toBe('Title\n=====')
  })
})

describe('lossy reporting', () => {
  it('reports nothing for well-formed input', () => {
    const parsed = parseMarkdown('# A\n\n- b\n- c\n\n| x |\n|---|\n| 1 |\n')
    const { lossy } = serialiseMarkdown(parsed.frontMatter, parsed.blocks)
    expect(lossy).toEqual([])
  })
})

describe('fuzz', () => {
  it('holds over generated documents', () => {
    const atoms = [
      '# Heading',
      'Plain sentence with *emphasis*.',
      '- bullet item',
      '1. ordered item',
      '> quoted',
      '```js\ncode()\n```',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      '---',
      'Text with `code` and **bold**.',
      '- [ ] task',
    ]

    // Deterministic pseudo-random so failures are reproducible.
    let seed = 0x9e3779b9
    const rand = () => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return ((seed >>> 0) % 1000) / 1000
    }

    for (let doc = 0; doc < 120; doc++) {
      const count = 1 + Math.floor(rand() * 6)
      const parts: string[] = []
      for (let i = 0; i < count; i++) parts.push(atoms[Math.floor(rand() * atoms.length)]!)
      const source = parts.join('\n\n') + '\n'
      const { first, second } = roundTrip(source)
      expect(second, `unstable document:\n${source}`).toBe(first)
    }
  })
})