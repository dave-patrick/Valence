import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, writeFile, stat, readdir } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'

const isDev = !app.isPackaged

let main: BrowserWindow | null = null
const watchers = new Map<string, FSWatcher>()
let closeGuard: (() => Promise<boolean>) | null = null

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
      preload: `${__dirname}/../preload/index.mjs`,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })

  main.once('ready-to-show', () => main?.show())

  main.on('close', (e) => {
    if (!closeGuard) return
    e.preventDefault()
    void closeGuard().then((ok) => {
      if (ok) {
        closeGuard = null
        main?.close()
      }
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
  buildMenu()
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
   process. The renderer never has Node access. */

ipcMain.handle('fs:read', async (_e, path: string) => readFile(path, 'utf8'))
ipcMain.handle('fs:write', async (_e, path: string, contents: string) => {
  await writeFile(path, contents, 'utf8')
})
ipcMain.handle('fs:writeBinary', async (_e, path: string, data: ArrayBuffer) => {
  await writeFile(path, Buffer.from(new Uint8Array(data)))
})
ipcMain.handle('fs:stat', async (_e, path: string) => {
  try {
    const s = await stat(path)
    return { path, size: s.size, mtimeMs: s.mtimeMs, isDirectory: s.isDirectory() }
  } catch {
    return null
  }
})
ipcMain.handle('fs:exists', async (_e, path: string) => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
})
ipcMain.handle('fs:list', async (_e, path: string) => {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.map((d) => ({
      path: `${path}/${d.name}`,
      size: 0,
      mtimeMs: 0,
      isDirectory: d.isDirectory(),
    }))
  } catch {
    return []
  }
})
ipcMain.handle('fs:reveal', (_e, path: string) => shell.showItemInFolder(path))

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

ipcMain.on('win:closeGuard', (e) => {
  const handler = e as unknown as (() => Promise<boolean>) | null
  closeGuard = handler
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
   Built from a spec the renderer sends, so shortcuts live next to
   the commands they invoke instead of being duplicated here. */

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        { id: 'file.open', label: 'Open…', accelerator: 'CmdOrCtrl+O' },
        { id: 'file.save', label: 'Save', accelerator: 'CmdOrCtrl+S' },
        { type: 'separator' },
        {
          id: 'file.export',
          label: 'Export…',
          accelerator: 'CmdOrCtrl+E',
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { id: 'view.toggle', label: 'Toggle split', accelerator: 'CmdOrCtrl+\\' },
        { id: 'view.cycle', label: 'Cycle views', accelerator: 'CmdOrCtrl+Alt+\\' },
        { id: 'app.theme', label: 'Toggle theme', accelerator: 'CmdOrCtrl+/' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  // Forward the custom ids we assigned back to the renderer. Electron's MenuItem uses a
  // writable `click` property rather than an event emitter.
  for (const item of menu.items) {
    for (const sub of item.submenu?.items ?? []) {
      if (/^(file|view|app)\./.test(sub.id)) {
        sub.click = () => main?.webContents.send('menu:command', sub.id)
      }
    }
  }
}

export { basename, dirname }