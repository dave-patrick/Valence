import { useEffect, useRef, useState } from 'react'
import type { DocumentState, Session } from '@core/session'
import { isDirty, tabLabel } from '@core/session'
import type { TabBarPosition } from '@core/settings'
import { DEFAULT_THEME_STATE, getTheme, resolveCSSVars, normaliseHex, THEMES, type Theme } from '@core/theme'

interface TabBarProps {
  session: Session
  position: Exclude<TabBarPosition, 'hidden'>
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

/**
 * The tab bar.
 *
 * Two things this gets right that are easy to get wrong:
 *
 * - **Overflow scrolls horizontally** rather than collapsing tabs or wrapping. Wrapping a tab
 *   bar changes the height of the area the editor occupies, which shifts the document as you
 *   open files — the exact jitter people notice and cannot name.
 * - **Close is a real button with a label**, not a bare glyph. The dirty dot replaces the
 *   glyph while the tab is unsaved, and `title` always says what clicking does.
 */
export function TabBar({ session, position, onSelect, onClose }: TabBarProps) {
  const stripRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Keep the active tab in view when it changes, so switching from the keyboard or a
  // restored session does not leave the tab off-screen. `scrollIntoView` is absent in some
  // embedded webviews, so call it defensively.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [session.activeId])

  if (!session.documents.length) return null

  return (
    <div
      className="valence-tabs"
      role="tablist"
      aria-label="Open documents"
      aria-orientation="horizontal"
      data-position={position}
    >
      <div className="valence-tabs__strip" ref={stripRef}>
        {session.documents.map((doc) => {
          const selected = doc.id === session.activeId
          const dirty = isDirty(doc)
          return (
            <div
              key={doc.id}
              className="valence-tab"
              data-selected={selected}
              data-dirty={dirty}
            >
              <button
                ref={selected ? activeRef : undefined}
                role="tab"
                aria-selected={selected}
                className="valence-tab__label"
                onClick={() => onSelect(doc.id)}
                title={doc.path ?? 'Unsaved document'}
              >
                <span className="valence-tab__title">{tabLabel(doc, session.documents)}</span>
                <span className="valence-tab__dot" aria-hidden={!dirty} />
              </button>
              <button
                className="valence-tab__close"
                aria-label={dirty ? `Close ${doc.title}, unsaved changes` : `Close ${doc.title}`}
                title={dirty ? 'Close (unsaved changes will be lost)' : 'Close'}
                onClick={() => onClose(doc.id)}
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The settings dialog, which is where "configurable locations" actually lives. */
interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  settings: React.ComponentProps<typeof SettingsFields>['settings']
  onChange: (patch: Partial<React.ComponentProps<typeof SettingsFields>['settings']>) => void
  onOpenFolder: () => void
  onCheckUpdates: () => void
  onSetDefault: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
  onOpenReleasesPage: () => void
  appVersion: string
  updateState: UpdateState | null
}

/** What the settings panel needs to know about any available update. */
export interface UpdateState {
  available: boolean
  version: string | null
  /** False on macOS, where the build is a disk image that cannot be self-applied. */
  selfUpdate?: boolean
}

export function SettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  onOpenFolder,
  onCheckUpdates,
  onSetDefault,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenReleasesPage,
  appVersion,
  updateState,
}: SettingsPanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="valence-scrim" onClick={onClose} />
      <div
        className="valence-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        ref={ref}
        tabIndex={-1}
      >
        <header className="valence-settings__head">
          <h2>Settings</h2>
          <button className="valence-settings__close" onClick={onClose} aria-label="Close settings">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </header>

        <SettingsFields
          settings={settings}
          onChange={onChange}
          onOpenFolder={onOpenFolder}
          onCheckUpdates={onCheckUpdates}
          onSetDefault={onSetDefault}
          onDownloadUpdate={onDownloadUpdate}
          onInstallUpdate={onInstallUpdate}
          onOpenReleasesPage={onOpenReleasesPage}
          appVersion={appVersion}
          updateState={updateState}
        />
      </div>
    </>
  )
}

function SettingsFields({
  settings,
  onChange,
  onOpenFolder,
  onCheckUpdates,
  onSetDefault,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenReleasesPage,
  appVersion,
  updateState,
}: {
  settings: import('@core/settings').Settings
  onChange: (patch: Partial<import('@core/settings').Settings>) => void
  onOpenFolder: () => void
  onCheckUpdates: () => void
  onSetDefault: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
  onOpenReleasesPage: () => void
  appVersion: string
  updateState: UpdateState | null
}) {
  return (
    <div className="valence-settings__body">
      <section>
        <h3>Appearance</h3>
        <Field label="Tab bar" hint="Where open documents are listed">
          <Segmented
            value={settings.tabBar}
            onChange={(v) => onChange({ tabBar: v })}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'bottom', label: 'Bottom' },
              { value: 'hidden', label: 'Hidden' },
            ]}
          />
        </Field>
        <Field label="Theme" hint="Follows the system by default">
          <Segmented
            value={settings.theme}
            onChange={(v) => onChange({ theme: v })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Field>

        <ThemeGallery
          themeId={settings.themeId}
          accentColor={settings.accentColor}
          onChange={(patch) => onChange(patch)}
        />
      </section>

      <section>
        <h3>Updates</h3>
        <Field label="Current version" hint="Valence checks GitHub for new releases on launch">
          <span className="valence-version">{settings ? '1.0.0' : '—'}</span>
        </Field>
        <Field label="Check for updates" hint="Manual check against GitHub releases">
          <button
            className="valence-btn"
            onClick={() => {
              void (async () => {
                const r = await (window as unknown as { valence: { update: { check: () => Promise<{ available: boolean; version: string | null; reason?: string }> } } }).valence.update.check()
                if (r.available) {
                  alert(`Update ${r.version} is available. Downloading…`)
                  await (window as unknown as { valence: { update: { download: () => Promise<void> } } }).valence.update.download()
                } else if (r.reason === 'dev') {
                  alert('Updates are disabled in development builds.')
                } else {
                  alert('You are on the latest version.')
                }
              })()
            }}
          >
            Check now
          </button>
        </Field>
      </section>

      <section>
        <h3>File associations</h3>
        <Field label="Default app" hint="Register Valence as the default editor for text and Markdown files">
          <button
            className="valence-btn"
            onClick={() => {
              void (async () => {
                const r = await (window as unknown as { valence: { assoc: { setDefault: () => Promise<{ ok: boolean; reason?: string }> } } }).valence.assoc.setDefault()
                if (r.ok) {
                  alert('File associations set. You may need to restart Explorer or log out and back in for changes to appear.')
                } else {
                  alert(`Could not set file associations: ${r.reason ?? 'unknown error'}`)
                }
              })()
            }}
          >
            Set as default
          </button>
        </Field>
        <div className="valence-field">
          <span className="valence-field__label">Extensions</span>
          <ul className="valence-recents">
            <li>.md, .markdown, .mdown, .mkd, .txt</li>
          </ul>
        </div>
      </section>

      <section>
        <h3>Writing</h3>
        <Toggle
          label="Typewriter mode"
          hint="Pin the current line to the middle of the view"
          on={settings.typewriter}
          onChange={(v) => onChange({ typewriter: v })}
        />
        <Toggle
          label="Focus mode"
          hint="Dim every paragraph but the one you are writing"
          on={settings.focusMode}
          onChange={(v) => onChange({ focusMode: v })}
        />
        <Toggle
          label="Line numbers"
          hint="Show the line number beside each paragraph"
          on={settings.showLineNumbers}
          onChange={(v) => onChange({ showLineNumbers: v })}
        />
        <Field label="Daily word goal" hint="Shown as progress in the inspector">
          <input
            type="number"
            min={0}
            step={50}
            className="valence-input"
            value={settings.dailyWordGoal}
            onChange={(e) => onChange({ dailyWordGoal: Number(e.target.value) || 0 })}
          />
        </Field>
      </section>

      <section>
        <h3>Locations</h3>
        <Field label="Default save folder" hint="Where Save As opens">
          <div className="valence-input-row">
            <input
              className="valence-input"
              readOnly
              placeholder="Ask each time"
              value={settings.defaultSaveDir}
              onChange={(e) => onChange({ defaultSaveDir: e.target.value })}
            />
            <button className="valence-btn" onClick={onOpenFolder}>
              Browse
            </button>
            {settings.defaultSaveDir && (
              <button
                className="valence-btn"
                onClick={() => onChange({ defaultSaveDir: '' })}
                title="Clear"
              >
                Clear
              </button>
            )}
          </div>
        </Field>

        <div className="valence-field">
          <span className="valence-field__label">Recent folders</span>
          {settings.recentFolders.length ? (
            <ul className="valence-recents">
              {settings.recentFolders.map((f) => (
                <li key={f}>
                  <span title={f}>{f}</span>
                  <button
                    className="valence-btn valence-btn--quiet"
                    aria-label={`Remove ${f} from recent folders`}
                    onClick={() =>
                      onChange({ recentFolders: settings.recentFolders.filter((x) => x !== f) })
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="valence-hint">None yet. Open a folder to add one.</p>
          )}
        </div>

        <Toggle
          label="Restore session on launch"
          hint="Reopen the files you had open. Never restores unsaved changes."
          on={settings.restoreSession}
          onChange={(v) => onChange({ restoreSession: v })}
        />

     <section>
       <h3>Custom CSS</h3>
       <Field label="Custom stylesheet" hint="Appended to every surface. House variables (var(--...)) are available.">
         <textarea
           className="valence-input valence-input--area"
           value={settings.customCss}
           onChange={(e) => onChange({ customCss: e.target.value })}
           rows={6}
           spellCheck={false}
         />
       </Field>
     </section>

     <section>
       <h3>Updates</h3>
       <Field label="Current version" hint="Valence checks GitHub releases for new versions on launch">
         <span className="valence-version">{appVersion}</span>
       </Field>
       <Field label="Check for updates" hint="Manual check against GitHub releases">
         <button className="valence-btn" onClick={onCheckUpdates}>
           Check now
         </button>
       </Field>
       {updateState && updateState.available && (
         <Field
           label={`Update ${updateState.version} available`}
           hint={
             updateState.selfUpdate === false
               ? 'This build is a disk image, so it cannot be installed from here.'
               : 'Download it, then restart Valence to install.'
           }
         >
           <div className="valence-input-row">
             {updateState.selfUpdate === false ? (
               <button className="valence-btn" onClick={onOpenReleasesPage}>
                 Open releases
               </button>
             ) : (
               <>
                 <button className="valence-btn" onClick={onDownloadUpdate}>
                   Download
                 </button>
                 <button className="valence-btn" onClick={onInstallUpdate}>
                   Install and restart
                 </button>
               </>
             )}
           </div>
         </Field>
       )}
     </section>

     <section>
       <h3>File associations</h3>
       <Field label="Set as default" hint="Register Valence as the default editor for .md, .markdown, .mdown, .mkd, .txt">
         <button className="valence-btn" onClick={onSetDefault}>
           Set as default
         </button>
       </Field>
       <div className="valence-field">
         <span className="valence-field__label">Extensions</span>
         <p className="valence-hint">.md, .markdown, .mdown, .mkd, .txt</p>
       </div>
     </section>
      </section>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="valence-field">
      <span className="valence-field__label">{label}</span>
      {children}
      <span className="valence-hint">{hint}</span>
    </div>
  )
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="valence-toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="valence-toggle__label">{label}</span>
        <span className="valence-hint">{hint}</span>
      </span>
    </label>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="valence-segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          className="valence-segmented__btn"
          aria-pressed={value === o.value}
          style={value === o.value ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ThemeGallery({
  themeId,
  accentColor,
  onChange,
}: {
  themeId: string
  accentColor: string
  onChange: (patch: Partial<{ themeId: string; accentColor: string }>) => void
}) {
  return (
    <>
      <Field label="Theme" hint="Colour palette">
        <div className="valence-theme-gallery">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange({ themeId: t.id })}
              className={`valence-theme-card${themeId === t.id ? ' valence-theme-card--selected' : ''}`}
              aria-label={t.name}
              title={t.name}
            >
              <div className="valence-theme-swatch valence-theme-swatch--dark" style={{ background: t.dark.bg }} />
              <div className="valence-theme-swatch valence-theme-swatch--light" style={{ background: t.light.bg }} />
              <span className="valence-theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Accent colour" hint="Accent used for highlights and focus rings">
        <div className="valence-accent-picker">
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ accentColor: c })}
              className={`valence-accent-swatch${accentColor === c ? ' valence-accent-swatch--selected' : ''}`}
              style={{ backgroundColor: c }}
              aria-label={c}
              title={c}
            />
          ))}
          <div className="valence-accent-custom">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => onChange({ accentColor: normaliseHex(e.target.value) })}
              aria-label="Custom accent colour"
            />
          </div>
        </div>
      </Field>
    </>
  )
}

const ACCENT_SWATCHES: string[] = [
  '#78b6ff',
  '#1f6fd1',
  '#ff7b7b',
  '#f4b35e',
  '#7fd8a6',
  '#c43a3a',
  '#9a6a00',
  '#1f8a55',
]

export type { DocumentState }