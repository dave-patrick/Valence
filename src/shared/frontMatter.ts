/** Front matter handling. Preserved verbatim — re-serialising YAML would reorder and
 * restyle keys, which is exactly the kind of silent edit that loses a user's data. */

export interface FrontMatterSplit {
  /** Raw source between the delimiters, or null if absent. */
  data: string | null
  /** Everything after the closing delimiter. */
  body: string
  /** Opening delimiter, so serialise can reproduce it. */
  fence: string | null
}

const RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

export function parseFrontMatter(source: string): FrontMatterSplit {
  const m = RE.exec(source)
  if (!m) return { data: null, body: source, fence: null }
  const fence = source.startsWith('+++') ? '+++' : source.match(/^(---|\+\+\+)/)?.[1] ?? '---'
  // Guard against a `---` that is really a thematic break followed by prose.
  if (m[1] === undefined || /^\s*$/.test(m[1])) {
    return { data: null, body: source, fence: null }
  }
  return { data: m[1], body: source.slice(m[0].length), fence }
}

export function stringifyFrontMatter(data: string, fence = '---'): string {
  return `${fence}\n${data.replace(/\s*$/, '')}\n${fence}\n`
}

/** Shallow key read without a YAML dependency in the parse path — the editor only needs the
 * document title for tabs and window titles, not full document semantics. */
export function readScalar(data: string, key: string): string | undefined {
  const re = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*$`, 'm')
  const m = re.exec(data)
  if (!m) return undefined
  return m[1]!.replace(/^["']|["']$/g, '')
}