import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, writeFile, stat, readdir, mkdir } from 'node:fs/promises'
import { watch, type FSWatcher, statSync as statSyncFile } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { DOCUMENT_EXTENSIONS } from '../shared/fileTypes'
import { decideNavigation, type NavigationDecision } from '../shared/navigation'
import { preloadPath, resolveDataPath as resolvePath } from './paths'
import { applyUpdate, canSelfUpdate, checkForUpdate, downloadUpdate, openReleasesPage } from './updater'
import {
  ASSOCIATED_EXTENSIONS,
  isDefaultFor,
  openDefaultAppsSettings,
  registerAssociations,
} from './associations'

const isDev = !app.isPackaged

/** Files passed on the command line ("Open with", drag onto the exe, etc.). */
let pendingOpenFiles: string[] = []

function collectArgvFiles(argv: string[]): string[] {
  return argv
    .filter((arg, i) => i > 0 && !arg.startsWith('-'))
    .filter((arg) => {
      try {
        return statSyncFile(arg).isFile()
      } catch {
        return false
      }
    })
}

// Single instance: "Open with" must reach the running app, not spawn a new one.
let gotTheLock = true
if (app.isPackaged) {
  gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
  }
}

let main: BrowserWindow | null = null
const watchers = new Map<string, FSWatcher>()

function createWindow(): void {
  main = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 420,
    minHeight: 480,
    show: false,
    backgroundColor: '#131519',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 15 },
    webPreferences: {
      preload: preloadPath(__dirname),
      // The preload is built as CommonJS (see electron.vite.config.ts), so it can run sandboxed.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })

  main.once('ready-to-show', () => main?.show())

  main.on('close', (e) => {
    if (closingNow || !closeGuardReady) return
    e.preventDefault()
    const id = nextCloseId++
    const answer = new Promise<boolean>((resolve) => pendingClose.set(id, resolve))
    main?.webContents.send('win:close-request', id)
    void answer.then((allow) => {
      if (!allow) return
      closingNow = true
      main?.close()
    })
  })

  main.on('closed', () => {
    main = null
    for (const w of watchers.values()) w.close()
    watchers.clear()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) void main.loadURL(devUrl)
  else void main.loadFile(`${__dirname}/../renderer/index.html`)
}

if (gotTheLock) {
  if (app.isPackaged) {
    app.on('second-instance', (_event, argv, _cwd) => {
      const files = collectArgvFiles(argv)
      if (files.length) {
        pendingOpenFiles = [...pendingOpenFiles, ...files]
        if (main) {
          main.focus()
          main.webContents.send('doc:open-files', files)
        }
      } else if (main) {
        main.focus()
      }
    })
  }

  app.whenReady().then(() => {
    createWindow()
    pendingOpenFiles = collectArgvFiles(process.argv)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

/* ── Updater (packaged only) ───────────────────────────────────
   Checks the GitHub releases feed for a newer build and tells the
   renderer about it. The download is the user's to start: a silent
   150MB fetch on every launch is not something to do unasked.

   This is hand-rolled rather than electron-updater because Valence
   ships a bare zip on Windows with no installer, and electron-updater's
   Windows path only works with an installer. See src/main/updater.ts. */
if (app.isPackaged) {
  // Check on startup, after a short delay so the window paints first.
  setTimeout(() => {
    void (async () => {
      try {
        const candidate = await checkForUpdate()
        if (!candidate) return
        if (main) {
          main.webContents.send('update:available', {
            version: candidate.version,
            selfUpdate: canSelfUpdate(),
          })
        }
      } catch {
        /* an unreachable GitHub is not worth interrupting the user over */
      }
    })()
  }, 5000)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** Carries out a navigation decision: see src/shared/navigation.ts for why. */
function actOn(decision: NavigationDecision): void {
  if (decision.kind === 'external') void shell.openExternal(decision.url)
  else if (decision.kind === 'open') {
    try {
      if (!statSyncFile(decision.path).isFile()) return
    } catch {
      return
    }
    if (main) {
      main.focus()
      main.webContents.send('doc:open-files', [decision.path])
    }
  }
}

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    actOn(decideNavigation(url, ''))
    return { action: 'deny' }
  })
  // A link followed inside a window (the Read view has plain <a href>) would otherwise replace
  // the app with that page, and that page would get the preload bridge.
  contents.on('will-navigate', (event, url) => {
    const decision = decideNavigation(url, contents.getURL())
    if (decision.kind === 'stay') return
    event.preventDefault()
    actOn(decision)
  })
  contents.on('will-redirect', (event, url) => {
    if (decideNavigation(url, contents.getURL()).kind !== 'stay') event.preventDefault()
  })
})

/* ── IPC ───────────────────────────────────────────────────────
   Every filesystem and shell operation lives here, in the main
   process. The renderer never has Node access.

   Paths arrive in two flavours. Absolute paths are real files the
   user chose and are used as given. Relative paths are the app's own
   scratch state -- settings, session -- and resolve against the
   per-user data directory.

   Resolving those against `process.cwd()` instead is what the first
   packaged build did: launching from anywhere scattered
   `valence.settings` into that folder, and launching from a read-only
   folder (Program Files, C:\) meant settings could not be saved. */

function resolveDataPath(path: string): string {
  return resolvePath(path, app.getPath('userData'))
}

ipcMain.handle('fs:read', async (_e, path: string) => readFile(resolveDataPath(path), 'utf8'))
async function ensureParent(path: string): Promise<void> {
  const dir = dirname(path)
  if (!dir) return
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    /* parent may already exist; nothing else to do */
  }
}

ipcMain.handle('fs:write', async (_e, path: string, contents: string) => {
  const target = resolveDataPath(path)
  await ensureParent(target)
  await writeFile(target, contents, 'utf8')
})
ipcMain.handle('fs:writeBinary', async (_e, path: string, data: ArrayBuffer) => {
  const target = resolveDataPath(path)
  await ensureParent(target)
  await writeFile(target, Buffer.from(new Uint8Array(data)))
})
ipcMain.handle('fs:stat', async (_e, path: string) => {
  const target = resolveDataPath(path)
  try {
    const s = await stat(target)
    return { path: target, size: s.size, mtimeMs: s.mtimeMs, isDirectory: s.isDirectory() }
  } catch {
    return null
  }
})
ipcMain.handle('fs:exists', async (_e, path: string) => {
  try {
    await stat(resolveDataPath(path))
    return true
  } catch {
    return false
  }
})
ipcMain.handle('fs:list', async (_e, path: string) => {
  const target = resolveDataPath(path)
  try {
    const entries = await readdir(target, { withFileTypes: true })
    return entries.map((d) => ({
      path: `${target}/${d.name}`,
      size: 0,
      mtimeMs: 0,
      isDirectory: d.isDirectory(),
    }))
  } catch {
    return []
  }
})

/** Folders never listed by the recursive walk; the same names the workspace scan and file tree drop. */
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', '.obsidian', '.trash', '.valence'])

ipcMain.handle('fs:listRecursive', async (_e, path: string) => {
  const target = resolveDataPath(path)
  const out: { path: string; size: number; mtimeMs: number; isDirectory: boolean }[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = `${dir}/${e.name}`
      // Never descend into these: the workspace and file tree drop them anyway, and walking
      // node_modules or .git first made opening a large folder take minutes.
      if (e.isDirectory() && SKIPPED_FOLDERS.has(e.name)) continue
      if (e.isDirectory()) {
        out.push({ path: full, size: 0, mtimeMs: 0, isDirectory: true })
        await walk(full)
      } else {
        try {
          const s = await stat(full)
          out.push({ path: full, size: s.size, mtimeMs: s.mtimeMs, isDirectory: false })
        } catch {
          out.push({ path: full, size: 0, mtimeMs: 0, isDirectory: false })
        }
      }
    }
  }
  await walk(target)
  return out
})
ipcMain.handle('fs:reveal', (_e, path: string) => shell.showItemInFolder(resolveDataPath(path)))

// Watches the file's folder rather than the file: editors and sync tools often save by writing a
// new file and renaming it over the old one, which a watch on the old file never sees. Changes are
// reported by the path the renderer asked for, a moment after they settle.
ipcMain.handle('fs:watch', (_e, path: string) => {
  if (watchers.has(path)) return
  const target = resolveDataPath(path)
  const name = basename(target)
  let timer: NodeJS.Timeout | null = null
  try {
    const w = watch(dirname(target), (_event, changed) => {
      if (changed && changed.toString() !== name) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => main?.webContents.send('file:changed', path), 150)
    })
    w.on('error', () => {
      w.close()
      watchers.delete(path)
    })
    watchers.set(path, w)
  } catch {
    /* an unwatchable folder (removed, no permission): changes just won't be noticed */
  }
})
ipcMain.handle('fs:unwatch', (_e, path: string) => {
  watchers.get(path)?.close()
  watchers.delete(path)
})

ipcMain.handle('win:title', (_e, title: string) => {
  if (main) main.setTitle(title)
})

ipcMain.handle('win:dirty', (_e, dirty: boolean) => {
  if (main) main.setDocumentEdited?.(dirty)
})

/**
 * Window close guard.
 *
 * The renderer decides whether the window may close; main only enforces it. This used to be
 * dead code in three separate ways at once: no renderer ever registered a guard, nothing ever
 * sent `win:closeGuard`, and the handler stored the IpcMainEvent in the slot meant for a
 * function. The result was that closing the window discarded unsaved work without asking.
 *
 * Closing is a request/response: main blocks the close, sends an id, and waits. `closingNow`
 * lets the second, permitted close through instead of asking again forever.
 */
let closeGuardReady = false
let closingNow = false
let nextCloseId = 1
const pendingClose = new Map<number, (allow: boolean) => void>()

ipcMain.on('win:closeGuard', () => {
  closeGuardReady = true
})

ipcMain.on('win:close-answer', (_e, id: number, allow: boolean) => {
  const resolve = pendingClose.get(id)
  if (resolve) {
    pendingClose.delete(id)
    resolve(allow)
  }
})

ipcMain.handle('doc:pending-files', () => {
  const files = pendingOpenFiles
  pendingOpenFiles = []
  return files
})

ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { available: false, version: null, reason: 'dev' }
  try {
    const candidate = await checkForUpdate()
    if (!candidate) {
      return { available: false, version: null, reason: 'up-to-date' }
    }
    return {
      available: true,
      version: candidate.version,
      notes: candidate.notes,
      size: candidate.size,
      // On macOS the build is a disk image, which cannot be applied from a running app.
      // The renderer uses this to send the user to the releases page instead of
      // promising something it cannot deliver.
      selfUpdate: canSelfUpdate(),
    }
  } catch (err) {
    return { available: false, version: null, reason: String(err) }
  }
})

/** The update the person downloaded; installing uses exactly this, not whatever is newest by then. */
let downloadedUpdate: Awaited<ReturnType<typeof checkForUpdate>> = null

ipcMain.handle('update:download', async () => {
  if (!app.isPackaged) return
  try {
    const candidate = await checkForUpdate()
    if (!candidate) {
      if (main) main.webContents.send('update:error', 'No update is available.')
      return
    }
    await downloadUpdate(candidate, (fraction) => {
      if (main) main.webContents.send('update:progress', fraction)
    })
    downloadedUpdate = candidate
    if (main) main.webContents.send('update:downloaded', candidate.version)
  } catch (err) {
    if (main) main.webContents.send('update:error', String(err))
  }
})

ipcMain.handle('update:install', async () => {
  if (!app.isPackaged) return
  try {
    const candidate = downloadedUpdate ?? (await checkForUpdate())
    if (!candidate) {
      if (main) main.webContents.send('update:error', 'No update is available.')
      return
    }
    const staged = await applyUpdate(candidate)
    if (!staged) {
      if (main) main.webContents.send('update:error', 'Could not stage the update.')
      return
    }
    // The apply script waits for this process to exit before it touches anything.
    // The close guard is bypassed: the user has already confirmed the update, and
    // the renderer is about to be replaced anyway.
    closingNow = true
    app.quit()
  } catch (err) {
    if (main) main.webContents.send('update:error', String(err))
  }
})

ipcMain.handle('update:releases-page', () => {
  openReleasesPage()
})

ipcMain.handle('dialog:openFile', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Text documents', extensions: DOCUMENT_EXTENSIONS },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  return { paths: r.canceled ? [] : r.filePaths }
})

ipcMain.handle('dialog:openFolder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return { paths: r.canceled ? [] : r.filePaths, folder: r.filePaths[0] }
})

ipcMain.handle('dialog:save', async (_e, suggested: string) => {
  const r = await dialog.showSaveDialog({
    defaultPath: suggested,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  return r.canceled ? null : (r.filePath ?? null)
})

ipcMain.handle('dialog:confirm', async (_e, message: string, detail: string, confirmLabel?: string) => {
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Cancel', confirmLabel || 'Discard changes'],
    defaultId: 0,
    cancelId: 0,
    message,
    detail,
  })
  return r.response === 1
})

ipcMain.handle('dialog:unsaved', async (_e, title: string) => {
  // Order matters on Windows: Electron maps the first button to the default action and the
  // last to Escape. Cancel is last so Escape always means "stay".
  const r = await dialog.showMessageBox({
    type: 'warning',
    title: 'Unsaved changes',
    message: `Save changes to ${title}?`,
    detail: "If you don't save, your changes will be lost.",
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })
  return (['save', 'discard', 'cancel'] as const)[r.response] ?? 'cancel'
})

ipcMain.on('menu:build', (_e, items: unknown) => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(items as never))
})


// The system clipboard. These used to send the content back to the renderer on a channel nothing
// listened to, so "Copy as Markdown / HTML / plain text" never reached the clipboard.
ipcMain.handle('clip:writeText', (_e, text: string) => clipboard.writeText(String(text)))
ipcMain.handle('clip:writeHtml', async (_e, html: string) => {
  // Plain text alongside, for apps that can't paste HTML.
  const text = String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  await clipboard.write([new ClipboardItem({ 'text/html': String(html), 'text/plain': text })])
})
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
ipcMain.handle('clip:writeImage', async (_e, data: ArrayBuffer, ext: string) => {
  const type = IMAGE_TYPES[String(ext).toLowerCase()] ?? 'image/png'
  await clipboard.write([new ClipboardItem({ [type]: new Blob([new Uint8Array(data)], { type }) })])
})
ipcMain.handle('clip:read', async () => {
  const text = await clipboard.readText().catch(() => '')
  let html = ''
  try {
    const item = (await clipboard.read()).find((i) => i.types.includes('text/html'))
    if (item) {
      const value = await item.getType('text/html')
      html = typeof value === 'string' ? value : value instanceof Blob ? await value.text() : ''
    }
  } catch {
    html = ''
  }
  return { text, html }
})

// File associations: register Valence as the handler for text/markdown files.
// Done at runtime via the registry because the zip distribution has no installer.
// Uses HKEY_CURRENT_USER so no admin rights are required. See src/main/associations.ts.
ipcMain.handle('assoc:isDefault', async (_e, ext: string) => isDefaultFor(ext))

ipcMain.handle('assoc:setDefault', async () => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'file associations are only supported on Windows' }
  }

  const failures = await registerAssociations(process.execPath)
  if (failures.length > 0) {
    return { ok: false, reason: failures[0] }
  }

  // Report what Windows will actually do. If the user has already chosen a different
  // handler for one of these types, the association is registered but Windows keeps
  // their choice, and saying "done" without saying so would be a lie.
  const notDefault = []
  for (const ext of ASSOCIATED_EXTENSIONS) {
    if (!(await isDefaultFor(ext))) notDefault.push(ext)
  }

  return {
    ok: true,
    notDefault,
    reason: notDefault.length
      ? `Valence is registered, but Windows is still using another app for ${notDefault.join(', ')}. Use "Change in Windows settings" to switch it over.`
      : undefined,
  }
})

ipcMain.handle('assoc:extensions', () => ASSOCIATED_EXTENSIONS)

ipcMain.handle('assoc:open-default-apps', () => {
  openDefaultAppsSettings()
})

ipcMain.handle('export:formats', () => [
  { id: 'html', label: 'Web Page', extension: 'html' },
  { id: 'pdf', label: 'PDF', extension: 'pdf' },
  { id: 'docx', label: 'Word', extension: 'docx', pandoc: true },
  { id: 'odt', label: 'OpenDocument', extension: 'odt', pandoc: true },
  { id: 'epub', label: 'EPUB', extension: 'epub', pandoc: true },
  { id: 'latex', label: 'LaTeX', extension: 'tex', pandoc: true },
])

/** PDF via the OS print pipeline — same CSS as the reader view, real pagination,
 *  real font embedding, and PDF bookmarks generated from the outline. */
ipcMain.handle('export:pdf', async (_e, html: string, chosen: string) => {
  if (!main) return
  // The exported HTML is the person's document, which may contain raw HTML: render it with
  // scripts off, sandboxed and without a preload, since it only needs to be laid out and printed.
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, javascript: false, sandbox: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  try {
    // The export dialog has already asked where to save; asking again showed two save dialogs.
    let target: string | null = isAbsolute(chosen) ? chosen : null
    if (!target) {
      const r = await dialog.showSaveDialog({
        defaultPath: chosen.replace(/\.md$/, '.pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      target = !r.canceled && r.filePath ? r.filePath : null
    }
    if (target) {
      // Letter in the US and Canada, A4 elsewhere, from the system's locale.
      const letter = /^(en-US|en-CA|es-US|fr-CA)$/i.test(app.getLocale()) || /-(US|CA)$/i.test(app.getLocale())
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: letter ? 'Letter' : 'A4' })
      await writeFile(target, pdf)
    }
  } finally {
    win.destroy()
  }
})

/** Whether Pandoc runs on this machine. Checked once (it used to need VALENCE_PANDOC=1 set by hand). */
let pandocAvailable: Promise<boolean> | null = null
function hasPandoc(): Promise<boolean> {
  pandocAvailable ??= new Promise((resolveCheck) => {
    execFile('pandoc', ['--version'], { timeout: 10_000, windowsHide: true }, (err) => resolveCheck(!err))
  })
  return pandocAvailable
}

const PANDOC_FORMATS = new Set(['docx', 'odt', 'epub', 'latex', 'html', 'markdown'])

ipcMain.handle('export:hasPandoc', () => hasPandoc())
ipcMain.handle('export:pandoc', async (_e, contents: string, from: string, to: string, outPath: string) => {
  if (!PANDOC_FORMATS.has(from) || !PANDOC_FORMATS.has(to)) throw new Error(`Pandoc can't convert ${from} to ${to} here.`)
  if (!outPath || !isAbsolute(outPath)) throw new Error('Choose where to save the export.')
  if (!(await hasPandoc())) {
    pandocAvailable = null // installed since? check again next time
    throw new Error('Pandoc was not found. Install it from pandoc.org, then try again.')
  }
  // Pandoc writes the file itself (-o): Word, OpenDocument and EPUB are binary formats, and
  // reading them back as text corrupted every export. The document goes in on stdin.
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn('pandoc', ['-f', from, '-t', to, '-s', '-o', outPath], { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolveRun() : reject(new Error(stderr.trim() || `Pandoc stopped with code ${code}.`))))
    child.stdin.end(contents, 'utf8')
  })
})

/* ── Menu ────────────────────────────────────────────────────────
   Valence has no menu bar: every command runs from the palette
   (Ctrl+P) or a keyboard shortcut instead. Keeping a File / Edit /
   View / Window shell menu would duplicate the palette and steal
   vertical space, which is the thing Typora and MarkText avoid.

   Electron draws its own default menu bar unless we explicitly set
   null, so we do that here. The `menu:build` handler stays so the
   renderer can replace the menu later if it wants one; nothing
   calls it yet, so nothing is shown. */

Menu.setApplicationMenu(null)

export { basename, dirname }
