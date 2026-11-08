/**
 * What to do when the app's window is asked to go somewhere else.
 *
 * A link clicked in the Read or Split view, or one that asks for a new window, would otherwise
 * replace Valence with that page -- and whatever page loads in the main window gets the preload
 * bridge, which can read and write any file. So the window only ever shows the app itself:
 * web and mail links open in the default browser, links to documents Valence can open are
 * opened as tabs, and everything else (other schemes, other local files) is refused.
 *
 * Pure: no Electron, no Node, so it is tested directly.
 */
import { isDocument } from './fileTypes'

export type NavigationDecision =
  | { kind: 'stay' }
  | { kind: 'external'; url: string }
  | { kind: 'open'; path: string }
  | { kind: 'block' }

const EXTERNAL = new Set(['http:', 'https:', 'mailto:'])

function withoutHash(url: string): string {
  const i = url.indexOf('#')
  return i < 0 ? url : url.slice(0, i)
}

/** `file:///C:/notes/a%20b.md` → `C:/notes/a b.md`; `file:///home/x.md` → `/home/x.md`. */
export function filePathFromUrl(url: URL): string | null {
  if (url.protocol !== 'file:') return null
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (url.host) return `//${url.host}${path}` // a UNC share: file://server/share/a.md
  return /^\/[a-zA-Z]:\//.test(path) ? path.slice(1) : path
}

/**
 * @param target  where the window was asked to go
 * @param current the page it is showing now (the app)
 */
export function decideNavigation(target: string, current: string): NavigationDecision {
  // Moving within the app's own page (an in-page anchor) is fine.
  if (current && withoutHash(target) === withoutHash(current)) return { kind: 'stay' }
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return { kind: 'block' }
  }
  if (EXTERNAL.has(url.protocol)) return { kind: 'external', url: url.href }
  const path = filePathFromUrl(url)
  if (path && isDocument(path)) return { kind: 'open', path }
  return { kind: 'block' }
}

export type LinkAction =
  | { kind: 'anchor' }
  | { kind: 'external'; url: string }
  | { kind: 'open'; path: string }
  | { kind: 'ignore' }

/**
 * What a click on a link in the rendered document should do. Relative links point beside the
 * document (`other.md`, `../notes/a.md`), not beside the app, so they are resolved here against
 * the document's own folder.
 */
export function resolveDocumentLink(href: string, docPath: string | null): LinkAction {
  const raw = href.trim()
  if (!raw || raw.startsWith('#')) return { kind: 'anchor' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[a-zA-Z]:[\\/]/.test(raw)) {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return { kind: 'ignore' }
    }
    if (EXTERNAL.has(url.protocol)) return { kind: 'external', url: url.href }
    const path = filePathFromUrl(url)
    return path && isDocument(path) ? { kind: 'open', path } : { kind: 'ignore' }
  }
  // A path: drop any #heading or ?query, decode %20 and friends.
  let path = raw.replace(/[?#].*$/, '')
  try {
    path = decodeURIComponent(path)
  } catch {
    return { kind: 'ignore' }
  }
  path = path.replace(/\\/g, '/')
  const absolute = path.startsWith('/') || /^[a-zA-Z]:\//.test(path)
  if (!absolute) {
    if (!docPath) return { kind: 'ignore' }
    const base = docPath.replace(/\\/g, '/')
    path = base.slice(0, base.lastIndexOf('/') + 1) + path
  }
  // Collapse ./ and ../ segments.
  const drive = /^[a-zA-Z]:/.exec(path)?.[0] ?? ''
  const parts: string[] = []
  for (const seg of path.slice(drive.length).split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  const resolved = `${drive}/${parts.join('/')}`
  return isDocument(resolved) ? { kind: 'open', path: resolved } : { kind: 'ignore' }
}
