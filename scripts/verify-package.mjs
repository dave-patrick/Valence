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

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

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

const child = spawn(exe, [`--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})

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
await sleep(6000)

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res.result?.exceptionDetails) return { __error: res.result.exceptionDetails.text }
  return res.result?.result?.value
}

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
      fs: ['read', 'write', 'writeBinary', 'stat', 'exists', 'listDir', 'watch', 'unwatch', 'reveal'],
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