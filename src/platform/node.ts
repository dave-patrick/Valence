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
  fs: {
    read(path: string): Promise<string>
    write(path: string, contents: string): Promise<void>
    writeBinary(path: string, data: ArrayBuffer): Promise<void>
    stat(path: string): Promise<unknown>
    exists(path: string): Promise<boolean>
    listDir(path: string): Promise<unknown[]>
    watch(path: string): Promise<void>
    unwatch(path: string): Promise<void>
    reveal(path: string): Promise<void>
  }
  win: {
    setTitle(title: string): Promise<void>
    setDirty(dirty: boolean): Promise<void>
    registerCloseGuard(): void
    onCloseRequested(cb: (id: number) => void): () => void
    answerClose(id: number, allow: boolean): void
  }
  dialog: {
    openFile(): Promise<unknown>
    openFolder(): Promise<unknown>
    save(suggested: string): Promise<string | null>
    confirm(message: string, detail?: string): Promise<boolean>
    unsaved(title: string): Promise<UnsavedChoice>
  }
  menu: {
    build(items: unknown): Promise<void>
    onCommand(cb: (id: string) => void): () => void
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
    pandoc(contents: string, from: string, to: string): Promise<string>
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

  const watched = new Set<string>()
  const watchHandlers = new Map<string, (changed?: unknown) => void>()

  return {
    kind: 'electron',

    fs: {
      read: (p) => b.fs.read(p),
      write: (p, c) => b.fs.write(p, c),
    writeBinary: (p, d) => b.fs.writeBinary(p, d),
      stat: async (p) => (await b.fs.stat(p)) as never,
      exists: (p) => b.fs.exists(p),
      listDir: async (p) => (await b.fs.listDir(p)) as never,
      async watch(path) {
        if (watched.has(path)) {
          return () => {
            watched.delete(path)
            void b.fs.unwatch(path)
          }
        }
        watched.add(path)
        await b.fs.watch(path)
        // The main process broadcasts file-changed generically; we bind it to the path we
        // asked to watch and ignore everything else.
        const handler = (changed: unknown) => {
          if (changed === path || changed === undefined) watchHandlers.get(path)?.()
        }
        watchHandlers.set(path, handler)
        const off = b.menu.onCommand(handler as (id: string) => void)
        return () => {
          watched.delete(path)
          watchHandlers.delete(path)
          off()
          void b.fs.unwatch(path)
        }
      },
      reveal: (p) => b.fs.reveal(p),
    },

    window: {
      setTitle: (t) => void b.win.setTitle(t),
      setDirty: (d) => void b.win.setDirty(d),
      onCloseGuard: (guard) => {
        b.win.registerCloseGuard()
        return b.win.onCloseRequested((id) => {
          void guard().then((allow) => b.win.answerClose(id, allow))
        })
      },
    },

    dialog: {
      openFile: async () => (await b.dialog.openFile()) as never,
      openFolder: async () => (await b.dialog.openFolder()) as never,
      save: (s) => b.dialog.save(s),
      confirm: (m, d) => b.dialog.confirm(m, d),
      unsaved: (t) => b.dialog.unsaved(t),
    },

    menu: {
      build: (items) => void b.menu.build(items),
      onCommand: (handler) => b.menu.onCommand(handler),
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
      viaPandoc: (c, f, t) => b.exportAs.pandoc(c, f, t),
      hasPandoc: () => b.exportAs.hasPandoc(),
    },
  }
}