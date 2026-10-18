import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, writeFile, stat, readdir, mkdir } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import { preloadPath, resolveDataPath as resolvePath } from './paths'

const isDev = !app.isPackaged

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
      sandbox: false,
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

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
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
ipcMain.handle('fs:reveal', (_e, path: string) => shell.showItemInFolder(resolveDataPath(path)))

ipcMain.handle('fs:watch', (_e, path: string) => {
  if (watchers.has(path)) return
  const w = watch(path, () => {
    main?.webContents.send('file:changed', path)
  })
  watchers.set(path, w)
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

ipcMain.handle('dialog:openFile', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }],
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

ipcMain.handle('dialog:confirm', async (_e, message: string, detail: string) => {
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Cancel', 'Discard changes'],
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

ipcMain.on('menu:command', (e) => {
  main?.webContents.send('menu:command', (e as unknown as { id: string }).id)
})

ipcMain.handle('clip:writeText', (_e, text: string) => main?.webContents.send('clip:text', text))
ipcMain.handle('clip:writeHtml', (_e, html: string) => main?.webContents.send('clip:html', html))
ipcMain.handle('clip:writeImage', (_e, data: ArrayBuffer, ext: string) =>
  main?.webContents.send('clip:image', { data, ext }),
)
ipcMain.handle('clip:read', () => ({ text: '', html: '' }))

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
ipcMain.handle('export:pdf', async (_e, html: string, suggested: string) => {
  if (!main) return
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  const r = await dialog.showSaveDialog({
    defaultPath: suggested.replace(/\.md$/, '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!r.canceled && r.filePath) {
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await writeFile(r.filePath, pdf)
  }
  win.destroy()
})

ipcMain.handle('export:hasPandoc', () => process.env['VALENCE_PANDOC'] === '1')
ipcMain.handle('export:pandoc', async (_e, contents: string, from: string, to: string) => {
  if (process.env['VALENCE_PANDOC'] !== '1') {
    throw new Error('Pandoc was not found. Install it to export to this format.')
  }
  const { execFile } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    execFile('pandoc', ['-f', from, '-t', to], (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    )
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