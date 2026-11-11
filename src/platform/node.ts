/**
 * Node/Electron platform.
 *
 * In the packaged app this delegates to the preload bridge (`window.valence`) so that every
 * Node call happens in the main process. When that bridge is absent — `vite dev` in a plain
 * browser, or a unit test — it falls back to the web implementation, which keeps the editor
 * fully functional with no shell. The core never has to care which it got.
 */

import type { Platform, UnsavedChoice } from './types'
import { createWebPlatform } from './web'

export interface ValenceBridge {
  app: {
    version(): Promise<string>
  }
  fs: {
    read(path: string): Promise<string>
    write(path: string, contents: string): Promise<void>
    writeBinary(path: string, data: ArrayBuffer): Promise<void>
    stat(path: string): Promise<unknown>
    exists(path: string): Promise<boolean>
    listDir(path: string): Promise<unknown[]>
    listDirRecursive(path: string): Promise<unknown[]>
    watch(path: string): Promise<void>
    unwatch(path: string): Promise<void>
    onChanged(cb: (path: string) => void): () => void
    reveal(path: string): Promise<void>
  }
  win: {
    setAppearance?(background: string, foreground: string): Promise<void>
    setTitle(title: string): Promise<void>
    setDirty(dirty: boolean): Promise<void>
    registerCloseGuard(): void
    onCloseRequested(cb: (id: number) => void): () => void
    answerClose(id: number, allow: boolean): void
    pendingFiles(): Promise<string[]>
    onOpenFiles(cb: (paths: string[]) => void): () => void
  }
  dialog: {
    openFile(): Promise<unknown>
    openFolder(): Promise<unknown>
    save(suggested: string): Promise<string | null>
    confirm(message: string, detail?: string, confirmLabel?: string): Promise<boolean>
    unsaved(title: string): Promise<UnsavedChoice>
  }
  menu: {
    build(items: unknown): Promise<void>
    onCommand(cb: (id: string) => void): () => void
  }
  update: {
    check(): Promise<{
      available: boolean
      version: string | null
      notes?: string
      size?: number
      selfUpdate?: boolean
      reason?: string
    }>
    download(): Promise<void>
    install(): Promise<void>
    openReleasesPage(): Promise<void>
    onAvailable(cb: (info: { version: string; selfUpdate: boolean }) => void): () => void
    onProgress(cb: (fraction: number) => void): () => void
    onDownloaded(cb: (version: string) => void): () => void
    onError(cb: (error: string) => void): () => void
  }
  assoc: {
    isDefault(ext: string): Promise<boolean>
    setDefault(): Promise<{
      ok: boolean
      notDefault?: string[]
      reason?: string
    }>
    extensions(): Promise<string[]>
    openDefaultApps(): Promise<void>
  }
  clip: {
    writeText(t: string): Promise<void>
    writeHtml(h: string): Promise<void>
    writeImage(data: ArrayBuffer, ext: string): Promise<void>
    read(): Promise<{ text: string; html: string }>
  }
  exportAs: {
    formats(): Promise<unknown[]>
    toPdf(html: string, suggested: string): Promise<void>
    pandoc(contents: string, from: string, to: string, outPath: string): Promise<void>
    hasPandoc(): Promise<boolean>
  }
}

function bridge(): ValenceBridge | null {
  const b = (globalThis as { valence?: ValenceBridge }).valence
  return b ?? null
}

export function createNodePlatform(): Platform {
  const b = bridge()
  if (!b) return createWebPlatform()

  return {
    kind: 'electron',

    app: {
      version: () => b.app.version(),
    },

    fs: {
      read: (p) => b.fs.read(p),
      write: (p, c) => b.fs.write(p, c),
    writeBinary: (p, d) => b.fs.writeBinary(p, d),
      stat: async (p) => (await b.fs.stat(p)) as never,
      exists: (p) => b.fs.exists(p),
      listDir: async (p) => (await b.fs.listDir(p)) as never,
      listDirRecursive: async (p) => (await b.fs.listDirRecursive(p)) as never,
      // One subscription per watched path; main reports changes by the path we asked for.
      // (This used to listen on the menu-command channel and never called onChange, so
      // nothing ever noticed a file changing on disk.)
      async watch(path, onChange) {
        let active = true
        const off = b.fs.onChanged((changed) => {
          if (active && changed === path) onChange()
        })
        await b.fs.watch(path)
        return () => {
          active = false
          off()
          void b.fs.unwatch(path).catch(() => {})
        }
      },
      reveal: (p) => b.fs.reveal(p),
    },

    window: {
      setAppearance: (background, foreground) => { void b.win.setAppearance?.(background, foreground) },
      setTitle: (t) => void b.win.setTitle(t),
      setDirty: (d) => void b.win.setDirty(d),
      onCloseGuard: (guard) => {
        b.win.registerCloseGuard()
        return b.win.onCloseRequested((id) => {
          void guard().then((allow) => b.win.answerClose(id, allow))
        })
      },
      pendingFiles: () => b.win.pendingFiles(),
      onOpenFiles: (cb) => b.win.onOpenFiles(cb),
    },

    dialog: {
      openFile: async () => (await b.dialog.openFile()) as never,
      openFolder: async () => (await b.dialog.openFolder()) as never,
      save: (s) => b.dialog.save(s),
      confirm: (m, d, label) => b.dialog.confirm(m, d, label),
      unsaved: (t) => b.dialog.unsaved(t),
    },

    menu: {
      build: (items) => void b.menu.build(items),
      onCommand: (handler) => b.menu.onCommand(handler),
    },
    update: {
      check: () => b.update.check(),
      download: () => b.update.download(),
      install: () => b.update.install(),
      openReleasesPage: () => b.update.openReleasesPage(),
      onAvailable: (cb) => b.update.onAvailable(cb),
      onProgress: (cb) => b.update.onProgress(cb),
      onDownloaded: (cb) => b.update.onDownloaded(cb),
      onError: (cb) => b.update.onError(cb),
    },
    assoc: {
      isDefault: (ext) => b.assoc.isDefault(ext),
      setDefault: () => b.assoc.setDefault(),
      extensions: () => b.assoc.extensions(),
      openDefaultApps: () => b.assoc.openDefaultApps(),
    },

    clipboard: {
      writeText: (t) => b.clip.writeText(t),
      writeHtml: (h) => b.clip.writeHtml(h),
      writeImage: (d, e) => b.clip.writeImage(d, e),
      read: () => b.clip.read(),
    },

    export: {
      formats: async () => (await b.exportAs.formats()) as never,
      toPdf: (h, s) => b.exportAs.toPdf(h, s),
      viaPandoc: (c, f, t, out) => b.exportAs.pandoc(c, f, t, out),
      hasPandoc: () => b.exportAs.hasPandoc(),
    },
  }
}
