/**
 * The shell interface.
 *
 * The renderer never imports `electron`. Everything the app needs from the OS goes through
 * this interface, so a Tauri backend is an additive implementation rather than a rewrite
 * (docs/02-architecture.md §1.2).
 */

export interface FileStat {
  path: string
  size: number
  mtimeMs: number
  isDirectory: boolean
}

export interface OpenFileResult {
  /** Absolute paths. Empty if the user cancelled. */
  paths: string[]
  /** The folder that was entered, if they opened one. */
  folder?: string
}

export interface MenuItemSpec {
  id: string
  label?: string
  role?: string
  accelerator?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  checked?: boolean
  enabled?: boolean
  submenu?: MenuItemSpec[]
}

export interface ExportFormat {
  id: string
  label: string
  extension: string
  /** Requires a Pandoc binary. Detected at runtime, never assumed. */
  pandoc?: boolean
}

/**
 * What the user chose when closing a document with unsaved changes.
 *
 * Three ways, not two. Offering only "Discard" and "Cancel" makes saving impossible from the
 * prompt, so the user has to cancel, hunt for Ctrl+S, then close again -- at the exact moment
 * they are trying to leave.
 */
export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface Platform {
  readonly kind: 'electron' | 'tauri' | 'web'

  fs: {
    read(path: string): Promise<string>
    write(path: string, contents: string): Promise<void>
    /** Writes raw bytes — used for pasted clipboard images. */
    writeBinary(path: string, data: ArrayBuffer): Promise<void>
    stat(path: string): Promise<FileStat | null>
    exists(path: string): Promise<boolean>
    listDir(path: string): Promise<FileStat[]>
    watch(path: string, onChange: () => void): Promise<() => void>
    reveal(path: string): Promise<void>
  }

  window: {
    setTitle(title: string): void
    setDirty(dirty: boolean): void
    /** Register a guard invoked on close when dirty. Returns an unsubscribe fn. */
    onCloseGuard(guard: () => Promise<boolean>): () => void
    /** Paths passed on the command line ("Open with"). Empty unless the app was launched with files. */
    pendingFiles(): Promise<string[]>
    /** Fired when the running app is asked to open more files ("Open with" while already open). */
    onOpenFiles(cb: (paths: string[]) => void): () => void
  }

  dialog: {
    openFile(filters?: { name: string; extensions: string[] }[]): Promise<OpenFileResult>
    openFolder(): Promise<OpenFileResult>
    save(suggestedName: string): Promise<string | null>
    confirm(message: string, detail?: string): Promise<boolean>
    unsaved(title: string): Promise<UnsavedChoice>
  }

  menu: {
    build(items: MenuItemSpec[]): void
    onCommand(handler: (id: string) => void): () => void
  }

  update: {
    check(): Promise<{
      available: boolean
      version: string | null
      notes?: string
      size?: number
      /** False on macOS, where the build is a disk image that cannot be self-applied. */
      selfUpdate?: boolean
      reason?: string
    }>
    download(): Promise<void>
    install(): Promise<void>
    openReleasesPage(): Promise<void>
    onAvailable(cb: (version: string) => void): () => void
    onProgress(cb: (fraction: number) => void): () => void
    onDownloaded(cb: (version: string) => void): () => void
    onError(cb: (error: string) => void): () => void
  }

  assoc: {
    isDefault(ext: string): Promise<boolean>
    setDefault(): Promise<{ ok: boolean; reason?: string }>
    extensions(): Promise<string[]>
  }

  clipboard: {
    writeText(text: string): Promise<void>
    writeHtml(html: string): Promise<void>
    writeImage(data: ArrayBuffer, ext: string): Promise<void>
    read(): Promise<{ text: string; html: string }>
  }

  export: {
    formats(): Promise<ExportFormat[]>
    /** Print-to-PDF via the OS pipeline — preserves fonts and pagination. */
    toPdf(html: string, suggestedName: string): Promise<void>
    /** Convert via Pandoc. Rejects with a clear message if Pandoc is absent. */
    viaPandoc(contents: string, from: string, to: string): Promise<string>
    hasPandoc(): Promise<boolean>
  }
}