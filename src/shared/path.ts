/**
 * Path helpers.
 *
 * One implementation, because this code grew three of them and they did not agree.
 *
 * The difference that matters: splitting a path on separators and rejoining the pieces drops
 * the leading slash, so `/notes/a.md` comes back as `notes` — an absolute path silently
 * becomes relative. One copy of `dirname` here did exactly that and made every path derived
 * from it look relative, which in turn meant a directory-expansion pass could expand
 * nothing. `dirname` below slices the normalised string instead, so the root survives.
 *
 * These are string operations only. Nothing here touches a filesystem, which is what lets
 * `src/core` (which must stay free of platform imports) and the renderer share them.
 */

/**
 * Forward slashes, no duplicate separators, no trailing separator.
 *
 * Duplicate separators are collapsed rather than left alone, because `joinPath` and `dirname`
 * both compare paths segment-wise and `/a//b` would not match `/a/b`.
 *
 * `''` for the filesystem root, which is lossy — callers that care must test for it.
 */
export function normalise(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '')
}

function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean)
}

/** Last segment. A leading dot is part of the name, not an extension. */
export function basename(path: string): string {
  return segments(path).pop() ?? path
}

/**
 * Parent directory, preserving the root.
 *
 * `/file.md` yields `/`, not the empty string — callers use that to tell "at the top" from
 * "has no parent at all".
 */
export function dirname(path: string): string {
  const n = normalise(path)
  if (!n) return ''
  const idx = n.lastIndexOf('/')
  if (idx === -1) return ''
  if (idx === 0) return '/'
  // A drive root is `C:/`. Slicing to the separator alone would yield `C:`, which is a
  // drive-relative path on Windows and means something else entirely.
  if (n.slice(0, idx).endsWith(':')) return n.slice(0, idx + 1)
  return n.slice(0, idx)
}

/** Join without doubling separators. Handles the root, which `normalise` flattens to ''. */
export function joinPath(dir: string, name: string): string {
  if (!dir) return name
  const n = normalise(dir)
  if (!n) return `/${name}`
  return `${n}/${name}`
}

/**
 * Segments of `target` relative to `root`, or null when `target` is not inside `root`.
 *
 * Null rather than a best guess: a path outside the root has no relative form worth
 * showing, and inventing one produces links that resolve somewhere the user did not choose.
 */
export function relativeSegments(root: string, target: string): string[] | null {
  const r = segments(normalise(root))
  const t = segments(normalise(target))
  if (r.length > t.length) return null
  for (let i = 0; i < r.length; i++) {
    if (r[i] !== t[i]) return null
  }
  return t.slice(r.length)
}

/**
 * A relative path from one directory to another file, or null when they share no root.
 *
 * Used for pasted images, where the link has to resolve from wherever the document lives.
 * Null is the honest answer when the two paths share nothing — the caller falls back to the
 * bare filename, which is better than a chain of `..` that climbs out of the vault.
 */
export function relativePath(fromDir: string, to: string): string | null {
  if (!fromDir) return null
  const a = segments(fromDir)
  const b = segments(to)
  if (!b.length) return null

  let common = 0
  while (common < a.length && common < b.length - 1 && a[common] === b[common]) common++
  if (common === 0) return null

  return [...Array(a.length - common).fill('..'), ...b.slice(common)].join('/')
}

/** Directory portion of a path that may use either separator. */
export function dirnameOf(path: string): string {
  return dirname(path)
}

/** Final segment of a path that may use either separator. */
export function basenameOf(path: string): string {
  return basename(path)
}