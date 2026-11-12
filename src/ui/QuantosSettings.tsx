import { useEffect, useRef, useState } from 'react'
import { getPlatform } from '@platform'
import type { Settings } from '@core/settings'

export function QuantosSettings({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const platform = getPlatform()
  const [workspaces, setWorkspaces] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  useEffect(() => {
    const id = ++request.current
    setWorkspaces([])
    if (!settings.quantosVault || !platform.quantos) return
    setBusy(true)
    void platform.quantos.inspect(settings.quantosVault).then(list => {
      if (request.current !== id) return
      setWorkspaces(list); setMessage('')
    }).catch(error => { if (request.current === id) setMessage(String(error instanceof Error ? error.message : error)) })
      .finally(() => { if (request.current === id) setBusy(false) })
    return () => { request.current++ }
  }, [settings.quantosVault, platform])
  return <section id="quantos-settings" aria-label="Quantos vault settings">
    <h3>Quantos vault</h3>
    <p className="valence-hint">Move the current document into an existing local Quantos workspace. The document stays open at its new location. Existing files get a recoverable backup; linked images and attachments are not moved.</p>
    {!platform.quantos && <p className="valence-hint">Available in the desktop app.</p>}
    <label className="valence-field"><span className="valence-field__label">Vault folder</span>
      <div className="valence-input-row">
        <input className="valence-input" aria-label="Quantos vault folder" readOnly value={settings.quantosVault} placeholder="Choose your Quantos vault" />
        <button className="valence-btn" disabled={!platform.quantos || busy} onClick={async () => {
          const selected = await platform.dialog.openFolder()
          const root = selected.folder ?? selected.paths[0]
          if (!root || !platform.quantos) return
          const id = ++request.current; setBusy(true)
          try {
            const list = await platform.quantos.inspect(root)
            if (request.current !== id) return
            if (!list.length) throw new Error('This folder has no existing Quantos workspaces with a nodes folder.')
            onChange({ quantosVault: root, quantosWorkspace: list.includes(settings.quantosWorkspace) ? settings.quantosWorkspace : list.includes('default') ? 'default' : list[0] })
            setWorkspaces(list); setMessage('')
          } catch (error) { if (request.current === id) setMessage(String(error instanceof Error ? error.message : error)) }
          finally { if (request.current === id) setBusy(false) }
        }}>Browse vault…</button>
        {settings.quantosVault && <button className="valence-btn" onClick={() => { onChange({ quantosVault: '', quantosWorkspace: 'default' }); setMessage(''); setBusy(false) }}>Clear</button>}
      </div>
    </label>
    <label className="appearance-select"><span>Workspace</span><select aria-label="Quantos workspace" value={settings.quantosWorkspace} disabled={busy || !workspaces.length} onChange={e => onChange({ quantosWorkspace: e.target.value })}>
      {!workspaces.includes(settings.quantosWorkspace) && <option value={settings.quantosWorkspace}>{settings.quantosWorkspace}</option>}
      {workspaces.map(name => <option key={name}>{name}</option>)}
    </select></label>
    <label className="valence-toggle"><input type="checkbox" checked={settings.quantosShowInHeader} onChange={e => onChange({ quantosShowInHeader: e.target.checked })} /><span>Show “Move to Quantos” in the header</span></label>
    {busy && <p className="valence-hint" role="status">Checking vault…</p>}
    {message && <p className="valence-hint" role="status">{message}</p>}
  </section>
}
