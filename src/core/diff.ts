/**
 * Text diff.
 *
 * Unified diff with context, the shape `diff -u` produces and every person already reads. For
 * prose we want intraline granularity only insofar as word-level highlighting helps inside a
 * changed line; the line-level diff underneath stays conventional so the file stays readable
 * in other tools.
 *
 * Myers would be the right choice at scale. Prose is not at scale — even a novel diff is tens
 * of thousands of lines and the matrix is a few MB. LCS is readable and impossible to get
 * quietly wrong, which is the property that matters here.
 */

export type DiffHunk = {
  /** Three-character change tag. "+" add, "-" remove, " " context, notes change marker. */
  kind: 'add' | 'remove' | 'context' | 'header'
  lines: string[]
  /** Source line index this hunk begins at. */
  fromLine: number
  /** Target line index this hunk begins at. */
  toLine: number
}

export interface UnifiedDiff {
  hunks: DiffHunk[]
  stats: { added: number; removed: number }
  identical: boolean
}

/**
 * Splits into lines and strips exactly one trailing newline, which is what a text file has.
 * We do not strip more, because a file ending in two newlines is a real file ending in an
 * empty line and erasing that is a quiet bug.
 */
export function toLines(text: string): string[] {
  return text.split('\n').join('\n') === text && text.includes('\n') && text.endsWith('\n')
    ? text.slice(0, -1).split('\n')
    : text.split('\n')
}

export function toLinesN(text: string): string[] {
  if (text === '') return []
  const normalized = text.replace(/\r\n/g, '\n')
  return normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n')
}

export function diff(a: string, b: string, context = 3): UnifiedDiff {
  const ax = toLinesN(a)
  const by = toLinesN(b)

  const n = ax.length
  const m = by.length
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (ax[i] === by[j]) lcs[i]![j]! = lcs[i + 1]![j + 1]! + 1
      else lcs[i]![j]! = Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const ops: Array<{ kind: 'keep' | 'add' | 'remove'; line: string; ai?: number; bi?: number }> = []
  let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && ax[i] === by[j]) {
      ops.push({ kind: 'keep', line: ax[i]!, ai: i, bi: j })
      i++; j++
    } else if (j < m && (i === n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      ops.push({ kind: 'add', line: by[j]!, bi: j })
      j++
    } else if (i < n) {
      ops.push({ kind: 'remove', line: ax[i]!, ai: i })
      i++
    }
  }

  if (!ops.some((o) => o.kind !== 'keep')) {
    return { hunks: [], stats: { added: 0, removed: 0 }, identical: true }
  }

  type Line = { kind: 'add' | 'remove' | 'context'; text: string }
  const blocks: { lines: Line[]; fromLine: number; toLine: number }[] = []
  const ranges: Array<{ start: number; end: number }> = []

  let added = 0, removed = 0
  for (const o of ops) {
    if (o.kind === 'add') added++
    if (o.kind === 'remove') removed++
  }

  // Context around each changed line, merged when blocks overlap.
  const changed = new Set<number>()
  for (let idx = 0; idx < ops.length; idx++) {
    if (ops[idx]!.kind !== 'keep') changed.add(idx)
  }
  const picked = new Set<number>()
  for (const c of changed) {
    for (let k = c - context; k <= c + context; k++) {
      if (k >= 0 && k < ops.length) picked.add(k)
    }
  }

  // Group picked indices into contiguous blocks, with header offsets.
  let idx = 0
  while (idx < ops.length) {
    if (!picked.has(idx)) { idx++; continue }
    const blockLines: Line[] = []
    let start = idx
    const ai = ops[idx]!.kind === 'add' ? (ops[idx]!.bi ?? 0) : (ops[idx]!.ai ?? 0)
    const bi = ops[idx]!.kind === 'add' ? (ops[idx]!.bi ?? 0) : (ops[idx]!.bi ?? 0)
    let firstAi = -1, firstBi = -1
    while (idx < ops.length && picked.has(idx)) {
      const o = ops[idx]!
      if (o.kind === 'keep') blockLines.push({ kind: 'context', text: o.line })
      else if (o.kind === 'add') blockLines.push({ kind: 'add', text: o.line })
      else blockLines.push({ kind: 'remove', text: o.line })
      if (firstAi === -1 && o.ai !== undefined) firstAi = o.ai
      if (firstBi === -1 && o.bi !== undefined) firstBi = o.bi
      idx++
    }
    blocks.push({
      lines: blockLines,
      fromLine: (firstAi === -1 ? 0 : firstAi) + 1,
      toLine: (firstBi === -1 ? 0 : firstBi) + 1,
    })
  }

  const hunks: DiffHunk[] = blocks.map((b) => ({
    kind: 'header',
    lines: [`@@ -${b.fromLine},${b.lines.filter((l) => l.kind !== 'add').length} +${b.toLine},${b.lines.filter((l) => l.kind !== 'remove').length} @@`],
    fromLine: b.fromLine,
    toLine: b.toLine,
  }))
  // interleaved header+lines into hunks (one hunk per block)
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b]!
    const hunk: DiffHunk = {
      kind: 'context',
      lines: [hunks[b]!.lines[0]!, ...block.lines.map((l) => {
        if (l.kind === 'add') return '+' + l.text
        if (l.kind === 'remove') return '-' + l.text
        return ' ' + l.text
      })],
      fromLine: block.fromLine,
      toLine: block.toLine,
    }
    hunks[b] = hunk
  }

  return { hunks, stats: { added, removed }, identical: false }
}