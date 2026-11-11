import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { findTextMatches, replaceTextMatches, type SearchMatch } from '@core/search'
import { documentSearchKey, findRichMatches, replaceRichMatches } from '@core/editor/find'

interface Props {
  open: boolean; showReplace: boolean; focusSignal: number; seed: string
  editor: Editor | null; source: string; sourceRef: RefObject<HTMLTextAreaElement | null>
  mode: 'rich' | 'source'; docId: string | undefined
  prepareSource: () => { id: string; text: string } | null
  commitSource: (text: string) => void
  onShowReplace: () => void; onClose: () => void
}
const matchIndex = (matches: readonly SearchMatch[], anchor: number | null) => matches.length
  ? Math.max(0, matches.findIndex(match => anchor === null || match.from >= anchor)) : -1

export function FindReplaceBar({ open, showReplace, focusSignal, seed, editor, source, sourceRef, mode, docId, prepareSource, commitSource, onShowReplace, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [anchor, setAnchor] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const [navigation, setNavigation] = useState(0)
  const [message, setMessage] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const options = useMemo(() => ({ matchCase, wholeWord }), [matchCase, wholeWord])
  const matches = useMemo(() => !open || !docId ? [] : mode === 'source'
    ? findTextMatches(source.replace(/\r\n/g, '\n'), query, options)
    : editor ? findRichMatches(editor.state.doc, query, options) : [], [open, docId, mode, source, query, options, editor, revision])
  const index = matchIndex(matches, anchor)
  const currentSearch = useRef({ matches, anchor })
  currentSearch.current = { matches, anchor }

  useEffect(() => { setAnchor(null); setMessage('') }, [docId])
  useEffect(() => { setAnchor(null); setMessage(''); setNavigation(value => value + 1) }, [query, options, mode, open, focusSignal])
  useEffect(() => {
    if (!open) return
    if (seed) setQuery(seed)
    const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select() })
    return () => cancelAnimationFrame(frame)
  }, [open, focusSignal, seed])
  useEffect(() => {
    if (!editor || !open) return
    const refresh = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) setRevision(value => value + 1)
    }
    editor.on('transaction', refresh)
    return () => { editor.off('transaction', refresh) }
  }, [editor, open])
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta(documentSearchKey, { matches: open && mode === 'rich' ? matches : [], active: index }))
  }, [editor, open, mode, matches, index])
  useEffect(() => () => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(documentSearchKey, { matches: [], active: -1 }))
  }, [editor])
  useEffect(() => {
    const current = currentSearch.current
    const match = current.matches[matchIndex(current.matches, current.anchor)]
    if (!open || !match) return
    if (mode === 'rich' && editor && !editor.isDestroyed) {
      editor.commands.setTextSelection(match)
      editor.view.dispatch(editor.state.tr.scrollIntoView())
    } else if (mode === 'source' && sourceRef.current) {
      const textarea = sourceRef.current
      textarea.setSelectionRange(match.from, match.to)
      const prefix = textarea.value.slice(0, match.from)
      const style = getComputedStyle(textarea)
      const line = prefix.slice(prefix.lastIndexOf('\n') + 1)
      const measure = document.createElement('span')
      Object.assign(measure.style, { position: 'fixed', visibility: 'hidden', whiteSpace: 'pre', width: 'max-content', font: style.font })
      measure.textContent = line
      document.body.append(measure)
      const columnWidth = measure.getBoundingClientRect().width
      measure.remove()
      textarea.scrollTop = Math.max(0, (prefix.match(/\n/g) ?? []).length * parseFloat(style.lineHeight) + parseFloat(style.paddingTop) - textarea.clientHeight / 2)
      textarea.scrollLeft = Math.max(0, columnWidth + parseFloat(style.paddingLeft) - textarea.clientWidth / 2)
    }
  }, [navigation, open, mode, editor, sourceRef])

  const move = (delta: number) => {
    if (!matches.length) return
    setAnchor(matches[(index + delta + matches.length) % matches.length]!.from)
    setNavigation(value => value + 1)
    setMessage('')
  }
  const replace = (all: boolean) => {
    if (!query || !docId) return
    let current: SearchMatch[]
    let text = ''
    if (mode === 'source') {
      const prepared = prepareSource()
      if (!prepared || prepared.id !== docId || sourceRef.current?.value !== prepared.text) {
        setMessage('The document changed. Try again.'); return
      }
      text = prepared.text
      current = findTextMatches(text, query, options)
    } else {
      if (!editor || editor.isDestroyed) return
      current = findRichMatches(editor.state.doc, query, options)
    }
    const currentIndex = matchIndex(current, anchor)
    if (currentIndex < 0) return
    const selected = all ? current : [current[currentIndex]!]
    if (mode === 'source') {
      const textarea = sourceRef.current!
      commitSource(replaceTextMatches(text, selected, replacement))
      textarea.focus()
      const caret = selected[0]!.from + replacement.length
      textarea.setSelectionRange(caret, caret)
    } else if (editor) {
      editor.view.dispatch(replaceRichMatches(editor.state, selected, replacement))
      editor.view.dispatch(closeHistory(editor.state.tr))
      editor.view.focus()
    }
    setAnchor(all ? null : selected[0]!.from + replacement.length)
    setMessage(`Replaced ${selected.length} ${selected.length === 1 ? 'match' : 'matches'}.`)
  }
  if (!open) return null
  return <section className="valence-find" role="search" aria-label="Find and replace"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); move(event.shiftKey ? -1 : 1) }
    }}>
    <div className="valence-find__row">
      <label className="valence-find__field">Find<input ref={input} value={query} onChange={event => setQuery(event.target.value)} spellCheck={false} /></label>
      <span role="status" aria-live="polite" className="valence-find__count">{query ? matches.length ? `${index + 1} of ${matches.length}` : 'No matches' : 'Find in document'}</span>
      <button className="valence-btn" disabled={!matches.length} onClick={() => move(-1)}>Previous</button>
      <button className="valence-btn" disabled={!matches.length} onClick={() => move(1)}>Next</button>
      <button className="valence-btn" aria-pressed={matchCase} onClick={() => setMatchCase(value => !value)}>Match case</button>
      <button className="valence-btn" aria-pressed={wholeWord} onClick={() => setWholeWord(value => !value)}>Whole word</button>
      {!showReplace && <button className="valence-btn" onClick={onShowReplace}>Replace…</button>}
      <button className="valence-btn" aria-label="Close find" onClick={onClose}>Close</button>
    </div>
    {showReplace && <div className="valence-find__row">
      <label className="valence-find__field">Replace with<input value={replacement} onChange={event => setReplacement(event.target.value)} spellCheck={false} /></label>
      <button className="valence-btn" disabled={!matches.length} onClick={() => replace(false)}>Replace</button>
      <button className="valence-btn" disabled={!matches.length} onClick={() => replace(true)}>Replace all</button>
      <span className="valence-find__message" role="status">{message}</span>
    </div>}
    <p className="valence-find__hint">{!docId ? 'Open a document to search.' : mode === 'source' ? 'Searches the source text, including Markdown syntax.' : 'Searches visible text. Use Source view to search Markdown syntax, math, or diagram source.'}</p>
  </section>
}
