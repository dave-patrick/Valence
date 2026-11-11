/** Literal document search. Offsets are UTF-16, matching textarea and ProseMirror positions. */
export interface SearchOptions { matchCase: boolean; wholeWord: boolean }
export interface SearchMatch { from: number; to: number }
export function findTextMatches(text: string, query: string, options: SearchOptions): SearchMatch[] {
  if (!query) return []
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const word = '[\\p{L}\\p{M}\\p{N}_]'
  const pattern = options.wholeWord ? `(?<!${word})${literal}(?!${word})` : literal
  const regex = new RegExp(pattern, options.matchCase ? 'gu' : 'giu')
  return Array.from(text.matchAll(regex), match => ({ from: match.index!, to: match.index! + match[0].length }))
}
export function replaceTextMatches(text: string, matches: readonly SearchMatch[], replacement: string): string {
  let result = text
  for (const match of [...matches].reverse()) result = result.slice(0, match.from) + replacement + result.slice(match.to)
  return result
}
