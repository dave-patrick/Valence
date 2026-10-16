/**
 * Document statistics — Typora's word-count feature done properly.
 *
 * Counts prose, not markup. Code fences, inline code, URLs, and math are excluded, because a
 * "1,204 words" figure that counts `import` statements is a worse lie than no figure at all.
 * CJK is counted per character, since word boundaries do not apply.
 */

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

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/

/** 238 wpm is the median adult silent-reading rate for non-technical prose (Brysbaert 2019). */
const WPM = 238

export function computeStats(source: string): DocumentStats {
  const lines = source.split('\n')
  let inFence = false
  let fenceChar = ''

  const prose: string[] = []
  let codeBlocks = 0
  let headings = 0

  for (const line of lines) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceChar = fence[1]![0]!
        codeBlocks++
      } else if (fence[1]![0] === fenceChar) {
        inFence = false
      }
      continue
    }
    if (inFence) continue

    if (/^\s{0,3}#{1,6}\s/.test(line)) headings++

    let text = line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s*([-*+]|\d+\.)\s+/, '')
      .replace(/^\s*\[([ xX])\]\s+/, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~`^=|]/g, '')

    if (text.trim()) prose.push(text)
  }

  const text = prose.join(' ')
  const cjkCount = (text.match(new RegExp(CJK, 'g')) ?? []).length
  const latinCount = countLatinWords(text)

  const words = latinCount + cjkCount
  const characters = [...text].length
  const charactersNoSpaces = [...text.replace(/\s/g, '')].length

  return {
    words,
    characters,
    charactersNoSpaces,
    lines: lines.length,
    paragraphs: prose.filter((p) => p.trim()).length,
    headings,
    codeBlocks,
    images: (source.match(/!\[[^\]]*\]\(/g) ?? []).length,
    links: (source.match(/(?<!!)\[[^\]]*\]\(/g) ?? []).length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / WPM)),
  }
}

function countLatinWords(text: string): number {
  const stripped = text.replace(new RegExp(CJK, 'g'), ' ')
  return (stripped.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length
}

/** Live progress against a goal, for the inspector. */
export function goalProgress(stats: DocumentStats, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(1, stats.words / goal)
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}