/**
 * Theme definitions.
 *
 * Pure, no DOM, no Electron. A theme is a pair of palettes (light, dark); the accent
 * colour is user-controlled and layered on top. Everything here is serialisable and
 * round-trip safe, so themes live in settings and survive a restart.
 *
 * Colour values mirror the house scheme (#0c131d bg, #78b6ff accent) shared with Quantos
 * and the other Atomic 22 apps. New themes are additive: drop a new entry in THEMES and it
 * appears in the gallery automatically.
 */

export interface ThemeColors {
  bg: string
  bgRaised: string
  bgPanel: string
  bgHover: string
  bgActive: string
  bgSelect: string
  bgInput: string
  line: string
  lineStrong: string
  text: string
  textSoft: string
  textMuted: string
  textFaint: string
  accent: string
  accentStrong: string
  accentInk: string
  accentWash: string
  danger: string
  dangerWash: string
  warn: string
  warnWash: string
  ok: string
  okWash: string
  shadow: string
}

export interface Theme {
  /** Stable id, stored in settings. Never change once shipped. */
  id: string
  /** Human name shown in the gallery. */
  name: string
  dark: ThemeColors
  light: ThemeColors
}

export type BaseMode = 'system' | 'light' | 'dark'

export interface ThemeState {
  theme: string
  base: BaseMode
  accent: string
}

export const DEFAULT_THEME_STATE: ThemeState = {
  theme: 'house',
  base: 'system',
  accent: '#78b6ff',
}

/** House colours, dark and light. Shared with Quantos. */
const HOUSE_DARK: ThemeColors = {
  bg: '#0c131d',
  bgRaised: '#101824',
  bgPanel: '#111d2b',
  bgHover: '#17263b',
  bgActive: '#1c2e42',
  bgSelect: '#254a70',
  bgInput: '#0e1621',
  line: '#2c394a',
  lineStrong: '#334258',
  text: '#edf2fa',
  textSoft: '#c5d0df',
  textMuted: '#9fb0c6',
  textFaint: '#6f819a',
  accent: '#78b6ff',
  accentStrong: '#a3ccff',
  accentInk: '#091321',
  accentWash: '#142338',
  danger: '#ff8a8a',
  dangerWash: '#3a1c22',
  warn: '#f4c46a',
  warnWash: '#33291a',
  ok: '#7fd8a6',
  okWash: '#16302a',
  shadow: '0 12px 36px rgb(0 0 0 / 0.45)',
}

const HOUSE_LIGHT: ThemeColors = {
  bg: '#f5f7fb',
  bgRaised: '#ffffff',
  bgPanel: '#eef2f8',
  bgHover: '#e4eaf3',
  bgActive: '#d9e4f2',
  bgSelect: '#bcd6f5',
  bgInput: '#ffffff',
  line: '#d6dde8',
  lineStrong: '#c3cddc',
  text: '#0c131d',
  textSoft: '#26364a',
  textMuted: '#4f6078',
  textFaint: '#7d8ba0',
  accent: '#1f6fd1',
  accentStrong: '#1559ad',
  accentInk: '#ffffff',
  accentWash: '#e3eefc',
  danger: '#c43a3a',
  dangerWash: '#fbe7e7',
  warn: '#9a6a00',
  warnWash: '#fbf1dc',
  ok: '#1f8a55',
  okWash: '#e2f5eb',
  shadow: '0 12px 32px rgb(12 19 29 / 0.16)',
}

export const THEMES: Theme[] = [
  { id: 'house', name: 'House', dark: HOUSE_DARK, light: HOUSE_LIGHT },
]

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id)
}

export function resolveBase(preference: BaseMode): 'light' | 'dark' {
  if (preference !== 'system') return preference
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return 'light'
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/**
 * Build CSS custom property declarations from a theme id, base mode, and accent colour.
 *
 * Returns a record of `--name: value` pairs suitable for applying to :root. The user's
 * accent overrides the theme's accent; derived accent colours (strong, ink, wash) are
 * recomputed from it so a custom accent always reads coherently.
 */
export function resolveCSSVars(
  themeId: string,
  base: 'light' | 'dark',
  accent: string,
): Record<string, string> {
  const theme = getTheme(themeId)
  if (!theme) return {}

  const palette = base === 'light' ? theme.light : theme.dark

  // Derive accent-strong / accent-ink / accent-wash from the user's accent using HSL
  // manipulation so any accent colour reads coherently against its own text/wash.
  const derived = deriveAccent(accent)

  return {
    '--bg': palette.bg,
    '--bg-raised': palette.bgRaised,
    '--bg-panel': palette.bgPanel,
    '--bg-hover': palette.bgHover,
    '--bg-active': palette.bgActive,
    '--bg-select': palette.bgSelect,
    '--bg-input': palette.bgInput,
    '--line': palette.line,
    '--line-strong': palette.lineStrong,
    '--line-focus': accent,
    '--text': palette.text,
    '--text-soft': palette.textSoft,
    '--text-muted': palette.textMuted,
    '--text-faint': palette.textFaint,
    '--accent': accent,
    '--accent-strong': derived.strong,
    '--accent-ink': derived.ink,
    '--accent-wash': derived.wash,
    '--danger': palette.danger,
    '--danger-wash': palette.dangerWash,
    '--warn': palette.warn,
    '--warn-wash': palette.warnWash,
    '--ok': palette.ok,
    '--ok-wash': palette.okWash,
    '--shadow': palette.shadow,
    '--focus-ring': `0 0 0 2px var(--bg), 0 0 0 4px ${accent}`,
  }
}

/**
 * Parse a hex colour, then derive strong / ink / wash variants.
 *
 * strong:  lighten/darken toward black/white for contrast
 * ink:     black or white depending on luminance
 * wash:    accent at low alpha over the nearest surface
 */
function deriveAccent(hex: string): { strong: string; ink: string; wash: string } {
  const rgb = hexToRgb(hex)
  if (!rgb) return { strong: hex, ink: '#000000', wash: hex }

  const lum = luminance(rgb)
  const strong = adjustLightness(rgb, lum > 0.5 ? -0.25 : 0.25)
  const ink = lum > 0.5 ? '#000000' : '#ffffff'
  // Wash: accent at ~12% alpha over near-black or near-white surface
  const washSurface = lum > 0.5 ? '#f5f7fb' : '#0c131d'
  const wash = blendAlpha(hex, washSurface, 0.12)

  return { strong, ink, wash }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const sRGB = (c: number) => {
    const f = c / 255
    return f <= 0.03928 ? f / 12.92 : Math.pow((f + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b)
}

function adjustLightness(
  { r, g, b }: { r: number; g: number; b: number },
  delta: number,
): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  return rgbToHex(clamp(Math.round(r + delta * 255)), clamp(Math.round(g + delta * 255)), clamp(Math.round(b + delta * 255)))
}

function blendAlpha(fgHex: string, bgHex: string, alpha: number): string {
  const fg = hexToRgb(fgHex)
  const bg = hexToRgb(bgHex)
  if (!fg || !bg) return fgHex
  const r = Math.round(fg.r * alpha + bg.r * (1 - alpha))
  const g = Math.round(fg.g * alpha + bg.g * (1 - alpha))
  const b = Math.round(fg.b * alpha + bg.b * (1 - alpha))
  return rgbToHex(r, g, b)
}

/** Validate a hex colour string. */
export function isValidHex(value: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
}

/** Normalise to 6-digit hex with # prefix. */
export function normaliseHex(value: string): string {
  const m = value.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase()
  const m2 = value.match(/^#?([0-9a-f]{6})$/i)
  if (m2) return `#${m2[1]}`.toLowerCase()
  return DEFAULT_THEME_STATE.accent
}
