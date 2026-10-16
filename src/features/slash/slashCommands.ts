/**
 * Slash commands.
 *
 * Typing `/` at the start of a block opens a small menu. The commands here insert and transform
 * blocks; they are deliberately *not* the same thing as the global command palette (Ctrl+P):
 *
 *  - Ctrl+P is where you go when you already know which command exists; it is an index of the
 *    whole application.
 *  - the slash menu is for inserting things into the document. Making them one list would mean
 *    searching "Heading 2" past "Set theme" and "Open file", which is why every editor that
 *    has both has regretted combining them.
 *
 * Everything here that can be pure is pure, so the matching behaviour is locked down without a
 * DOM.
 */

export interface SlashItem {
  id: string
  /** Label shown in the menu. */
  label: string
  /** Group column header. */
  group: SlashGroup
  /** Plain explanation, one line, under 60 chars. */
  description: string
  /** Aliases that should match but are not shown. */
  keywords?: string[]
  /** lowercase "style tag" shown on the right. */
  tag?: string
}

export type SlashGroup = 'basics' | 'structure' | 'advanced'

export const SLASH_GROUPS: readonly SlashGroup[] = ['basics', 'structure', 'advanced']

export const SLASH_ITEMS: readonly SlashItem[] = [
  // Basics
  { id: 'h1', label: 'Heading 1', group: 'basics', description: 'Top level heading', keywords: ['title', 'h1'], tag: 'h1' },
  { id: 'h2', label: 'Heading 2', group: 'basics', description: 'Section heading', keywords: ['h2'], tag: 'h2' },
  { id: 'h3', label: 'Heading 3', group: 'basics', description: 'Subsection heading', keywords: ['h3'], tag: 'h3' },
  { id: 'paragraph', label: 'Paragraph', group: 'basics', description: 'Plain text block', keywords: ['text', 'p'] },
  { id: 'quote', label: 'Quote', group: 'basics', description: 'Blockquote', keywords: ['bq'], tag: '>' },
  { id: 'list.bullet', label: 'Bulleted list', group: 'basics', description: 'Unordered list', keywords: ['ul', 'bullets'] },
  { id: 'list.numbered', label: 'Numbered list', group: 'basics', description: 'Ordered list', keywords: ['ol'] },
  { id: 'list.task', label: 'Task list', group: 'basics', description: 'Checkboxes you can tick', keywords: ['todo', 'checkbox'] },
  { id: 'code', label: 'Code block', group: 'basics', description: 'Fenced code, syntax highlighted', tag: '{ }' },
  { id: 'horizontal', label: 'Divider', group: 'basics', description: 'A horizontal rule', keywords: ['hr', 'rule'] },
  // Structure
  { id: 'table', label: 'Table', group: 'structure', description: '2 x 2 table, edit with the toolbar', keywords: ['grid'] },
  { id: 'callout', label: 'Callout', group: 'structure', description: 'Highlighted note block' },
  { id: 'frontmatter', label: 'Front matter', group: 'structure', description: 'YAML metadata at the top', keywords: ['yaml', 'fm'] },
  { id: 'footnote.ref', label: 'Footnote reference', group: 'structure', description: 'Inserts [^id] at the caret', keywords: ['fn'] },
  // Advanced
  { id: 'math.block', label: 'Math block', group: 'advanced', description: 'Display LaTeX', keywords: ['tex', 'latex'] },
  { id: 'math.inline', label: 'Math inline', group: 'advanced', description: 'Inline LaTeX', keywords: ['tex'] },
  { id: 'diagram', label: 'Diagram', group: 'advanced', description: 'Mermaid diagram, rendered inline', keywords: ['mermaid'] },
]

interface Found {
  score: number
  indices: number[]
}

/* Reuses the same subsequence matcher as the command palette, trimmed to be independent. */
function fuzzy(q: string, text: string): Found | null {
  if (!q) return { score: 0, indices: [] }
  if (!text) return null
  const ql = q.toLowerCase()
  const tl = text.toLowerCase()
  const indices: number[] = []
  let ti = 0
  let score = 0
  for (const ch of ql) {
    if (ch === ' ') continue
    const found = tl.indexOf(ch, ti)
    if (found === -1) return null
    if (found === 0) score += 12
    else if ([' ', '-', '_', '/', '.', ':'].includes(tl[found - 1]!)) score += 10
    if (indices.length && found === ti) score += 8
    if (text[found] === ch) score += 1
    indices.push(found)
    ti = found + 1
  }
  // Length penalty so "Table" beats "Table cells of the table" for "tab".
  score -= text.length * 0.05
  return { score, indices }
}

export function searchSlashItems(items: readonly SlashItem[], query: string): SlashItem[] {
  const q = query.trim().replace(/^\/+/, '')
  if (!q) return [...items]
  const matched = items
    .map((item) => {
      const title = fuzzy(q, item.label)
      const keyword = item.keywords
        ? item.keywords.map((k) => fuzzy(q, k)).filter((m): m is Found => !!m).sort((a, b) => b.score - a.score)[0]
        : null
      const score = title ? title.score + 12 : (keyword?.score ?? -Infinity)
      return { item, score, hasTitle: !!title }
    })
    .filter((m) => m.score !== -Infinity)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
  return matched.map((m) => m.item)
}

/**
 * The `/` is only a command trigger when it sits alone in a new block — a `/` inside
 * "foo/bar" is a path. The rules here are framework-independent because the editor passes in
 * the text before the caret and the start offset.
 */
export function slashQueryPrefix(textBeforeCaret: string): string | null {
  // Everything from the `/` to the caret, with no spaces.
  const lastSlash = textBeforeCaret.lastIndexOf('/')
  if (lastSlash === -1) return null
  const after = textBeforeCaret.slice(lastSlash + 1)
  if (/\s/.test(after)) return null
  if (lastSlash > 0 && !/\s/.test(textBeforeCaret[lastSlash - 1]!)) {
    // Not preceded by whitespace or block start.
    return null
  }
  return after
}