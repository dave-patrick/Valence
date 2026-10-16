/**
 * Command registry and fuzzy matching.
 *
 * Two reasons this is a module and not a `switch` in the app shell:
 *
 *  - there is one list of what the app can do, so the menu, the keyboard and the palette
 *    cannot drift apart and quietly disagree about what exists;
 *  - the interesting part — deciding that "expt phl" means "Export as PDF" — is pure string
 *    work and can be tested without a DOM, which is the only way to test it exhaustively.
 *
 * The matcher is a subsequence match with positional bonuses. It deliberately does *not* do
 * the aggressive camel-case or acronym splitting some palettes use: those make results
 * surprising, and an editor that runs the wrong command is worse than one that needs two
 * extra keystrokes.
 */

export interface CommandDef {
  id: string
  title: string
  /** Left-hand column in the palette. Also used to group and to break score ties. */
  group: string
  /** Display only. The real binding is enforced by the shell. */
  keys?: string
  /**
   * Words that should match but are not shown, e.g. "docx word export" for
   * "Export as Word". Without these, finding a command means already knowing its title.
   */
  keywords?: string
}

export interface ScoredCommand extends CommandDef {
  score: number
  /** Character indices in `title` to emphasise. */
  indices: number[]
}

/* ──────────────────────────────────────────────────────────────
 * Matching
 * ──────────────────────────────────────────────────────────────*/

const SEPARATORS = new Set([' ', '-', '_', '/', '.', ':'])

/** Continuing the previous character. Must outweigh every other bonus combined. */
const RUN = 16
const WORD_START = 8
const FIRST_CHAR = 8
const SEPARATOR_BEFORE = 6
const CASE_MATCH = 1

interface Match {
  score: number
  indices: number[]
}

/**
 * Scores `query` against `text`, or returns null when the characters cannot be found in order.
 *
 * This is a proper search, not a greedy walk, and both shortcuts are wrong in ways that show
 * up immediately in a palette:
 *
 *  - Greedy leftmost takes the first available character, so "pdf" matches the `p` in
 *    "Ex**p**ort as P**DF**" and highlights the wrong span.
 *  - Greedy best-scoring takes the best-looking character and then discovers it stranded the
 *    rest of the query: "pd" against "Copy and paste" picks the `p` of "paste", which has no
 *    `d` after it, and reports no match at all.
 *
 * So it maximises total score over all valid alignments, memoised on (query position, text
 * position). That is O(query x text) states — trivial for the handful of characters a query
 * has and the length of a command title — and it is the only version that gets both cases
 * right without a special case for either.
 */
export function fuzzyMatch(query: string, text: string): Match | null {
  if (!query) return { score: 0, indices: [] }
  if (!text) return null

  const chars = [...query.toLowerCase()].filter((c) => c !== ' ')
  if (!chars.length) return { score: 0, indices: [] }

  const lower = text.toLowerCase()
  const memo = new Map<number, Match | null>()

  /**
   * `ti` is always the previous match plus one, so `i === ti` means this character sits
   * immediately after the last one — a run. That stays true across memoisation because the
   * previous index is determined by `ti`.
   */
  const bonusAt = (i: number, qi: number, ti: number): number => {
    let bonus = 0
    if (qi > 0 && i === ti) bonus += RUN
    else if (i === 0) bonus += FIRST_CHAR
    else if (SEPARATORS.has(lower[i - 1]!)) bonus += SEPARATOR_BEFORE
    if (text[i] === chars[qi]) bonus += CASE_MATCH
    return bonus
  }

  const search = (qi: number, ti: number): Match | null => {
    if (qi === chars.length) return { score: 0, indices: [] }

    const key = qi * (lower.length + 1) + ti
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let best: Match | null = null
    for (let i = ti; i < lower.length; i++) {
      if (lower[i] !== chars[qi]) continue

      const rest = search(qi + 1, i + 1)
      if (!rest) continue

      const candidate: Match = {
        score: bonusAt(i, qi, ti) + rest.score,
        indices: [i, ...rest.indices],
      }
      if (!best || candidate.score > best.score) best = candidate
    }

    memo.set(key, best)
    return best
  }

  const found = search(0, 0)
  if (!found) return null

  // A shorter target that used the same characters is the better answer.
  return { score: found.score - (text.length - chars.length) * 0.15, indices: found.indices }
}

/**
 * Ranks commands against a query.
 *
 * Title matches always beat keyword matches, however well the keyword scores: someone typing
 * "export" wants the thing called Export, not something that merely mentions the word.
 */
export function searchCommands(commands: readonly CommandDef[], query: string): ScoredCommand[] {
  const q = query.trim()
  if (!q) {
    // Unfiltered: stable, and in the order the app declares them.
    return commands.map((c) => ({ ...c, score: 0, indices: [] }))
  }

  const out: ScoredCommand[] = []

  for (const cmd of commands) {
    const title = fuzzyMatch(q, cmd.title)
    if (title) {
      out.push({ ...cmd, score: title.score + 12, indices: title.indices })
      continue
    }

    let best: Match | null = null
    for (const word of (cmd.keywords ?? '').split(/\s+/).filter(Boolean)) {
      const m = fuzzyMatch(q, word)
      if (m && (!best || m.score > best.score)) best = m
    }
    if (best) out.push({ ...cmd, score: best.score, indices: [] })
  }

  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
}

/* ──────────────────────────────────────────────────────────────
 * The registry
 * ──────────────────────────────────────────────────────────────*/

/**
 * Everything the app can do, in palette order.
 *
 * The shell dispatches on `id`, so adding a row here is the whole change for a new command —
 * the menu item, the palette entry and the shortcut hint all come from this list.
 */
export const COMMANDS: readonly CommandDef[] = [
  // File
  { id: 'file.new', title: 'New document', group: 'File', keys: 'Ctrl N' },
  { id: 'file.open', title: 'Open file', group: 'File', keys: 'Ctrl O' },
  { id: 'file.openWorkspace', title: 'Open workspace', group: 'File', keywords: 'vault folder project', keys: 'Ctrl Shift O' },
  { id: 'file.save', title: 'Save', group: 'File', keys: 'Ctrl S' },
  { id: 'file.saveAll', title: 'Save all', group: 'File', keys: 'Ctrl Shift S' },
  { id: 'file.export', title: 'Export', group: 'File', keys: 'Ctrl E', keywords: 'pdf word docx epub latex html' },
  { id: 'file.close', title: 'Close document', group: 'File', keys: 'Ctrl W' },
  { id: 'file.reveal', title: 'Reveal in file manager', group: 'File', keywords: 'finder explorer folder' },

  // View
  { id: 'view.hybrid', title: 'View: hybrid', group: 'View', keywords: 'preview rich formatted' },
  { id: 'view.source', title: 'View: source', group: 'View', keywords: 'markdown raw text edit' },
  { id: 'view.split', title: 'View: split', group: 'View', keywords: 'reader side by side preview' },
  { id: 'view.toggle', title: 'Toggle split view', group: 'View' },
  { id: 'view.cycle', title: 'Cycle view mode', group: 'View' },

  // Panels
  { id: 'panel.files', title: 'Toggle files panel', group: 'Panel', keywords: 'sidebar tree' },
  { id: 'panel.outline', title: 'Toggle outline panel', group: 'Panel', keywords: 'headings sidebar' },
  { id: 'panel.search', title: 'Toggle search panel', group: 'Panel', keywords: 'find sidebar' },
  { id: 'panel.toggle', title: 'Toggle all panels', group: 'Panel', keys: 'Ctrl \\' },

  // Writing
  { id: 'write.focus', title: 'Focus mode', group: 'Writing', keywords: 'dim distraction free' },
  { id: 'write.typewriter', title: 'Typewriter mode', group: 'Writing', keywords: 'centre centre scroll' },
  { id: 'write.stats', title: 'Show word count and reading time', group: 'Writing', keywords: 'count words' },

  // Tabs
  { id: 'tab.next', title: 'Next tab', group: 'Tab', keys: 'Ctrl Alt →' },
  { id: 'tab.prev', title: 'Previous tab', group: 'Tab', keys: 'Ctrl Alt ←' },

  // App
  { id: 'app.theme', title: 'Toggle light and dark theme', group: 'App', keys: 'Ctrl /' },
  { id: 'app.settings', title: 'Open settings', group: 'App', keys: 'Ctrl ,' },
]

/** Groups in the order the palette should list them when nothing is typed. */
export const COMMAND_GROUPS = ['File', 'View', 'Panel', 'Writing', 'Tab', 'App'] as const

/** Case-insensitive lookup, for tests and for dispatch assertions. */
export function commandById(id: string): CommandDef | undefined {
  return COMMANDS.find((c) => c.id === id)
}