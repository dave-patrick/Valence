import { describe, expect, it } from 'vitest'
import { DEFAULT_LOOK, PRESETS, contrast, normaliseLook, parseAppearance } from '../src/core/look'
import { resolveAppearance } from '../src/core/theme'
import { normaliseSettings } from '../src/core/settings'

describe('saved appearance', () => {
  it('migrates old settings and clamps malformed numeric values', () => {
    expect(normaliseSettings({}).look).toEqual(DEFAULT_LOOK)
    const look = normaliseLook({ spacing: -10, scale: 40, editorSize: Infinity, editorWidth: 200, bg: '#abc', text: 'url(x)', fontUi: 'bad;{}', unknown: 'x' })
    expect(look).toMatchObject({ spacing: 4, scale: 1.25, editorSize: 19, editorWidth: 90, bg: '#aabbcc', text: null, fontUi: null })
    expect(look).not.toHaveProperty('unknown')
  })
  it('round-trips a theme without importing unrelated settings', () => {
    const saved = { format: 'valence-appearance', version: 1, theme: 'dark', themeId: 'slate', accentColor: '#abc', look: { ...DEFAULT_LOOK, editorSize: 22, spacing: 14 }, workspaceRoot: '/no' }
    const imported = parseAppearance(JSON.stringify(saved))
    expect(imported.look.spacing).toBe(14)
    expect(imported.accentColor).toBe('#aabbcc')
    expect(imported).not.toHaveProperty('workspaceRoot')
    for (const input of ['{}', 'null', '[]', '{"format":"valence-appearance","version":2}']) expect(() => parseAppearance(input)).toThrow()
  })
  it('uses the actual legacy palette when deriving text and accent colors', () => {
    for (const theme of ['house', 'slate', 'forest']) {
      for (const base of ['light', 'dark'] as const) {
        const vars = resolveAppearance(theme, base, '#78b6ff', normaliseLook({ text: '#f0e0d0', accent: '#888888' }))
        expect(contrast(vars['--text-muted'], vars['--bg'])).toBeGreaterThanOrEqual(4.8)
        expect(contrast(vars['--accent'], vars['--bg'])).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
  it('presets resolve and reset restores all surface defaults', () => {
    for (const preset of PRESETS) {
      const vars = resolveAppearance('house', preset.base ?? 'dark', '#78b6ff', normaliseLook(preset.look))
      expect(vars['--editor-bg']).toMatch(/^#[0-9a-f]{6}$/i)
    }
    const customized = resolveAppearance('house', 'dark', '#78b6ff', normaliseLook({ editorBg: '#102030', fontUi: 'Georgia', spacing: 16 }))
    const reset = resolveAppearance('house', 'dark', '#78b6ff', DEFAULT_LOOK)
    expect(customized['--editor-bg']).toBe('#102030')
    expect(reset['--editor-bg']).toBe('#202123')
    expect(reset['--workspace-gap']).toBe('10px')
    expect(reset).not.toHaveProperty('--font-body')
  })
})
