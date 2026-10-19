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
    /**
     * Tell main this renderer wants to be consulted before the window closes, then answer
     * each request by id.
     *
     * The round trip is: main preventDefault()s the close, sends `win:close-request` with an
     * id, and waits for `win:close-answer` carrying that id. Passing the id back is what
     * keeps two close attempts from resolving each other.
     */
    registerCloseGuard: () => ipcRenderer.send('win:closeGuard'),
    onCloseRequested: (cb: (id: number) => void) => {
      const handler = (_e: unknown, id: number) => cb(id)
      ipcRenderer.on('win:close-request', handler)
      return () => ipcRenderer.off('win:close-request', handler)
    },
    answerClose: (id: number, allow: boolean) => ipcRenderer.send('win:close-answer', id, allow),
    pendingFiles: () => ipcRenderer.invoke('doc:pending-files'),
    onOpenFiles: (cb: (paths: string[]) => void) => {
      const handler = (_e: unknown, paths: string[]) => cb(paths)
      ipcRenderer.on('doc:open-files', handler)
      return () => ipcRenderer.off('doc:open-files', handler)
    },
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    save: (suggested: string) => ipcRenderer.invoke('dialog:save', suggested),
    confirm: (message: string, detail?: string) =>
      ipcRenderer.invoke('dialog:confirm', message, detail ?? ''),
    unsaved: (title: string) => ipcRenderer.invoke('dialog:unsaved', title),
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