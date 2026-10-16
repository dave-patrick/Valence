/**
 * Settings and session persistence.
 *
 * Backed by the platform abstraction, so the same code runs against Electron's fs and the
 * browser's `localStorage`. Every read is defensive: a corrupt or absent file yields the
 * defaults rather than preventing the app from opening a document.
 */

import { getPlatform } from '@platform'
import { DEFAULT_SETTINGS, normaliseSettings, pushRecentFolder, type Settings } from '@core/settings'
import { sessionPaths, type Session } from '@core/session'

const SETTINGS_KEY = 'valence.settings'

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await getPlatform().fs.read(SETTINGS_KEY)
    return normaliseSettings(JSON.parse(raw))
  } catch {
    // Absent, unreadable, or corrupt. Defaults are always a working configuration.
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await getPlatform().fs.write(SETTINGS_KEY, JSON.stringify(settings, null, 2))
  } catch {
    // A failed settings write must never interrupt writing. The in-memory value still
    // applies for this session; the next launch simply starts from defaults.
  }
}

/**
 * Persists the open documents so the next launch can reopen them.
 *
 * Deliberately saves nothing when the session contains a dirty document: restoring the
 * *saved* text of a document the author has since changed would silently discard their work
 * on the next launch, which is the worst thing an editor can do.
 */
export async function saveSession(settings: Settings, session: Session): Promise<Settings> {
  const dirty = session.documents.some((d) => d.source !== d.saved)
  if (!settings.restoreSession || dirty) return settings

  const next: Settings = { ...settings, lastSession: sessionPaths(session) }
  await saveSettings(next)
  return next
}

export async function rememberFolder(settings: Settings, folder: string): Promise<Settings> {
  if (!folder) return settings
  const next: Settings = { ...settings, recentFolders: pushRecentFolder(settings.recentFolders, folder) }
  await saveSettings(next)
  return next
}

/**
 * Resolves `system` against the OS preference.
 *
 * Defensive about `matchMedia`: it is absent in some embedded webviews and in test
 * environments, and a settings read must never be the thing that prevents the editor from
 * opening. Falling back to light is a cosmetic difference; crashing is not acceptable.
 */
export function resolveTheme(preference: Settings['theme']): 'light' | 'dark' {
  if (preference !== 'system') return preference
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}