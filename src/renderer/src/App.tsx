import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { createExtensions } from '@core/editor/extensions'
import { dirname, joinPath } from '@shared/path'
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
import { buildBacklinks, resolveWikiLink } from '@core/wiki'
import { ExportDialog } from '@features/export/ExportDialog'
import { Palette } from '@features/commands/Palette'
import { COMMANDS } from '@features/commands/commands'
import { SlashMenu } from '@features/slash/SlashMenu'
import { searchSlashItems, SLASH_ITEMS } from '@features/slash/slashCommands'
import { detectSlash } from '@features/slash/useSlash'
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [slashMenu, setSlashMenu] = useState<{
    items: ReturnType<typeof searchSlashItems>
    range: { from: number; to: number; query: string }
    pos: { top: number; left: number }
  } | null>(null)

  // Placeholder - filled below after editor creation.
  const [activeHeading, setActiveHeading] = useState('')

  const doc = activeDoc(session)
  const source = doc?.source ?? ''
  const headings = useMemo(() => outlineOf(source), [source])

  // Workspace index for wiki links: every document in the session, with its source. Backlinks to
  // the active note are derived from this, so an added or removed note is reflected live.
  const wikiFiles = useMemo(() => session.documents
    .filter((d) => !!d.path)
    .map((d) => ({ path: d.path! })), [session.documents])
  const wikiRead = useCallback(
    (path: string) => session.documents.find((d) => d.path === path)?.source ?? null,
    [session.documents],
  )
  const backlinks = useMemo(() => {
    const p = doc?.path
    if (!p) return []
    return buildBacklinks(wikiFiles, wikiRead, p)
  }, [wikiFiles, wikiRead, doc?.path])

  const openWikiLink = useCallback(
    (target: string) => {
      // Work out which file this refers to before touching the session. A missing target
      // becomes a new note in the open file's folder rather than being silently dropped —
      // that is the affordance that stops linking from being a ceremony.
      const active = activeDoc(session)
      const base = active?.path ? dirname(active.path) : ''
      const herePath = active?.path ?? null
      const vaultFiles = wikiFiles
      const resolution = resolveWikiLink(target, vaultFiles, herePath)

      let path: string
      switch (resolution.kind) {
        case 'resolved':
          path = resolution.path
          break
        case 'ambiguous':
          // Pick shallowest rather than prompting — prompting in a typing moment is a
          // decision the user already made when they wrote the link.
          path = [...resolution.candidates].sort((a, b) => a.length - b.length)[0]!
          break
        case 'missing':
        default:
          path = joinPath(base, `${target}.md`)
          break
      }

      void (async () => {
        // Missing target: create the note first, so the click always lands somewhere.
        if (resolution.kind === 'missing') {
          try {
            await platform.fs.write(path, `# ${target}\n\n`)
          } catch {
            return
          }
        }
        try {
          const text = await platform.fs.read(path)
          setSession((s) => {
            const existing = s.documents.find((d) => d.path === path)
            if (existing) return setActiveDoc(s, existing.id)
            return openDoc(s, fromPath(path, text))
          })
        } catch {
          /* leave session alone */
        }
      })()
    },
    [session, wikiFiles, platform],
  )

  // Keep a stable ref so the ProseMirror handleClick set up at editor creation always
  // invokes the current version without recreating the editor.
  const followWikiPathRef = useRef<((target: string, heading?: string) => void) | null>(null)
  followWikiPathRef.current = (target, _heading) => openWikiLink(target)

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

  // Defined below; referenced through its setter. This forward declaration is the price of
  // wiring a click handler onto the editor without recreating the editor when session changes.
  // placeholder to satisfy ordering; set below
  // done

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
      handleDOMEvents: {
        click: (_view, event) => {
          const el = (event.target as HTMLElement | null)?.closest('[data-type="wikilink"]')
          if (!el) return false
          const target = el.getAttribute('data-target')
          if (!target) return false
          event.preventDefault()
          event.stopPropagation()
          followWikiPathRef.current?.(target, el.getAttribute('data-heading') || undefined)
          return true
        },
      },
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

      // Slash menu detection.
      const range = detectSlash(e)
      if (range) (window as any).__slashLast = range
      if (!range) {
        setSlashMenu(null)
        return
      }
      const query = range.query
      const items = searchSlashItems(SLASH_ITEMS, query)
      if (!items.length) {
        setSlashMenu(null)
        return
      }
      const coords = e.view.coordsAtPos(range.to)
      setSlashMenu({ items, range, pos: { top: coords.bottom + 4, left: coords.left } })
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

  /* ── Commands: one dispatcher for the menu, the keyboard and the palette ── */

  const runSlash = useCallback((cmd: { id: string }, range: { from: number; to: number }) => {
    if (!editor) return
    editor.chain().focus().deleteRange({ from: range.from, to: range.to }).run()
    const run = (fn: () => void) => { try { fn() } catch { /* editor may have changed */ } }
    switch (cmd.id) {
      case 'h1': case 'h2': case 'h3':
        run(() => editor.chain().focus().toggleHeading({ level: Number(cmd.id.slice(1)[0]) as 1 | 2 | 3 | 4 | 5 | 6 }).run())
        break
      case 'paragraph':
        run(() => editor.chain().focus().setParagraph().run())
        break
      case 'quote':
        run(() => editor.chain().focus().toggleBlockquote().run())
        break
      case 'list.bullet':
        run(() => editor.chain().focus().toggleBulletList().run())
        break
      case 'list.numbered':
        run(() => editor.chain().focus().toggleOrderedList().run())
        break
      case 'list.task':
        run(() => editor.chain().focus().toggleTaskList().run())
        break
      case 'code':
        run(() => editor.chain().focus().toggleCodeBlock().run())
        break
      case 'horizontal':
        run(() => editor.chain().focus().setHorizontalRule().run())
        break
      case 'table':
        run(() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run())
        break
      case 'math.block':
        run(() => editor.chain().focus().insertContent('```math\n\n```\n').run())
        break
      case 'math.inline':
        run(() => editor.chain().focus().insertContent('$x$').run())
        break
      case 'diagram':
        run(() => editor.chain().focus().insertContent('```mermaid\ngraph TD\n  A --> B\n```\n').run())
        break
      case 'callout':
        run(() => editor.chain().focus().insertContent('> [!note]\n> \n').run())
        break
      case 'frontmatter':
        run(() => editor.chain().focus().insertContent('---\ntitle: \n---\n').run())
        break
    }
    setSlashMenu(null)
  }, [editor])

  const moveTab = useCallback((delta: number) => {
    setSession((s) => {
      const i = s.documents.findIndex((d) => d.id === s.activeId)
      if (i === -1 || !s.documents.length) return s
      const next = (i + delta + s.documents.length) % s.documents.length
      return setActiveDoc(s, s.documents[next]!.id)
    })
  }, [])

  const newDoc = useCallback(() => {
    const created = untitled('')
    setSession((s) => setActiveDoc(openDoc(s, created), created.id))
  }, [])

  /**
   * Focus and typewriter are read by the editor through getters on a ref, so toggling means
   * flipping the setting and letting the existing sync effect push the flag down.
   */
  const toggleFocus = useCallback(() => {
    if (settings) patchSettings({ focusMode: !settings.focusMode })
  }, [settings, patchSettings])

  const toggleTypewriter = useCallback(() => {
    if (settings) patchSettings({ typewriter: !settings.typewriter })
  }, [settings, patchSettings])

  /**
   * The single place a command id turns into behaviour.
   *
   * Previously this was an if/else chain inline in the menu subscription, which meant the
   * palette could not reuse it without duplicating every branch. Now all three surfaces call
   * this, so a command cannot exist in the menu and be missing from the palette.
   */
  const runCommand = useCallback(
    (id: string) => {
      switch (id) {
        case 'file.open':
          return void openFile()
        case 'file.save':
          return void save()
        case 'file.saveAll':
          return void saveAll()
        case 'file.new':
          return void newDoc()
        case 'file.export':
          return setExportOpen(true)
        case 'file.close': {
          const current = activeDoc(session)
          if (current) return void closeTab(current.id)
          return
        }
        case 'file.reveal': {
          const path = activeDoc(session)?.path
          if (path) void platform.fs.reveal(path)
          return
        }

        case 'view.hybrid':
          return setView('hybrid')
        case 'view.source':
          return setView('source')
        case 'view.split':
          return setView('split')
        case 'view.toggle':
          return setView((v) => (v === 'split' ? 'hybrid' : 'split'))
        case 'view.cycle':
          return setView((v) => (v === 'hybrid' ? 'source' : v === 'source' ? 'split' : 'hybrid'))

        case 'panel.files':
          return setPanel((p) => (p === 'files' ? null : 'files'))
        case 'panel.outline':
          return setPanel((p) => (p === 'outline' ? null : 'outline'))
        case 'panel.search':
          return setPanel((p) => (p === 'search' ? null : 'search'))
        case 'panel.toggle':
          return setPanel((p) => (p === null ? 'outline' : null))

        case 'write.focus':
          return toggleFocus()
        case 'write.typewriter':
          return toggleTypewriter()
        case 'write.stats':
          return settings && patchSettings({ showInspector: !settings.showInspector })

        case 'tab.next':
          return moveTab(1)
        case 'tab.prev':
          return moveTab(-1)

        case 'app.theme':
          return settings && patchSettings({ theme: theme === 'light' ? 'dark' : 'light' })
        case 'app.settings':
          return setSettingsOpen(true)
        default:
          return
      }
    },
    [
      openFile,
      save,
      saveAll,
      newDoc,
      closeTab,
      session,
      platform,
      toggleFocus,
      toggleTypewriter,
      moveTab,
      settings,
      patchSettings,
      theme,
    ],
  )

  useEffect(() => {
    return platform.menu.onCommand(runCommand)
  }, [runCommand])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey

      // The palette owns its own keys while open; Ctrl+P must not also fire underneath it.
      if (paletteOpen) return

      if (mod && (e.key === 'p' || (e.shiftKey && e.key === 'P'))) {
        // Ctrl+P and Ctrl+Shift+P. Taken before everything else so the palette is reachable
        // no matter what the editor has focused.
        e.preventDefault()
        setPaletteOpen(true)
        return
      }

      // Everything else is a named command, so a shortcut and the palette entry for the same
      // action cannot drift apart.
      if (mod && e.shiftKey && e.key === 'S') return runCommand('file.saveAll')
      if (mod && e.shiftKey && e.key === 'N') return runCommand('file.new')
      if (mod && e.key === 's') return runCommand('file.save')
      if (mod && e.key === 'o') return runCommand('file.open')
      if (mod && e.key === '\\') return runCommand('panel.toggle')
      if (mod && e.key === '/') return runCommand('app.theme')
      if (mod && e.key === ',') return runCommand('app.settings')
      if (mod && e.key === 'e') return runCommand('file.export')
      if (mod && e.altKey && e.key === 'ArrowRight') return runCommand('tab.next')
      if (mod && e.altKey && e.key === 'ArrowLeft') return runCommand('tab.prev')
      if (mod && e.key === 'w') return runCommand('file.close')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runCommand, paletteOpen])

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
              backlinks={backlinks}
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
              onBacklinkOpen={(path, _line) => {
                void (async () => {
                  try {
                    const text = await platform.fs.read(path)
                    setSession((s) => {
                      const existing = s.documents.find((d) => d.path === path)
                      if (existing) return setActiveDoc(s, existing.id)
                      return openDoc(s, fromPath(path, text))
                    })
                    setPanel('outline')
                  } catch {
                    /* unreadable: stay where we are */
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

            {(settings?.showInspector ?? true) && (
              <Inspector
                stats={stats}
                headings={headings.length}
                goal={settings?.dailyWordGoal ?? 0}
              />
            )}
            <StrataGutter headings={headings} active={activeHeading} />
          </div>

           {slashMenu && (
             <SlashMenu
               items={slashMenu.items}
               position={slashMenu.pos}
               onRun={(item) => runSlash(item, slashMenu.range)}
               onClose={() => setSlashMenu(null)}
             />
           )}

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

      {paletteOpen && (
        <Palette
          commands={COMMANDS}
          onRun={runCommand}
          onClose={() => setPaletteOpen(false)}
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
  showInspector: true,
  workspaceRoot: '',
  recentWorkspaces: [],
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