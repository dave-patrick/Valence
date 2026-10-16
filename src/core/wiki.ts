/**
 * Wiki links.
 *
 * `[[Note name]]`, optionally `[[Note name|shown as]]` and `[[Note name#Section]]`.
 *
 * Everything here is pure string and index work. That is not a stylistic choice: resolving a
 * link means deciding what a bare name like `Ideas` refers to, and the rules for that are
 * where the bugs live. Doing it without touching the filesystem is what makes them testable
 * at all.
 *
 * Resolution order, most specific first:
 *
 *  1. an explicit path, relative to the workspace (`notes/Ideas`) — a target containing `/`;
 *  2. an explicit filename (`Ideas.md`) — matched anywhere in the workspace, shallowest first,
 *     because writing the extension is the author disambiguating themselves;
 *  3. a sibling of the linking document, which is what a human means when they write
 *     `[[Ideas]]` from inside the same folder;
 *  4. any file whose name matches, ignoring extension and case.
 *
 * Step 4 can match more than one file. That is not an error — half-written vaults are full of
 * it — but it is reported, so the UI can say "two notes called Ideas" instead of opening one
 * at random and quietly sending someone to the wrong note.
 *
 * The distinction between `Ideas` and `Ideas.md` is load-bearing. The first is a *name*, and
 * names collide; the second is a deliberate reference to a specific file. Treating them the
 * same either sends the reader to the wrong note or refuses to resolve a link that was
 * unambiguous.
 */

export const DOCUMENT_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mdx']

/* ──────────────────────────────────────────────────────────────
 * Parsing
 * ──────────────────────────────────────────────────────────────*/

export interface WikiLink {
  /** The text between the brackets, before any alias or heading. */
  target: string
  /** The part after `|`, when present. */
  alias?: string
  /** The part after `#`, when present. */
  heading?: string
  /** What to render. Falls back to the target, or the alias when there is one. */
  display: string
}

/**
 * Splits link body into target, alias and heading.
 *
 * The alias wins over the heading for display, because that is the order they read in:
 * `[[Note#Section|see here]]` shows "see here" while still navigating to the section.
 */
export function parseWikiLinkBody(body: string): WikiLink | null {
  const trimmed = body.trim()
  if (!trimmed) return null

  // Split the alias off first: everything after the first `|` is the display text, even if it
  // contains a `#`.
  const pipe = trimmed.indexOf('|')
  const left = pipe === -1 ? trimmed : trimmed.slice(0, pipe)
  const alias = pipe === -1 ? undefined : trimmed.slice(pipe + 1).trim() || undefined

  const hash = left.indexOf('#')
  const target = (hash === -1 ? left : left.slice(0, hash)).trim()
  const heading = hash === -1 ? undefined : left.slice(hash + 1).trim() || undefined

  if (!target) return null

  return { target, alias, heading, display: alias ?? target }
}

/* ──────────────────────────────────────────────────────────────
 * Matching
 * ──────────────────────────────────────────────────────────────*/

export interface VaultFile {
  /** Workspace-relative, forward slashes. */
  path: string
}

export type Resolution =
  | { kind: 'resolved'; path: string }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'missing'; target: string }

/** Strips a trailing document extension, if present. */
export function stripExtension(p: string): string {
  const slash = p.lastIndexOf('/')
  const dot = p.lastIndexOf('.')
  return dot > slash + 1 ? p.slice(0, dot) : p
}

export function isDocumentPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return DOCUMENT_EXTENSIONS.includes(ext)
}

/** Case-insensitive, extension-insensitive comparison key. */
function key(p: string): string {
  return stripExtension(p).toLowerCase()
}

/**
 * Resolves a link target against the vault.
 *
 * `fromPath` is the document containing the link, and it matters: `[[Ideas]]` written from
 * `notes/journal.md` should find `notes/Ideas.md` before it finds a same-named file in a
 * different folder, because that is almost always what the author meant.
 */
export function resolveWikiLink(
  target: string,
  files: readonly VaultFile[],
  fromPath: string | null,
): Resolution {
  const wanted = key(target)
  if (!wanted) return { kind: 'missing', target }

  const documents = files.filter((f) => isDocumentPath(f.path))
  if (!documents.length) return { kind: 'missing', target }

  // 1. A target containing `/` is a path from the workspace root. There is nothing to search.
  if (wanted.includes('/')) {
    const exact = documents.find((f) => key(f.path) === wanted)
    return exact ? { kind: 'resolved', path: exact.path } : { kind: 'missing', target }
  }

  // 2. A written extension is a deliberate reference to a named file. It may still be in a
  //    folder, so it is matched by filename anywhere rather than from the root -- `journal.md`
  //    has to find `notes/Journal.md`. Several files can share a filename; the shallowest wins
  //    rather than reporting ambiguity, because writing the extension *is* the disambiguation.
  if (/\.[a-z0-9]+$/.test(target.trim().toLowerCase())) {
    // Compare against the raw target, not `wanted` — this step deliberately keeps the
    // extension, which is the whole signal.
    const filename = target.trim().toLowerCase()
    const named = documents
      .filter((f) => (f.path.split('/').pop() ?? '').toLowerCase() === filename)
      .sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path))
    return named.length
      ? { kind: 'resolved', path: named[0]!.path }
      : { kind: 'missing', target }
  }

  // 2. Relative to the linking document, so a sibling wins over a coincidence elsewhere.
  if (fromPath) {
    const dir = fromPath.slice(0, fromPath.lastIndexOf('/'))
    const near = dir ? `${dir}/${wanted}` : wanted
    const sibling = documents.filter((f) => key(f.path) === near)
    if (sibling.length === 1) return { kind: 'resolved', path: sibling[0]!.path }
    if (sibling.length > 1) {
      return { kind: 'ambiguous', candidates: sibling.map((f) => f.path).sort() }
    }
  }

  // 3. Any file whose name matches, anywhere.
  const byName = documents.filter((f) => key(f.path.split('/').pop() ?? '') === wanted)
  if (byName.length === 1) return { kind: 'resolved', path: byName[0]!.path }
  if (byName.length > 1) {
    // Shallowest first: `Ideas.md` beats `archive/2025/Ideas.md`, which is the right guess
    // far more often than not.
    return {
      kind: 'ambiguous',
      candidates: byName.map((f) => f.path).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b)),
    }
  }

  return { kind: 'missing', target }
}

function depth(path: string): number {
  return path.split('/').length
}

/* ──────────────────────────────────────────────────────────────
 * Links out and backlinks
 * ──────────────────────────────────────────────────────────────*/

/** Every `[[...]]` in a document, in the order they appear. */
export function findWikiLinks(source: string): WikiLink[] {
  const out: WikiLink[] = []
  for (const m of source.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const link = parseWikiLinkBody(m[1]!)
    if (link) out.push(link)
  }
  return out
}

/**
 * Wiki links outside code.
 *
 * `findWikiLinks` on raw source would happily match a `[[...]]` inside a fenced block, which
 * is documentation about wiki links — the single most likely false positive in a document that
 * documents its own syntax. Fences and inline code are stripped first.
 */
export function findWikiLinksOutsideCode(source: string): WikiLink[] {
  return findWikiLinks(stripCode(source))
}

/** Blanks out fenced blocks and inline code, preserving offsets and line structure. */
function stripCode(source: string): string {
  let out = source.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, (m) => m.replace(/[^\n]/g, ' '))
  out = out.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))
  return out
}

export interface Backlink {
  /** The document that contains the link. */
  from: string
  /** The link text, for display. */
  target: string
  /** One-based line the link appears on, for context. */
  line: number
}

/**
 * Documents linking to `path`.
 *
 * Built from the whole vault at once rather than by searching per document, because the caller
 * needs the answer every time the active document changes and re-reading the vault per
 * keystroke is how that becomes a lag.
 */
export function buildBacklinks(
  files: readonly VaultFile[],
  read: (path: string) => string | null,
  target: string,
): Backlink[] {
  const wanted = key(target)
  const out: Backlink[] = []

  for (const file of files) {
    if (key(file.path) === wanted) continue // a note does not backlink to itself
    if (!isDocumentPath(file.path)) continue

    const text = read(file.path)
    if (text === null) continue

    const stripped = stripCode(text)
    const lines = stripped.split('\n')

    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i]!.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
        const link = parseWikiLinkBody(m[1]!)
        if (!link) continue

        const resolution = resolveWikiLink(link.target, files, file.path)
        if (resolution.kind !== 'resolved' || key(resolution.path) !== wanted) continue

        out.push({ from: file.path, target: link.display, line: i + 1 })
      }
    }
  }

  return out.sort((a, b) => a.from.localeCompare(b.from) || a.line - b.line)
}

/** Strips the `.md` off a path for display, keeping folders so the source is unambiguous. */
export function displayPath(path: string): string {
  return stripExtension(path)
}