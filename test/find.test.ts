/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { createExtensions } from '../src/core/editor/extensions'
import { findTextMatches, replaceTextMatches } from '../src/core/search'
import { findRichMatches, replaceRichMatches, documentSearchKey } from '../src/core/editor/find'
const options = { matchCase: false, wholeWord: false }
describe('literal document search', () => {
  it('treats regex syntax and replacement dollars as literal text', () => {
    const text = 'a.b a?b [x] a.b'
    const matches = findTextMatches(text, 'a.b', options)
    expect(matches).toEqual([{from:0,to:3},{from:12,to:15}])
    expect(replaceTextMatches(text, matches, '$1*')).toBe('$1* a?b [x] $1*')
    expect(findTextMatches(text, '[x]', options)).toEqual([{from:8,to:11}])
    expect(findTextMatches(text, '', options)).toEqual([])
  })
  it('keeps UTF-16 offsets and Unicode whole-word boundaries', () => {
    const text = '😀 CAFÉ café cafés _café café2 café\u0301'
    expect(findTextMatches(text, 'café', {...options,wholeWord:true})).toEqual([{from:3,to:7},{from:8,to:12}])
    expect(findTextMatches(text, 'CAFÉ', {...options,matchCase:true})).toEqual([{from:3,to:7}])
  })
  it('does not recursively replace newly inserted matching text', () => {
    expect(replaceTextMatches('cat cat',findTextMatches('cat cat','cat',options),'catcat')).toBe('catcat catcat')
  })
})
describe('rich document search', () => {
  it('searches across marks, but not across blocks or inline atoms', () => {
    const editor = new Editor({extensions:createExtensions(), content:'<p>hello <strong>world</strong></p><p>hello</p><p>world</p><p>a<img src="x.png">b</p><table><tbody><tr><td><p>world</p></td></tr></tbody></table>'})
    try {
      expect(findRichMatches(editor.state.doc,'hello world',options)).toHaveLength(1)
      expect(findRichMatches(editor.state.doc,'ab',options)).toHaveLength(0)
      expect(findRichMatches(editor.state.doc,'world',options)).toHaveLength(3)
      const found=findRichMatches(editor.state.doc,'world',options)
      editor.view.dispatch(editor.state.tr.setMeta(documentSearchKey,{matches:found,active:1}))
      expect(documentSearchKey.getState(editor.state)?.find()).toHaveLength(3)
      editor.view.dispatch(replaceRichMatches(editor.state,found,'earth'))
      editor.view.dispatch(closeHistory(editor.state.tr))
      expect(editor.getHTML()).toContain('<strong>earth</strong>')
      expect(findRichMatches(editor.state.doc,'earth',options)).toHaveLength(3)
      editor.commands.undo()
      expect(findRichMatches(editor.state.doc,'world',options)).toHaveLength(3)
    } finally {editor.destroy()}
  })
  it('keeps typing, replacement and subsequent typing as separate undo steps', () => {
    const editor=new Editor({extensions:createExtensions(),content:'<p>cat</p>'})
    try {
      editor.view.dispatch(editor.state.tr.insertText(' before',4))
      const before=editor.state.doc.textContent
      editor.view.dispatch(replaceRichMatches(editor.state,findRichMatches(editor.state.doc,'cat',options),'dog'))
      editor.view.dispatch(closeHistory(editor.state.tr))
      const replaced=editor.state.doc.textContent
      editor.view.dispatch(editor.state.tr.insertText(' after',editor.state.doc.content.size-1))
      editor.commands.undo();expect(editor.state.doc.textContent).toBe(replaced)
      editor.commands.undo();expect(editor.state.doc.textContent).toBe(before)
      editor.commands.undo();expect(editor.state.doc.textContent).toBe('cat')
    } finally {editor.destroy()}
  })
})
