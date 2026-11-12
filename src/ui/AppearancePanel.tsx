import { useRef, useState } from 'react'
import type { Settings } from '@core/settings'
import { resolveAppearance, resolveBase, THEMES } from '@core/theme'
import { DEFAULT_LOOK, FONTS, PRESETS, THEME_ELEMENTS, baseOf, normaliseLook, parseAppearance, resetElements, type Look } from '@core/look'

export function AppearancePanel({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const look = settings.look
  const base = baseOf(look, resolveBase(settings.theme))
  const vars = resolveAppearance(settings.themeId, base, settings.accentColor, look)
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const set = (patch: Partial<Look>) => onChange({ look: normaliseLook({ ...look, ...patch }) })
  const color = (key: keyof Look, label: string, cssVar: string) => (
    <div className="appearance-color" key={key}>
      <label><input type="color" aria-label={label} value={String(look[key] ?? vars[cssVar] ?? '#808080')} onChange={e => set({ [key]: e.target.value })} /><span>{label}</span></label>
      <button type="button" title={`Reset ${label}`} aria-label={`Reset ${label}`} disabled={look[key] == null} onClick={() => set({ [key]: null })}>Auto</button>
    </div>
  )
  const range = (key: 'scale' | 'spacing' | 'cardSpacing' | 'editorSize' | 'editorWidth', label: string, min: number, max: number, step: number, unit: string) => (
    <label className="appearance-range" key={key}>
      <span>{label}</span><output>{key === 'scale' ? Math.round(look[key] * 100) : look[key]}{unit}</output>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={look[key]} onChange={e => set({ [key]: Number(e.target.value) })} />
    </label>
  )
  return <div className="valence-appearance">
    <p className="valence-hint">Quantos-style cards, with your own colors, type and spacing. Changes save automatically.</p>
    <label className="appearance-select"><span>Starting point</span><select aria-label="Appearance preset" value="" onChange={e => {
      const preset = PRESETS.find(p => p.key === e.target.value)
      if (preset) onChange({ themeId: 'house', theme: preset.base ?? settings.theme, accentColor: (preset.base === 'light' ? '#1a66c4' : '#78b6ff'), look: normaliseLook({ ...DEFAULT_LOOK, ...preset.look }) })
    }}><option value="" disabled>Choose a preset…</option>{PRESETS.map(p => <option value={p.key} key={p.key}>{p.label}</option>)}</select></label>
    <label className="appearance-select"><span>Color mode</span><select aria-label="Color mode" value={settings.theme} onChange={e => onChange({ theme: e.target.value as Settings['theme'] })}><option value="system">Follow system</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    {look.bg && <p className="valence-hint">Your background color determines the palette mode. Set Background to Auto to follow the color mode.</p>}
    <label className="appearance-select"><span>Base palette</span><select aria-label="Base palette" value={THEMES.some(t => t.id === settings.themeId) ? settings.themeId : 'house'} onChange={e => onChange({ themeId: e.target.value })}>{THEMES.map(t => <option value={t.id} key={t.id}>{t.name === 'House' ? 'Quantos' : t.name}</option>)}</select></label>
    <div className="appearance-colors">
      {color('bg', 'Background', '--bg')}{color('text', 'Primary text', '--text')}{color('secondaryText', 'Secondary text', '--text-muted')}{color('accent', 'Accent', '--accent')}
    </div>
    <details className="appearance-details"><summary>Interface colors</summary>
      {(['surfaces','interactive','borders','feedback'] as const).map(category => <fieldset key={category}><legend>{category === 'surfaces' ? 'Surfaces' : category === 'interactive' ? 'Interaction' : category === 'borders' ? 'Borders' : 'Feedback'}</legend><div className="appearance-colors">{THEME_ELEMENTS.filter(e => e.category === category).map(e => color(e.key, e.label, e.cssVar))}</div></fieldset>)}
      <button className="valence-btn" onClick={() => onChange({ look: resetElements(look) })}>Reset element colors</button>
    </details>
    <details className="appearance-details" open><summary>Text & spacing</summary>
      {([['fontUi','Interface font'],['fontHeading','Heading font'],['fontEditor','Editor font'],['fontMono','Code font']] as const).map(([key,label]) => <label className="appearance-select" key={key}><span>{label}</span><select aria-label={label} value={look[key] ?? ''} onChange={e => set({ [key]: e.target.value || null })}><option value="">Default</option>{look[key] && !FONTS.some(f => f.name === look[key]) && <option value={look[key]!}>{look[key]}</option>}{FONTS.map(f => <option key={f.name}>{f.name}</option>)}</select></label>)}
      {range('scale','Interface size',.9,1.25,.05,'%')}
      {range('spacing','Window padding',4,16,1,'px')}
      {range('cardSpacing','Card spacing',0,24,1,'px')}
      {range('editorSize','Editor text size',14,24,1,'px')}
      {range('editorWidth','Reading width',55,90,1,'ch')}
    </details>
    <div className="appearance-actions">
      <button className="valence-btn" onClick={() => { onChange({ theme: 'system', themeId: 'house', accentColor: '#78b6ff', look: { ...DEFAULT_LOOK } }); setMessage('Appearance reset.') }}>Reset appearance</button>
      <button className="valence-btn" onClick={() => fileRef.current?.click()}>Import theme</button>
      <button className="valence-btn" onClick={() => {
        const data = { format: 'valence-appearance', version: 1, theme: settings.theme, themeId: settings.themeId, accentColor: settings.accentColor, look }
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Valence-theme.json'; anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setMessage('Theme exported.')
      }}>Export theme</button>
      <input hidden type="file" accept=".json,application/json" aria-label="Import appearance file" ref={fileRef} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''
        if (!file) return
        try {
          if (file.size > 100_000) throw new Error('Theme files must be smaller than 100 KB.')
          const imported = parseAppearance(await file.text())
          onChange({ theme: imported.theme, themeId: imported.themeId, accentColor: imported.accentColor, look: imported.look })
          setMessage('Theme imported.')
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import the theme.') }
      }} />
    </div>
    {message && <p className="valence-hint" role="status">{message}</p>}
  </div>
}
