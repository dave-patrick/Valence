/**
 * Workspace tree.
 *
 * The platform lists a directory as a flat array; a tree has to be derived from it. Doing
 * that with pure functions keeps the interesting part — path splitting, sorting, filtering,
 * and collapsing single-child directory chains — testable without a DOM.
 *
 * The collapsible chain matters: `notes/2026/q1/journal.md` shows as `2026 > q1 > journal.md`,
 * not as four levels the user has to open one at a time.
 */

export interface FileEntry {
  path: string
  /** Directory entries are used to confirm a folder exists, but never shown. */
  isDirectory: boolean
  size?: number
}

/** What the tree accumulates internally: files that have not been turned into nodes yet. */
interface PendingFile {
  path: string
  name: string
  size: number
}

export type TreeNode =
  | { kind: 'file'; path: string; name: string; size: number }
  | { kind: 'dir'; path: string; name: string; children: TreeNode[] }

/** Extensions the workspace panel treats as documents. Everything else is hidden. */
export const DOCUMENT_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mdx', 'txt']

export function isDocument(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return DOCUMENT_EXTENSIONS.includes(ext)
}

/** Files that should never appear in the tree — editor and VCS noise. */
const IGNORED = new Set([
  '.git', '.obsidian', '.trash', 'node_modules', '.DS_Store', '.trash',
  'Thumbs.db', '.valence',
])

export function isIgnored(name: string): boolean {
  return IGNORED.has(name) || name.startsWith('.')
}

function segment(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean)
}

/**
 * Builds a tree from a flat listing rooted at `root`.
 *
 * Directories present in the listing are used to confirm a folder exists, but only files
 * become visible nodes — an empty folder carries no information in a notes workspace and is
 * just noise to open through.
 */
export function buildTree(root: string, entries: readonly FileEntry[]): TreeNode[] {
  type Mutable = { path: string; name: string; files: PendingFile[]; dirs: Map<string, Mutable> }

  const normRoot = normalise(root)
  const rootNode: Mutable = { path: normRoot, name: basename(normRoot), files: [], dirs: new Map() }

  for (const entry of entries) {
    if (entry.isDirectory || !isDocument(entry.path)) continue
    const name = basename(entry.path)
    if (isIgnored(name)) continue

    const rel = relativeSegments(normRoot, entry.path)
    if (rel === null || rel.length === 0) continue

    let cursor: Mutable | null = rootNode
    // Every segment but the last is a directory; the last is the file itself.
    for (let i = 0; i < rel.length - 1 && cursor; i++) {
      const seg = rel[i]!
      if (isIgnored(seg)) {
        cursor = null
        break
      }
      let next = cursor.dirs.get(seg)
      if (!next) {
        next = { path: joinPath(cursor.path, seg), name: seg, files: [], dirs: new Map() }
        cursor.dirs.set(seg, next)
      }
      cursor = next
    }
    if (!cursor) continue

    cursor.files.push({ path: entry.path, name, size: entry.size ?? 0 })
  }

  const materialise = (node: Mutable): TreeNode[] => {
    const dirs: TreeNode[] = [...node.dirs.values()]
      .filter((d) => !isIgnored(d.name))
      .map((d) => ({ kind: 'dir', path: d.path, name: d.name, children: materialise(d) }))

    const files: TreeNode[] = node.files
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ kind: 'file', path: f.path, name: f.name, size: f.size }))

    return [...sortDirs(dirs), ...files]
  }

  return materialise(rootNode)
}

/** Directories first, then alphabetically; `sortDirs` exists so that is stated once. */
function sortDirs(dirs: TreeNode[]): TreeNode[] {
  return dirs.sort((a, b) => a.name.localeCompare(b.name))
}

/* ──────────────────────────────────────────────────────────────
 * Flattening, for search
 * ──────────────────────────────────────────────────────────────*/

/** A tree flattened to rows with depth, which is what a filter needs to render. */
export interface FlatRow {
  node: TreeNode
  depth: number
}

export function flatten(nodes: readonly TreeNode[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const node of nodes) {
    out.push({ node, depth })
    if (node.kind === 'dir') flatten(node.children, depth + 1, out)
  }
  return out
}

/**
 * Filters the tree by a query, keeping any directory that still contains a match.
 *
 * Directories are matched on their own name too, so typing a folder name shows everything
 * inside it rather than only files whose names happen to contain the query.
 */
export function filterTree(nodes: readonly TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...nodes]

  const walk = (list: readonly TreeNode[]): TreeNode[] => {
    const kept: TreeNode[] = []
    for (const node of list) {
      if (node.kind === 'file') {
        if (node.name.toLowerCase().includes(q)) kept.push(node)
        continue
      }
      if (node.name.toLowerCase().includes(q)) {
        kept.push(node)
        continue
      }
      const children = walk(node.children)
      if (children.length) kept.push({ ...node, children })
    }
    return kept
  }

  return walk(nodes)
}

/* ──────────────────────────────────────────────────────────────
 * Path helpers
 * ──────────────────────────────────────────────────────────────*/

export function normalise(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function basename(path: string): string {
  return segment(path).pop() ?? path
}

/**
 * Parent directory, preserving the root.
 *
 * Splitting on separators and rejoining loses the leading slash, which would turn every
 * absolute path into a relative one -- so this slices the normalised string instead, and
 * `/file.md` correctly yields `/` rather than the empty string.
 */
export function dirname(path: string): string {
  const n = normalise(path)
  if (!n) return ''
  const idx = n.lastIndexOf('/')
  if (idx === -1) return ''
  if (idx === 0) return '/'
  return n.slice(0, idx)
}

/** Path segments of `target` relative to `root`, or null when it is not inside it. */
export function relativeSegments(root: string, target: string): string[] | null {
  const r = segment(normalise(root))
  const t = segment(normalise(target))
  if (r.length > t.length) return null
  for (let i = 0; i < r.length; i++) {
    if (r[i] !== t[i]) return null
  }
  return t.slice(r.length)
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name
  const n = normalise(dir)
  // `normalise('/')` is the empty string, so the root needs handling explicitly or every
  // file under `/` would be joined onto a relative path.
  if (!n) return `/${name}`
  return `${n}/${name}`
}

/**
 * Expands the set of directories whose children should be visible: the root, every ancestor
 * of an open file, and whatever the user has toggled open.
 */
export function expandedFor(paths: readonly string[], openDirs: ReadonlySet<string>): Set<string> {
  const out = new Set<string>(openDirs)
  for (const p of paths) {
    let dir = dirname(p)
    // Include the root itself, then stop — `/` is its own parent and must not loop.
    while (dir) {
      out.add(dir)
      const next = dirname(dir)
      if (next === dir) break
      dir = next
    }
  }
  return out
}