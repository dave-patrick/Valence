/**
 * Browser/in-memory platform.
 *
 * This is the fallback when no Electron preload is present. Files live in `localStorage`, so
 * opening, editing, saving, and exporting all work in a plain browser — which is how the
 * editor gets demoed and unit-tested without a shell.
 *
 * In the packaged app the Electron preload installs a real implementation via
 * `setPlatform()` before React mounts; this one is never used there.
 */

import type { ExportFormat, FileStat, MenuItemSpec, OpenFileResult, Platform } from './types'

const FILES_KEY = 'valence.files'
const ROOT_KEY = 'valence.root'

const EXPORTS: ExportFormat[] = [
  { id: 'html', label: 'Web Page', extension: 'html' },
  { id: 'pdf', label: 'PDF', extension: 'pdf' },
]

export function createWebPlatform(): Platform {
  const store = new Map<string, string>()
  try {
    const raw = localStorage.getItem(FILES_KEY)
    if (raw) for (const [k, v] of JSON.parse(raw) as [string, string][]) store.set(k, v)
  } catch {
    /* first run */
  }
  const watchers = new Set<() => void>()
  const guardFns = new Set<() => Promise<boolean>>()
  const commandFns = new Set<(id: string) => void>()

  const persist = () => {
    try {
      localStorage.setItem(FILES_KEY, JSON.stringify([...store]))
    } catch {
      /* quota — non-fatal, the document lives in memory */
    }
  }

  const touch = () => watchers.forEach((fn) => fn())

  return {
    kind: 'web',

    fs: {
      async read(path) {
        const v = store.get(path)
        if (v === undefined) throw new Error(`No such file: ${path}`)
        return v
      },
      async write(path, contents) {
        store.set(path, contents)
        persist()
        touch()
      },
      /**
       * Binary writes are stored base64 so a pasted image survives a round trip through
       * localStorage. The platform contract is bytes in both directions; only this
       * fallback's storage medium cannot hold them directly.
       */
      async writeBinary(path, data) {
        const bytes = new Uint8Array(data)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
        store.set(`bin:${path}`, btoa(binary))
        persist()
      },
      async stat(path) {
        const v = store.get(path)
        return v === undefined ? null : { path, size: v.length, mtimeMs: Date.now(), isDirectory: false }
      },
      async exists(path) {
        return store.has(path)
      },
      async listDir() {
        return [...store.keys()].map((p): FileStat => ({ path: p, size: 0, mtimeMs: 0, isDirectory: false }))
      },
      async watch() {
        const fn = () => touch()
        watchers.add(fn)
        return () => watchers.delete(fn)
      },
      async reveal() {
        /* no-op in a browser */
      },
    },

    window: {
      setTitle(title) {
        document.title = title
      },
      setDirty() {
        /* no native indicator in a browser tab */
      },
      onCloseGuard(guard) {
        guardFns.add(guard)
        return () => guardFns.delete(guard)
      },
    },

    dialog: {
      async openFile() {
        return await pickFromDisk(store)
      },
      async openFolder() {
        return { paths: [] }
      },
      async save(suggestedName) {
        const name = prompt('Save as', suggestedName)
        return name ?? null
      },
      async confirm(message) {
        return window.confirm(message)
      },
    },

    menu: {
      build(items: MenuItemSpec[]) {
        void items
      },
      onCommand(handler) {
        commandFns.add(handler)
        return () => commandFns.delete(handler)
      },
    },

    clipboard: {
      async writeText(text) {
        await navigator.clipboard.writeText(text)
      },
      async writeHtml(html) {
        const blob = new Blob([html], { type: 'text/html' })
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })])
      },
      async writeImage() {
        /* not supported without a user gesture in most browsers */
      },
      async read() {
        try {
          const [text, html] = await Promise.all([
            navigator.clipboard.readText(),
            navigator.clipboard.read().then(async (items) => {
              const blob = await items[0]?.getType('text/html')
              return blob ? await blob.text() : ''
            }),
          ])
          return { text, html }
        } catch {
          return { text: '', html: '' }
        }
      },
    },

    export: {
      async formats() {
        return EXPORTS
      },
      async toPdf(html, suggestedName) {
        // The browser print pipeline is the closest analogue to the OS one: same CSS,
        // same pagination, same fonts.
        const frame = document.createElement('iframe')
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
        frame.srcdoc = html
        document.body.appendChild(frame)
        await new Promise<void>((r) => frame.addEventListener('load', () => r(), { once: true }))
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
        setTimeout(() => frame.remove(), 1000)
        void suggestedName
      },
      async viaPandoc() {
        throw new Error('Pandoc is not available in this build. Install Pandoc to export to other formats.')
      },
      async hasPandoc() {
        return false
      },
    },
  }
}

async function pickFromDisk(store: Map<string, string>): Promise<OpenFileResult> {
  const picker = (
    window as unknown as {
      showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>
    }
  ).showOpenFilePicker

  if (!picker) return { paths: [...store.keys()] }

  try {
    const handles = await picker({
      multiple: true,
      types: [
        { description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdown'] } },
      ],
    })

    const paths: string[] = []
    for (const handle of handles) {
      const file = await handle.getFile()
      store.set(file.name, await file.text())
      paths.push(file.name)
    }
    if (handles.length > 0) localStorage.setItem(ROOT_KEY, 'disk')
    return { paths }
  } catch {
    // The user dismissed the picker.
    return { paths: [] }
  }
}