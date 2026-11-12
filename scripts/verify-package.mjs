/**
 * Packaged-build runtime probe.
 *
 * Answers the question a build cannot: does the *built* app actually boot, and does the
 * renderer really run?
 *
 * Three bugs shipped to users through this pipeline before this script existed, and every
 * one of them was invisible to `vitest`, `tsc`, and a green CI run, because none of those
 * ever start the application:
 *
 *   1. `electron` bundled into main, so launch ran the npm install shim forever.
 *   2. The preload path pointed at `index.mjs`, which the build never emits -- so the
 *      context bridge never loaded and every disk feature was dead while the editor looked
 *      fine, because the platform silently fell back to an in-memory implementation.
 *   3. `Downloading Electron binary` was never in a log anyone read, and neither was
 *      "Unable to load preload script": Electron logs both and carries on.
 *
 * Building is not running. This runs it.
 *
 *   node scripts/verify-package.mjs <path-to-Valence.exe>
 *
 * Exits non-zero if the app does not come up correctly, so it can gate a release.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = process.argv[2]
if (!exe) {
  console.error('usage: node scripts/verify-package.mjs <path-to-Valence.exe>')
  process.exit(2)
}

/** Ask the OS for a free port. Hardcoding one collides with other Electron apps. */
const PORT = await new Promise((resolve) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address()
    s.close(() => resolve(port))
  })
})

/**
 * A private user-data directory for the probe.
 *
 * Without this the probe shares Chromium's profile with any Valence already running on
 * the machine, which produces two failures that look like build problems and are not:
 *
 *   - "Lock file can not be created" -- the app's single-instance lock belongs to the
 *     other instance, so this one quits before it opens a window.
 *   - "Unable to move the cache: Access is denied" -- the disk cache is in use.
 *
 * A release gate has to report on the build, not on whatever else happens to be running.
 */
const PROFILE = join(tmpdir(), `valence-verify-${process.pid}`)

const child = spawn(
  exe,
  [`--remote-debugging-port=${PORT}`, '--no-sandbox', `--user-data-dir=${PROFILE}`],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

let stderr = ''
child.stderr.on('data', (d) => (stderr += d))
child.stdout.on('data', (d) => (stderr += d))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function cleanup(code) {
  // Kill the whole tree, not just the parent. On Windows `child.kill()` leaves the renderer,
  // GPU and utility processes running, and those keep app.asar mapped -- so the next run
  // fails to replace the staged folder with EPERM. This leaked a process tree per run
  // until the destination could not be written to at all.
  if (process.platform === 'win32') {
    await new Promise((res) => {
      const k = spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' })
      k.on('exit', () => res())
      k.on('error', () => res())
      setTimeout(res, 4000)
    })
    // `taskkill /T` can miss Electron utility processes after the browser process exits.
    // Reap only Valence children carrying this probe's unique scratch profile; never touch
    // the user's ordinary Valence process or another concurrent probe.
    const profile = PROFILE.replace(/'/g, "''")
    const reap = `$probeProfile = '${profile}'; Get-CimInstance Win32_Process -Filter "Name = 'Valence.exe'" | Where-Object { $_.CommandLine -like "*$probeProfile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
    await new Promise((res) => {
      const k = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', reap], { stdio: 'ignore', windowsHide: true })
      k.on('exit', () => res())
      k.on('error', () => res())
      setTimeout(res, 5000)
    })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }
  }
  await sleep(500)
  // The probe's profile is scratch. Leaving it behind would fill the temp directory
  // with a full Chromium profile per run.
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {})
  process.exit(code)
}

let page = null
for (let i = 0; i < 40; i++) {
  await sleep(500)
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    const list = await res.json()
    // Refuse to attach to a stray window. A false positive here would report "all good"
    // for an app that never launched, which is worse than no probe at all.
    page = list.find(
      (t) =>
        t.type === 'page' &&
        t.webSocketDebuggerUrl &&
        (t.url.startsWith('file:') || t.title === 'Valence'),
    )
    if (page) break
  } catch {
    /* not listening yet */
  }
}

if (!page) {
  console.error('FAIL  no page target -- the app did not open a window')
  console.error('stderr:', stderr.slice(0, 2000) || '(empty)')
  await cleanup(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})

function send(method, params) {
  const myId = ++id
  return new Promise((resolve) => {
    pending.set(myId, resolve)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })
}

await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))

// Collect what the renderer complains about across a cold boot. Packaged-only failures --
// a CSP refusal, a chunk that will not resolve over file://, a WASM rejection -- are exactly
// the kind that leave the window looking fine.
const noise = []
const exceptions = []
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    noise.push(
      `[${msg.params.type}] ` +
        msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
    )
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(
      msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text,
    )
  }
})

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Page.reload', { ignoreCache: true })

// Let React mount, the editor build, and the read pane hydrate.
for (let attempt = 0; attempt < 60; attempt++) {
  const mounted = await send('Runtime.evaluate', {
    expression: '!!document.querySelector(".ProseMirror, textarea[data-view=source]")', returnByValue: true,
  })
  if (mounted.result?.result?.value === true) break
  await sleep(1000)
}
await sleep(500)

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res.result?.exceptionDetails) return { __error: res.result.exceptionDetails.text }
  return res.result?.result?.value
}

// A locked or non-interactive Windows session has no clipboard for any program; the clipboard
// check is skipped there rather than failing the build for the machine's state.
const clipboardUsable = process.platform !== 'win32' ||
  spawnSync('powershell', ['-NoProfile', '-Command', "Set-Clipboard -Value 'valence-probe'; if ((Get-Clipboard -Raw) -ne 'valence-probe') { exit 1 }"], { stdio: 'ignore' }).status === 0

const checks = {
  'window opens': `${'ok'} ${page.title}`,
  'react mounted': await evaluate(`(() => { const r = document.getElementById('root'); return !r || r.children.length > 0 })()`),
  'editor present': await evaluate(`!!document.querySelector('.ProseMirror')`),
  'tailwind applied': await evaluate(`(() => { const els = [...document.querySelectorAll('[class]')].slice(0, 400); return els.some(e => typeof e.className === 'string' && /\\b(flex|grid|px-|py-|text-|bg-|rounded)\\b/.test(e.className)) })()`),
  'preload bridge loaded': await evaluate(`!!window.valence`),
  'bridge round-trips a file': await evaluate(`(async () => {
    if (!window.valence) return 'no bridge'
    const name = '__verify-package-probe.txt'
    try {
      await window.valence.fs.write(name, 'valence-ok')
      const back = await window.valence.fs.read(name)
      if (back !== 'valence-ok') return 'content mismatch'
      // Truncate rather than delete: the bridge has no delete verb, and an empty probe
      // file in the user data directory beats a growing one.
      await window.valence.fs.write(name, '')
      return true
    } catch (e) { return 'threw: ' + e.message }
  })()`),
  'bridge exposes the full surface': await evaluate(`(() => {
    if (!window.valence) return 'no bridge'
    // The renderer is bundled from the same tree as the preload script, so a stale preload
    // hands back undefined instead of throwing. The window close guard went missing exactly
    // this way: the renderer never called anything, so nothing failed, and closing the window
    // discarded unsaved work. Naming the API turns a drift into a visible failure.
    const required = {
      fs: ['read', 'write', 'writeBinary', 'stat', 'exists', 'listDir', 'watch', 'unwatch', 'onChanged', 'reveal'],
      win: ['setTitle', 'setDirty', 'registerCloseGuard', 'onCloseRequested', 'answerClose', 'pendingFiles', 'onOpenFiles'],
      dialog: ['openFile', 'openFolder', 'save', 'confirm', 'unsaved'],
      menu: ['build', 'onCommand'],
      clip: ['writeText', 'writeHtml', 'writeImage', 'read'],
      exportAs: ['formats', 'toPdf', 'pandoc', 'hasPandoc'],
    }
    const missing = []
    for (const [group, methods] of Object.entries(required)) {
      if (!window.valence[group]) { missing.push(group); continue }
      for (const m of methods) {
        if (typeof window.valence[group][m] !== 'function') missing.push(group + '.' + m)
      }
    }
    return missing.length ? 'missing: ' + missing.join(', ') : true
  })()`),

  // The house fonts ship with the app; they used to come from Google Fonts at every start.
  'bundled fonts load': await evaluate(`(async () => {
    const faces = await document.fonts.load('16px "Source Sans 3"')
    return faces.length > 0 || 'Source Sans 3 did not load'
  })()`),
  // Copy as Markdown / HTML / plain text used to send the text back to the renderer on a channel
  // nothing listened to, so it never reached the clipboard.
  'clipboard round-trips text': !clipboardUsable ? 'ok (skipped: the system clipboard is unavailable in this session)' : await evaluate(`(async () => {
    if (!window.valence) return 'no bridge'
    try {
      await window.valence.clip.writeText('valence-clipboard-check')
      const back = await window.valence.clip.read()
      return back.text === 'valence-clipboard-check' || 'read back: ' + JSON.stringify(back.text)
    } catch (e) { return 'threw: ' + e.message }
  })()`),
  // A link must never replace the app: whatever loads in this window gets the file bridge.
  // One link at a time: a later click would cancel an earlier navigation still in flight.
  'links do not navigate the window away': await (async () => {
    // Files Valence doesn't open (a .ini or .txt would rightly open as a tab instead).
    for (const href of ['file:///etc/hosts', 'file:///C:/Windows/System32/notepad.exe', 'https://example.com/']) {
      const before = await evaluate('location.href')
      await evaluate(`(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(href)}; document.body.append(a); a.click(); a.remove(); return true })()`)
      await sleep(1500)
      const after = await evaluate('location.href')
      if (after !== before) return `clicking ${href} took the window to ${typeof after === 'string' ? after : JSON.stringify(after)}`
    }
    return true
  })(),

  'local chunks resolve': await evaluate(`(async () => {
    const urls = [...document.querySelectorAll('script[src], link[href]')]
      .map(e => e.getAttribute('src') || e.getAttribute('href'))
      .filter(Boolean)
      // Only assets this build ships. The Google Fonts stylesheet is a network request and is
      // expected to fail offline; counting it as a chunk turns a working offline build into a
      // false failure.
      .filter(u => !/^https?:/i.test(u))
    if (!urls.length) return 'no local assets found'
    const bad = []
    for (const u of urls) {
      const ok = await fetch(u).then(r => r.ok).catch(() => false)
      if (!ok) bad.push(u)
    }
    return bad.length ? 'failed: ' + bad.join(', ') : true
  })()`),
}

checks['source editor fills available width'] = await evaluate(`(async () => {
  const button = (label) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label)
  button('Source')?.click()
  await new Promise(r => setTimeout(r, 150))
  const text = document.querySelector('textarea[data-view="source"]')
  if (!text) return 'source editor missing'
  const bounds = text.getBoundingClientRect()
  const parent = text.parentElement.getBoundingClientRect()
  const result = Math.abs(parent.right - bounds.right) <= 2 && bounds.width > parent.width / 2
    ? true : 'unused editor width: ' + Math.round(parent.right - bounds.right) + 'px'
  button('Hybrid')?.click()
  return result
})()`)

// Exercise real Chromium pointer events, not synthetic component events.
async function dragDivider(label, delta) {
  const selector = '[role="separator"][aria-label="' + label + '"]'
  const before = await evaluate('(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, value: Number(el.getAttribute("aria-valuenow")) } })()')
  if (!before) return { error: 'missing ' + label }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x, y: before.y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: before.x, y: before.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(100)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x + delta / 2, y: before.y, button: 'left', buttons: 1 })
  await sleep(50)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x + delta, y: before.y, button: 'left', buttons: 1 })
  await sleep(100)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: before.x + delta, y: before.y, button: 'left', buttons: 0, clickCount: 1 })
  const after = await evaluate('Number(document.querySelector(' + JSON.stringify(selector) + ').getAttribute("aria-valuenow"))')
  return { before: before.value, after }
}
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 840, deviceScaleFactor: 1, mobile: false })
await sleep(200)
const sidebarDrag = await dragDivider('Resize navigation panel', 24)
checks['navigation divider follows drag without jumping'] = sidebarDrag.after === sidebarDrag.before + 24
const inspectorDrag = await dragDivider('Resize document statistics', -20)
checks['statistics divider resizes in the opposite direction'] = inspectorDrag.after === inspectorDrag.before + 20
for (const position of ['Left', 'Right']) {
  await evaluate('document.querySelector("[aria-label=Settings]").click()')
  await sleep(100)
  await evaluate('([...document.querySelectorAll(".valence-settings button")].find(b => b.textContent.trim() === ' + JSON.stringify(position) + ')).click()')
  await sleep(100)
  await evaluate('document.querySelector(' + JSON.stringify('[aria-label="Close settings"]') + ').click()')
  await sleep(100)
  const delta = position === 'Left' ? 20 : -20
  const tabsDrag = await dragDivider('Resize document tabs', delta)
  checks[position.toLowerCase() + ' tab divider follows drag'] = tabsDrag.after === tabsDrag.before + 20
}
// Return tabs to top so Split has enough width for both panes.
await evaluate('document.querySelector("[aria-label=Settings]").click()')
await sleep(100)
await evaluate('[...document.querySelectorAll(".valence-settings button")].find(b => b.textContent.trim() === "Top").click()')
  await evaluate('document.querySelector(' + JSON.stringify('[aria-label="Close settings"]') + ').click()')
await sleep(100)
await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Split").click()')
await sleep(200)
const splitDrag = await dragDivider('Resize editor and preview', 40)
checks['split divider follows drag'] = splitDrag.after > splitDrag.before
const splitBounds = await dragDivider('Resize editor and preview', 2000)
checks['split divider respects maximum'] = splitBounds.after === 80
checks['split preview stays in its track'] = await evaluate('(() => { const el = document.querySelector(".split-pane"); const r = el.getBoundingClientRect(); return el.children.length === 3 && Math.abs(el.lastElementChild.getBoundingClientRect().right - r.right) < 2 })()')
await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 840, deviceScaleFactor: 1, mobile: false })
await sleep(100)
checks['statistics divider hides with inspector'] = await evaluate('getComputedStyle(document.querySelector(".valence-inspector-pane")).display === "none"')

console.log(`\n  target: ${page.url}\n`)
for (const [name, value] of Object.entries(checks)) {
  console.log(`  ${value === true || String(value).startsWith('ok') ? 'PASS' : 'FAIL'}  ${name}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
}

const failureNotes = []
if (stderr.includes('Downloading Electron binary')) failureNotes.push('the electron npm shim ran at launch')
if (stderr.includes('Unable to load preload script')) failureNotes.push('the preload script did not load')

if (noise.length) console.log(`\n  console errors/warnings:\n    ${noise.join('\n    ')}`)
if (exceptions.length) console.log(`\n  uncaught exceptions:\n    ${exceptions.join('\n    ')}`)
if (stderr.trim()) console.log(`\n  stderr:\n    ${stderr.trim().slice(0, 1200)}`)

const failed = Object.entries(checks).filter(
  ([, v]) => !(v === true || String(v).startsWith('ok')),
)

if (failed.length || failureNotes.length) {
  console.error('\n  FAIL ' + [...failureNotes, ...failed.map(([k]) => `check: ${k}`)].join('; '))
  await cleanup(1)
}

console.log('\n  OK  packaged build is healthy\n')
ws.close()
await cleanup(0)
