import { describe, expect, it } from 'vitest'
import {
  THEMES,
  getTheme,
  resolveBase,
  resolveCSSVars,
  isValidHex,
  normaliseHex,
  DEFAULT_THEME_STATE,
} from '../src/core/theme'

describe('theme gallery', () => {
  it('has at least the house theme', () => {
    expect(THEMES.length).toBeGreaterThan(0)
    expect(THEMES.find((t) => t.id === 'house')).toBeDefined()
  })

  it('every theme has both light and dark palettes', () => {
    for (const t of THEMES) {
      expect(t.dark.bg, `${t.id} dark bg`).toBeTruthy()
      expect(t.light.bg, `${t.id} light bg`).toBeTruthy()
      expect(t.dark.text, `${t.id} dark text`).toBeTruthy()
      expect(t.light.text, `${t.id} light text`).toBeTruthy()
    }
  })

  it('getTheme returns undefined for unknown id', () => {
    expect(getTheme('nonexistent')).toBeUndefined()
  })

  it('getTheme finds house', () => {
    expect(getTheme('house')?.name).toBe('House')
  })

  it('resolveBase returns preference for non-system', () => {
    expect(resolveBase('light')).toBe('light')
    expect(resolveBase('dark')).toBe('dark')
  })

  it('resolveBase defaults to light when matchMedia unavailable', () => {
    // In node test env, window is undefined
    expect(resolveBase('system')).toBe('light')
  })

  it('resolveCSSVars returns empty for unknown theme', () => {
    expect(resolveCSSVars('nonexistent', 'dark', '#78b6ff')).toEqual({})
  })

  it('resolveCSSVars produces all expected variables', () => {
    const vars = resolveCSSVars('house', 'dark', '#78b6ff')
    expect(vars['--bg']).toBe('#0c131d')
    expect(vars['--text']).toBe('#edf2fa')
    expect(vars['--accent']).toBe('#78b6ff')
    expect(vars['--line-focus']).toBe('#78b6ff')
  })

  it('resolveCSSVars uses light palette for light base', () => {
    const vars = resolveCSSVars('house', 'light', '#1f6fd1')
    expect(vars['--bg']).toBe('#f5f7fb')
    expect(vars['--accent']).toBe('#1f6fd1')
  })

  it('accent override changes --accent and derived values', () => {
    const vars = resolveCSSVars('house', 'dark', '#ff0000')
    expect(vars['--accent']).toBe('#ff0000')
    // Derived strong/ink/wash should differ from the theme's defaults
    expect(vars['--accent-ink']).toBe('#ffffff') // dark accent → white ink
  })

  it('isValidHex accepts valid hex', () => {
    expect(isValidHex('#78b6ff')).toBe(true)
    expect(isValidHex('78b6ff')).toBe(true)
    expect(isValidHex('#fff')).toBe(true)
    expect(isValidHex('abc')).toBe(true)
  })

  it('isValidHex rejects invalid hex', () => {
    expect(isValidHex('')).toBe(false)
    expect(isValidHex('zzzzzz')).toBe(false)
    expect(isValidHex('#gggggg')).toBe(false)
    expect(isValidHex('#12345')).toBe(false)
  })

  it('normaliseHex pads short hex', () => {
    expect(normaliseHex('#abc')).toBe('#aabbcc')
    expect(normaliseHex('abc')).toBe('#aabbcc')
  })

  it('normaliseHex passes through 6-digit hex', () => {
    expect(normaliseHex('#78b6ff')).toBe('#78b6ff')
  })

  it('normaliseHex falls back for invalid input', () => {
    expect(normaliseHex('not-a-color')).toBe('#78b6ff')
  })

  it('DEFAULT_THEME_STATE is valid', () => {
    expect(getTheme(DEFAULT_THEME_STATE.theme)).toBeDefined()
    expect(isValidHex(DEFAULT_THEME_STATE.accent)).toBe(true)
  })
})