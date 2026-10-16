/**
 * The preload bridge.
 *
 * This is the entire surface the renderer has onto the OS. It is a thin, typed pass-through
 * to the main process — no logic lives here, and the renderer gets no Node access.
 */

import { contextBridge, ipcRenderer } from 'electron'

const api = {
  fs: {
    read: (path: string) => ipcRenderer.invoke('fs:read', path),
    write: (path: string, contents: string) => ipcRenderer.invoke('fs:write', path, contents),
    writeBinary: (path: string, data: ArrayBuffer) => ipcRenderer.invoke('fs:writeBinary', path, data),
    stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
    listDir: (path: string) => ipcRenderer.invoke('fs:list', path),
    watch: (path: string) => ipcRenderer.invoke('fs:watch', path),
    unwatch: (path: string) => ipcRenderer.invoke('fs:unwatch', path),
    reveal: (path: string) => ipcRenderer.invoke('fs:reveal', path),
  },
  win: {
    setTitle: (title: string) => ipcRenderer.invoke('win:title', title),
    setDirty: (dirty: boolean) => ipcRenderer.invoke('win:dirty', dirty),
    onCloseRequested: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('win:close', handler)
      return () => ipcRenderer.off('win:close', handler)
    },
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    save: (suggested: string) => ipcRenderer.invoke('dialog:save', suggested),
    confirm: (message: string, detail?: string) =>
      ipcRenderer.invoke('dialog:confirm', message, detail ?? ''),
  },
  menu: {
    build: (items: unknown) => ipcRenderer.send('menu:build', items),
    onCommand: (cb: (id: string) => void) => {
      const handler = (_e: unknown, id: string) => cb(id)
      ipcRenderer.on('menu:command', handler)
      return () => ipcRenderer.off('menu:command', handler)
    },
  },
  clip: {
    writeText: (t: string) => ipcRenderer.invoke('clip:writeText', t),
    writeHtml: (h: string) => ipcRenderer.invoke('clip:writeHtml', h),
    writeImage: (data: ArrayBuffer, ext: string) => ipcRenderer.invoke('clip:writeImage', data, ext),
    read: () => ipcRenderer.invoke('clip:read'),
  },
  exportAs: {
    formats: () => ipcRenderer.invoke('export:formats'),
    toPdf: (html: string, suggested: string) => ipcRenderer.invoke('export:pdf', html, suggested),
    pandoc: (contents: string, from: string, to: string) =>
      ipcRenderer.invoke('export:pandoc', contents, from, to),
    hasPandoc: () => ipcRenderer.invoke('export:hasPandoc'),
  },
}

contextBridge.exposeInMainWorld('valence', api)

export type ValenceApi = typeof api