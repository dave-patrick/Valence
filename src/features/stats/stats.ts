import MarkdownIt from 'markdown-it'
import type { Node as ProseMirrorNode, Mark } from '@tiptap/pm/model'
import { parseFrontMatter } from '../../shared/frontMatter'

export interface DocumentStats {
  words: number
  characters: number
  charactersNoSpaces: number
  lines: number
  paragraphs: number
  headings: number
  codeBlocks: number
  images: number
  links: number
  readingMinutes: number
}
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g
const WPM = 238
const markdown = new MarkdownIt({ html: true, linkify: true })
const withoutUrls = (text: string) => text.replace(/\b(?:https?:\/\/|www\.)[^\s<>]+/gi, '')
function finish(text: string, structure: Pick<DocumentStats, 'lines' | 'paragraphs' | 'headings' | 'codeBlocks' | 'images' | 'links'>): DocumentStats {
  const words = (text.match(CJK) ?? []).length + (text.replace(CJK, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length
  return { ...structure, words, characters: [...text].length, charactersNoSpaces: [...text.replace(/\s/g, '')].length,
    readingMinutes: words ? Math.max(1, Math.round(words / WPM)) : 0 }
}

/** Count literal text, or Markdown prose excluding code, math, URLs and metadata. */
export function computeStats(source: string, format: 'markdown' | 'text' = 'markdown'): DocumentStats {
  const structure = { lines: source.split('\n').length, paragraphs: 0, headings: 0, codeBlocks: 0, images: 0, links: 0 }
  if (format === 'text') return finish(source, { ...structure, paragraphs: source.split(/\r?\n\s*\r?\n/).filter(p => p.trim()).length })
  // Math is represented by custom editor atoms; remove its source before the Markdown parser.
  const body = parseFrontMatter(source).body.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/(?<!\\)\$(?!\s)([^$\n]*?\S)\$/g, '')
  const prose: string[] = []
  for (const token of markdown.parse(body, {})) {
    if (token.type === 'fence' || token.type === 'code_block') structure.codeBlocks++
    if (token.type === 'heading_open') structure.headings++
    if (token.type !== 'inline') continue
    let text = ''
    for (const child of token.children ?? []) {
      if (child.type === 'image') structure.images++
      if (child.type === 'link_open') structure.links++
      if (child.type === 'text') text += withoutUrls(child.content)
      if (child.type === 'softbreak' || child.type === 'hardbreak') text += '\n'
    }
    if (text.trim()) { prose.push(text); structure.paragraphs++ }
  }
  return finish(prose.join('\n'), structure)
}

/** Visit editor nodes directly so live statistics do not require Markdown serialization. */
export function computeRichStats(doc: ProseMirrorNode): DocumentStats {
  const structure = { lines: 1, paragraphs: 0, headings: 0, codeBlocks: 0, images: 0, links: 0 }
  const prose: string[] = []
  doc.descendants(node => {
    const name = node.type.name
    if (name === 'codeBlock' || name === 'diagram') { structure.codeBlocks++; return false }
    if (name === 'mathBlock' || name === 'inlineMath') return false
    if (name === 'heading') structure.headings++
    if (name === 'image') { structure.images++; return false }
    if (!node.isTextblock) return
    let text = ''
    let previousLink: Mark | null = null
    node.descendants(child => {
      const link = child.marks.find(mark => mark.type.name === 'link')
      if (link && (!previousLink || !link.eq(previousLink))) structure.links++
      previousLink = link ?? null
      if (child.isText && !child.marks.some(mark => mark.type.name === 'code')) text += withoutUrls(child.text ?? '')
      if (child.type.name === 'hardBreak') text += '\n'
      if (child.type.name === 'image') structure.images++
      return !['inlineMath', 'mathBlock', 'image'].includes(child.type.name)
    })
    if (text.trim()) { prose.push(text); structure.paragraphs++ }
    return false
  })
  structure.lines = Math.max(1, prose.join('\n').split('\n').length)
  return finish(prose.join('\n'), structure)
}

export function goalProgress(stats: DocumentStats, goal: number): number { return goal <= 0 ? 0 : Math.min(1, stats.words / goal) }
export function formatCount(n: number): string { return n.toLocaleString('en-US') }
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60), m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}
