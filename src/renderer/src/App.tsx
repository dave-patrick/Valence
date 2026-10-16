import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { createExtensions } from '@core/editor/extensions'
import { dirname } from '@shared/path'
import { Rail } from '@ui/Rail'
import { Sidebar } from '@ui/Sidebar'
import { StatusBar } from '@ui/StatusBar'
import { Inspector } from '@ui/Inspector'
import { StrataGutter } from '@ui/StrataGutter'
import { TableToolbar } from '@ui/TableToolbar'
import { TabBar, SettingsPanel } from '@ui/TabBar'
import { WELCOME } from './welcome'
import { getPlatform } from '@platform'
import { parseMarkdown } from '@core/markdown/parse'
import { serialiseMarkdown } from '@core/markdown/serialise'
import { blocksToHtml, htmlToBlocks } from '@core/htmlBridge'
import { renderToHtml } from '@core/render'
import { computeStats } from '@features/stats/stats'
import { outlineOf } from '@features/outline/outline'
import { ExportDialog } from '@features/export/ExportDialog'
import { loadSettings, rememberFolder, resolveTheme, saveSession, saveSettings } from '@features/settings/store'
import type { Settings } from '@core/settings'
import {
  active as activeDoc,
  byId,
  close as closeDoc,
  fromPath,
  isDirty,
  markSaved,
  open as openDoc,
  openAll,
  setActive as setActiveDoc,
  setScroll,
  untitled,
  update as updateDoc,
  type Session,
} from '@core/session'

export type ViewMode = 'hybrid' | 'source' | 'split'
export type PanelId = 'files' | 'outline' | 'search' | null

export function App() {
  const platform = useMemo(() => getPlatform(), [])

  /* ── Settings ──────────────────────────────────────────────── */

  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  /* ── Session ───────────────────────────────────────────────── */

  const [session, setSession] = useState<Session>({ documents: [], activeId: '' })
  const [view, setView] = useState<ViewMode>('hybrid')
  const [panel, setPanel] = useState<PanelId>('outline')
  const [sidebarWidth, setSidebarWidth] = useState(268)
  const [readHtml, setReadHtml] = useState('')
  const [readError, setReadError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [activeHeading, setActiveHeading] = useState('')

  const doc = activeDoc(session)
  const source = doc?.source ?? ''
  const headings = useMemo(() => outlineOf(source), [source])

  /**
   * Transient feedback for actions with no other visible result -- a save, an export, a
   * failure. Errors and confirmations share one surface on purpose: a message that changes
   * shape or position depending on severity is two things to learn instead of one.
   */
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    clearTimeout(noticeTimer.current)
    setNotice({ text, tone })
    noticeTimer.current = setTimeout(() => setNotice(null), tone === 'error' ? 6000 : 2600)
  }, [])

  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  const stats = useMemo(() => computeStats(source), [source])

  const theme = settings ? resolveTheme(settings.theme) : 'light'
  const dirty = doc ? isDirty(doc) : false

  /* ── Boot: load settings, then restore the last session ───── */

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const loaded = await loadSettings()
      if (cancelled) return
      setSettings(loaded)

      const fallback = (): Session => {
        const doc = untitled(WELCOME)
        return { documents: [doc], activeId: doc.id }
      }

      if (!loaded.restoreSession || !loaded.lastSession.length) {
        setSession(fallback())
        return
      }

      // Restore only what still opens. A file that has been moved or deleted must not
      // stop the rest of the session from coming back.
      const docs = await Promise.all(
        loaded.lastSession.map(async (path) => {
          try {
            return fromPath(path, await platform.fs.read(path))
          } catch {
            return null
          }
        }),
      )

      if (cancelled) return
      const found = docs.filter((d): d is NonNullable<typeof d> => d !== null)
      const next = openAll({ documents: [], activeId: '' }, found)
      setSession(next.documents.length ? next : fallback())
    })()

    return () => {
      cancelled = true
    }
  }, [platform])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      void saveSettings(next)
      return next
    })
  }, [])

  /* ── Editor ────────────────────────────────────────────────── */

  const initialHtml = useMemo(() => blocksToHtml(parseMarkdown(WELCOME).blocks), [])
  const loadedFor = useRef<string>('')

  // Focus and typewriter read settings through getters, so toggling them takes effect
  // immediately without rebuilding the editor or disturbing the caret.
  const flags = useRef({ focusMode: false, typewriter: false })
  flags.current = {
    focusMode: settings?.focusMode ?? false,
    typewriter: settings?.typewriter ?? false,
  }

  const editor = useEditor({
    extensions: createExtensions(
      {
        focusMode: () => flags.current.focusMode,
        typewriter: () => flags.current.typewriter,
      },
      {
        // Resolved at paste time so the active document is always current.
        context: () => ({
          documentPath: activeDoc(session)?.path ?? null,
          openPaths: session.documents.map((d) => d.path).filter((p): p is string => !!p),
        }),
        writeImage: async (data, extension) => {
          const doc = activeDoc(session)
          const dir = doc?.path ? dirname(doc.path) : ''
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')
          const path = dir ? `${dir}/pasted-${stamp}.${extension}` : `pasted-${stamp}.${extension}`
          await platform.fs.writeBinary(path, data)
          return path
        },
        neighbours: async (dir) => {
          try {
            const entries = await platform.fs.listDir(dir)
            return entries.map((e) => e.path)
          } catch {
            return []
          }
        },
      },
    ),
    content: initialHtml,
    editorProps: {
      attributes: { class: 'editor-surface', spellcheck: 'true', 'data-placeholder': 'Start writing…' },
    },
    onUpdate: ({ editor: e }) => {
      // The single conversion point: editor HTML -> block state -> markdown.
      const blocks = htmlToBlocks(e.getHTML())
      const { text } = serialiseMarkdown(null, blocks)
      setSession((s) => {
        const current = activeDoc(s)
        if (!current || current.id !== loadedFor.current) return s
        return updateDoc(s, current.id, { source: text })
      })
    },
    onSelectionUpdate: ({ editor: e }) => {
      const $pos = e.state.doc.resolve(Math.min(e.state.selection.from, e.state.doc.content.size))
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d)
        if (node.type.name === 'heading') {
          setActiveHeading(node.textContent)
          return
        }
      }
      setActiveHeading('')
    },
  })

  /* ── Pushing the active document into the editor ───────────── */

  useEffect(() => {
    if (!editor || !doc) return
    // Skip when the editor is already showing this document, or it would fight the caret on
    // every keystroke.
    if (loadedFor.current === doc.id) return

    loadedFor.current = doc.id
    editor.commands.setContent(blocksToHtml(parseMarkdown(doc.source).blocks), { emitUpdate: false })

    // Restore this document's scroll position once the new content has been laid out.
    const scroller = editor.view.dom.parentElement?.closest<HTMLElement>('.overflow-y-auto')
    if (!scroller) return

    const applyScroll = () => {
      const range = scroller.scrollHeight - scroller.clientHeight
      if (range > 0) scroller.scrollTop = doc.scroll * range
    }

    requestAnimationFrame(() => requestAnimationFrame(applyScroll))
  }, [editor, doc])

  useEffect(() => {
    if (!editor || !editor.isEditable) return
    editor.setEditable(view !== 'split')
  }, [editor, view])

  // Focus mode's decorations recompute on document or selection change, neither of which a
  // settings toggle produces. An empty transaction nudges the plugin so the toggle is
  // reflected immediately.
  const focusOn = settings?.focusMode ?? false
  const previousFocus = useRef(focusOn)
  useEffect(() => {
    if (!editor || previousFocus.current === focusOn) return
    previousFocus.current = focusOn
    editor.view.dispatch(editor.state.tr.setMeta('focus-toggle', true))
  }, [editor, focusOn])

  useEffect(() => {
    // Split view shows the render, and the export dialog needs it too -- PDF goes through
    // the print pipeline, so it must be the same HTML the reader would have seen, not a
    // second rendering that can drift from it.
    if (view !== 'split' && !exportOpen) return
    let cancelled = false

    void renderToHtml(source, { mode: theme }).then(
      (r) => {
        if (cancelled) return
        // Paint the prose now; diagrams arrive later. Waiting for Mermaid first left the
        // whole reader blank whenever a document contained even one diagram.
        setReadHtml(r.html)
        setReadError(null)

        if (r.diagrams > 0) {
          void r.hydrated.then((h) => {
            if (!cancelled) setReadHtml(h)
          })
        }
      },
      // Without this the rejection is unhandled and the read pane just stays empty, which
      // looks identical to a slow render. A blank pane with a quiet console is the worst
      // possible failure mode for a feature whose entire job is to show you something.
      (e: unknown) => {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setReadError(message)
        console.error('render failed', e)
      },
    )

    return () => {
      cancelled = true
    }
  }, [view, exportOpen, source, theme])

  /* ── File operations ───────────────────────────────────────── */

  const loadInto = useCallback(
    (text: string, filePath: string | null, id: string) => {
      setSession((s) => updateDoc(s, id, { source: text, saved: text, path: filePath }))
      if (filePath) {
        platform.window.setTitle(`${basenameOf(filePath)} — Valence`)
      }
    },
    [platform],
  )

  const openFile = useCallback(async () => {
    const result = await platform.dialog.openFile()
    for (const p of result.paths) {
      try {
        const text = await platform.fs.read(p)
        setSession((s) => {
          const next = openDoc(s, fromPath(p, text))
          return next
        })
      } catch {
        // Unreadable file: leave the session alone rather than opening an empty tab.
      }
    }
    if (result.folder && settings) {
      void rememberFolder(settings, result.folder).then(setSettings)
    }
  }, [platform, settings])

  const save = useCallback(async () => {
    const current = activeDoc(session)
    if (!current) return

    let target = current.path
    if (!target) {
      const suggested = `${slug(titleOf(current.source))}.md`
      target = await platform.dialog.save(suggested)
      if (!target) return
    }
    await platform.fs.write(target, current.source)
    setSession((s) => markSaved(s, current.id, target!))
    platform.window.setDirty(false)
    platform.window.setTitle(`${basenameOf(target)} — Valence`)
  }, [platform, session])

  const closeTab = useCallback(
    async (id: string) => {
      const target = byId(session, id)
      if (!target) return
      if (isDirty(target)) {
        const ok = await platform.dialog.confirm(
          `Close ${target.title}?`,
          'This document has unsaved changes. Closing it will discard them.',
        )
        if (!ok) return
      }
      setSession((s) => closeDoc(s, id))
    },
    [platform, session],
  )

  const saveAll = useCallback(async () => {
    for (const d of session.documents) {
      if (!isDirty(d)) continue
      const target = d.path ?? (await platform.dialog.save(`${slug(titleOf(d.source))}.md`))
      if (!target) continue
      await platform.fs.write(target, d.source)
      setSession((s) => markSaved(s, d.id, target))
    }
    platform.window.setDirty(false)
  }, [platform, session.documents])

  /* ── Menu, shortcuts, persistence ──────────────────────────── */

  useEffect(() => {
    return platform.menu.onCommand((id) => {
      if (id === 'file.open') void openFile()
      else if (id === 'file.save') void save()
      else if (id === 'file.saveAll') void saveAll()
      else if (id === 'file.settings') setSettingsOpen(true)
      else if (id === 'file.export') setExportOpen(true)
      else if (id === 'view.toggle') setView((v) => (v === 'split' ? 'hybrid' : 'split'))
      else if (id === 'view.cycle')
        setView((v) => (v === 'hybrid' ? 'source' : v === 'source' ? 'split' : 'hybrid'))
      else if (id === 'app.theme' && settings) patchSettings({ theme: theme === 'light' ? 'dark' : 'light' })
    })
  }, [openFile, save, saveAll, patchSettings, settings, theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 's') {
        e.preventDefault()
        if (e.shiftKey) void saveAll()
        else void save()
      } else if (mod && e.key === 'o') {
        e.preventDefault()
        void openFile()
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        setPanel((p) => (p === null ? 'outline' : null))
      } else if (mod && e.key === '/') {
        e.preventDefault()
        patchSettings({ theme: theme === 'light' ? 'dark' : 'light' })
      } else if (mod && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      } else if (mod && e.key === 'e') {
        // Ctrl/Cmd+E. Not a browser or Electron default in a document editor, and export is
        // frequent enough that it should not require reaching for the menu.
        e.preventDefault()
        setExportOpen(true)
      } else if (mod && e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        moveTab(1)
      } else if (mod && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        moveTab(-1)
      } else if (mod && e.key === 'w') {
        e.preventDefault()
        const current = activeDoc(session)
        if (current) void closeTab(current.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)

    function moveTab(delta: number) {
      setSession((s) => {
        const i = s.documents.findIndex((d) => d.id === s.activeId)
        if (i === -1 || !s.documents.length) return s
        const next = (i + delta + s.documents.length) % s.documents.length
        return setActiveDoc(s, s.documents[next]!.id)
      })
    }
  }, [openFile, save, saveAll, closeTab, session, theme, patchSettings])

  // Persist the session when it changes and nothing is dirty.
  useEffect(() => {
    if (!settings) return
    const t = setTimeout(() => {
      void saveSession(settings, session).then((next) => {
        if (next.lastSession.length !== settings.lastSession.length) setSettings(next)
      })
    }, 800)
    return () => clearTimeout(t)
  }, [settings, session])

  /* ── Resize ────────────────────────────────────────────────── */

  const dragging = useRef(false)
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])
  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    setSidebarWidth(Math.min(420, Math.max(200, e.clientX)))
  }, [])
  const onResizeEnd = useCallback((e: React.PointerEvent) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const tabBar = settings?.tabBar ?? 'top'

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg)' }}>
      {tabBar === 'top' && (
        <TabBar
          session={session}
          position="top"
          onSelect={(id) => setSession((s) => setActiveDoc(s, id))}
          onClose={(id) => void closeTab(id)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <Rail
          panel={panel}
          onSelect={setPanel}
          theme={theme}
          onToggleTheme={() => patchSettings({ theme: theme === 'light' ? 'dark' : 'light' })}
          onSettings={() => setSettingsOpen(true)}
        />

        {panel && (
          <>
            <Sidebar
              width={sidebarWidth}
              kind={panel}
              headings={headings}
              source={source}
              activePath={doc?.path ?? null}
              onOpenFile={(path) => {
                void (async () => {
                  try {
                    const text = await platform.fs.read(path)
                    setSession((s) => {
                      const existing = s.documents.find((d) => d.path === path)
                      if (existing) return setActiveDoc(s, existing.id)
                      const next = openDoc(s, fromPath(path, text))
                      return next
                    })
                  } catch {
                    /* unreadable file: leave the session alone */
                  }
                })()
              }}
              onClose={() => setPanel(null)}
              onResizeStart={onResizeStart}
              onResizeMove={onResizeMove}
              onResizeEnd={onResizeEnd}
            />
            <div
              role="separator"
              aria-orientation="vertical"
              className="w-px shrink-0 cursor-col-resize"
              style={{ background: 'var(--rule)' }}
              onPointerDown={onResizeStart}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
            />
          </>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {view === 'split' ? (
                <div className="split-pane">
                  <EditorPane
                    editor={editor}
                    source={source}
                    view="hybrid"
                    onSourceChange={(text) => {
                      const current = activeDoc(session)
                      if (current) setSession((s) => updateDoc(s, current.id, { source: text }))
                    }}
                  />
                  {/* Content comes from our own render pipeline over the user's own file. */}
                  <div className="read-surface" dangerouslySetInnerHTML={{ __html: readHtml }} />
                  {readError && (
                    <p className="read-error" role="status">
                      The preview could not be rendered: {readError}
                    </p>
                  )}
                </div>
              ) : (
                <EditorPane
                  editor={editor}
                  source={source}
                  view={view}
                  onSourceChange={(text) => {
                    const current = activeDoc(session)
                    if (current) setSession((s) => updateDoc(s, current.id, { source: text }))
                  }}
                />
              )}
            </div>

            <Inspector
              stats={stats}
              headings={headings.length}
              goal={settings?.dailyWordGoal ?? 0}
            />
            <StrataGutter headings={headings} active={activeHeading} />
          </div>

          <TableToolbar editor={editor} />
        </main>
      </div>

      <StatusBar
        path={doc?.path ?? null}
        stats={stats}
        dirty={dirty}
        tabCount={session.documents.length}
        dirtyCount={session.documents.filter(isDirty).length}
        view={view}
        onViewChange={setView}
      />

      {tabBar === 'bottom' && (
        <TabBar
          session={session}
          position="bottom"
          onSelect={(id) => setSession((s) => setActiveDoc(s, id))}
          onClose={(id) => void closeTab(id)}
        />
      )}

      {exportOpen && (
        <ExportDialog
          markdown={source}
          html={readHtml}
          sourcePath={doc?.path ?? null}
          title={headings[0]?.text ?? null}
          onClose={() => setExportOpen(false)}
          onNotice={(m) => notify(m)}
          onError={(m) => notify(m, 'error')}
        />
      )}

      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-[calc(var(--statusbar-h)+14px)] left-1/2 z-[60] max-w-[min(520px,90vw)] -translate-x-1/2 rounded-[var(--radius)] px-3.5 py-2 text-[12.5px]"
          style={{
            background: 'var(--bg-raised)',
            border: `1px solid ${notice.tone === 'error' ? 'var(--danger)' : 'var(--line)'}`,
            color: notice.tone === 'error' ? 'var(--danger)' : 'var(--text)',
            boxShadow: 'var(--shadow)',
            animation: 'none',
          }}
        >
          {notice.text}
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings ?? { ...DEFAULT_SAFE }}
        onChange={patchSettings}
        onOpenFolder={async () => {
          const result = await platform.dialog.openFolder()
          const folder = result.folder ?? result.paths[0]
          if (folder) patchSettings({ defaultSaveDir: folder })
        }}
      />
    </div>
  )
}

/** Placeholder until settings load, so the panel never renders with undefined. */
const DEFAULT_SAFE: Settings = {
  tabBar: 'top',
  theme: 'system',
  typewriter: false,
  focusMode: false,
  showLineNumbers: false,
  dailyWordGoal: 0,
  defaultSaveDir: '',
  recentFolders: [],
  restoreSession: true,
  lastSession: [],
}

function EditorPane({
  editor,
  source,
  view,
  onSourceChange,
}: {
  editor: ReturnType<typeof useEditor>
  source: string
  view: ViewMode
  onSourceChange: (text: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  /** Guards the round trip: editor update -> session -> editor update must not loop. */
  const applying = useRef(false)

  // Source mode is a live view of the same document, not a second buffer. Text typed here is
  // parsed straight back into editor state, which is why switching views never converts
  // anything and the caret and undo history survive.
  useEffect(() => {
    if (view !== 'source' || !editor) return
    const el = ref.current
    if (!el || el.value === source) return

    applying.current = true
    el.value = source
    editor.commands.setContent(blocksToHtml(parseMarkdown(source).blocks), { emitUpdate: false })
    applying.current = false
  }, [view, source, editor])

  const handle = useCallback(
    (text: string) => {
      onSourceChange(text)
      if (editor && !applying.current) {
        applying.current = true
        editor.commands.setContent(blocksToHtml(parseMarkdown(text).blocks), {
          emitUpdate: false,
        })
        applying.current = false
      }
    },
    [editor, onSourceChange],
  )

  if (view === 'source') {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <textarea
          ref={ref}
          className="editor-surface"
          data-view="source"
          defaultValue={source}
          onChange={(e) => handle(e.target.value)}
          spellCheck={false}
          aria-label="Markdown source"
          style={{ border: 'none', resize: 'none', display: 'block' }}
        />
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <EditorContent editor={editor} />
    </div>
  )
}

function basenameOf(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

function titleOf(source: string): string {
  return /^#\s+(.+)$/m.exec(source)?.[1]?.trim() ?? 'untitled'
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export { setScroll }