/**
 * Application settings.
 *
 * Kept pure and serialisable so it can be validated, defaulted, and round-tripped without a
 * platform or a DOM. The store that persists it is a thin layer on top; the rules about what
 * a valid value is live here, where they can be tested.
 */

export type TabBarPosition = 'top' | 'bottom' | 'hidden'
export type ThemePreference = 'system' | 'light' | 'dark'

import { normaliseHex } from './theme'

export interface Settings {
  /** Where the tab bar sits. `hidden` is a real option — some people want one document
   *  at a time and no evidence of the machinery. */
  tabBar: TabBarPosition
  /** Base mode: system / light / dark. 'system' follows the OS preference. */
  theme: ThemePreference
  /** Theme id (from src/core/theme.ts THEMES). 'house' is the house colour scheme. */
  themeId: string
  /** User's accent colour, hex with #. Overrides the theme's accent. */
  accentColor: string

  /** Editor behaviour */
  typewriter: boolean
  focusMode: boolean
  showLineNumbers: boolean
  /** Shows the right-hand inspector. Costs the reader width, so it is a preference. */
  showInspector: boolean
  /** Word count goal shown as progress in the inspector. 0 disables it. */
  dailyWordGoal: number

  /** Locations. Empty means "ask each time" rather than "nowhere". */

  /** The workspace root, if one is open. An empty string means "none chosen yet"; the file tree
   *  and wiki index fall back to the active document's folder in that case, so a single-file
   *  session keeps behaving exactly as it did before this feature existed. */
  workspaceRoot: string
  /** Workspaces opened recently, most recent first. */
  recentWorkspaces: string[]
  /** Directory the Save As dialog opens in. */
  defaultSaveDir: string
  /** Folders offered in the file panel, most recent first. */
  recentFolders: string[]
  /** Free-form CSS appended to every surface. Supports the house variables. */
  customCss: string
  /** Restore the previous session's tabs on launch. */
  restoreSession: boolean

  /** Files that were open last time, restored when `restoreSession` is on. */
  lastSession: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  tabBar: 'top',
  theme: 'system',
  themeId: 'house',
  accentColor: '#78b6ff',
  typewriter: false,
  focusMode: false,
  showLineNumbers: false,
  showInspector: true,
  workspaceRoot: '',
  recentWorkspaces: [],
  customCss: '',
  dailyWordGoal: 0,
  defaultSaveDir: '',
  recentFolders: [],
  restoreSession: true,
  lastSession: [],
}

/** Cap the recents list. A location list nobody can scan is a location list nobody uses. */
export const MAX_RECENT_FOLDERS = 8
export const MAX_SESSION_DOCUMENTS = 24

/**
 * Coerces arbitrary parsed JSON into valid settings.
 *
 * Settings come off disk (or out of `localStorage`), which means they may be missing keys,
 * have the wrong type, or predate a rename. A malformed settings file must never stop the
 * app from opening a document — that is the one thing an editor must always be able to do.
 */
export function normaliseSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_SETTINGS }
  const raw = input as Record<string, unknown>

  return {
    tabBar: oneOf(raw['tabBar'], ['top', 'bottom', 'hidden'], DEFAULT_SETTINGS.tabBar),
    theme: oneOf(raw['theme'], ['system', 'light', 'dark'], DEFAULT_SETTINGS.theme),
    themeId: str(raw['themeId']) || DEFAULT_SETTINGS.themeId,
    accentColor: normaliseHex(str(raw['accentColor'])),

    typewriter: bool(raw['typewriter'], DEFAULT_SETTINGS.typewriter),
    focusMode: bool(raw['focusMode'], DEFAULT_SETTINGS.focusMode),
    showLineNumbers: bool(raw['showLineNumbers'], DEFAULT_SETTINGS.showLineNumbers),
    showInspector: bool(raw['showInspector'], DEFAULT_SETTINGS.showInspector),
    dailyWordGoal: nonNegativeInt(raw['dailyWordGoal'], DEFAULT_SETTINGS.dailyWordGoal),

    defaultSaveDir: str(raw['defaultSaveDir']),
    recentFolders: stringList(raw['recentFolders']).slice(0, MAX_RECENT_FOLDERS),
  workspaceRoot: str(raw['workspaceRoot']),
  recentWorkspaces: stringList(raw['recentWorkspaces']).slice(0, MAX_RECENT_FOLDERS),
  customCss: str(raw['customCss']),
  restoreSession: bool(raw['restoreSession'], DEFAULT_SETTINGS.restoreSession),
    lastSession: stringList(raw['lastSession']).slice(0, MAX_SESSION_DOCUMENTS),
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.round(value))
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0)
}

/** Records a folder as most-recently-used, de-duplicating and capping the list. */
export function pushRecentFolder(list: readonly string[], folder: string): string[] {
  if (!folder) return [...list]
  return [folder, ...list.filter((f) => f !== folder)].slice(0, MAX_RECENT_FOLDERS)
}

/** True when `child` is inside `parent` (or equal), using path separators from either OS. */
export function isWithin(parent: string, child: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const a = norm(parent)
  const b = norm(child)
  if (!a || !b) return false
  return b === a || b.startsWith(`${a}/`)
}