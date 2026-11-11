import { describe, expect, it } from 'vitest'
import { createTextHistory, recordTextEdit, redoTextEdit, undoTextEdit } from '../src/core/textHistory'

describe('source text history', () => {
  it('round-trips replacement, Unicode and CRLF without losing surrounding text', () => {
    const original = '# Heading\r\n😀 cat and cat.\r\n'
    const replaced = '# Heading\r\n😀 $1* and $1*.\r\n'
    const initial = createTextHistory(original)
    const replacement = recordTextEdit(initial, replaced)
    expect(replacement.past).toEqual([{ from: 14, removed: 'cat and cat', inserted: '$1* and $1*', group: null }])
    const undone = undoTextEdit(replacement)
    expect(undone.history.present).toBe(original)
    expect(undone.caret).toBe(25)
    expect(redoTextEdit(undone.history).history.present).toBe(replaced)
    expect(initial.past).toEqual([])
    expect(replacement.past).toHaveLength(1)
  })

  it('isolates typing before and after replacement and discards redo on a new edit', () => {
    let history = createTextHistory('cat')
    history = recordTextEdit(history, 'cat before')
    history = recordTextEdit(history, 'dog before')
    history = recordTextEdit(history, 'dog before after')
    for (const expected of ['dog before', 'cat before', 'cat']) {
      history = undoTextEdit(history).history
      expect(history.present).toBe(expected)
    }
    for (const expected of ['cat before', 'dog before', 'dog before after']) {
      history = redoTextEdit(history).history
      expect(history.present).toBe(expected)
    }
    history = undoTextEdit(history).history
    expect(recordTextEdit(history, history.present)).toBe(history)
    history = recordTextEdit(history, 'dog again')
    expect(history.future).toEqual([])
    expect(redoTextEdit(history)).toEqual({ history, caret: null })
  })

  it('merges composition updates into one edit and keeps later typing separate', () => {
    let history = createTextHistory('cat ')
    history = recordTextEdit(history, 'dog ')
    for (const next of ['dog n', 'dog ni', 'dog 你']) history = recordTextEdit(history, next, 'composition-1')
    history = recordTextEdit(history, 'dog 你好')
    expect(history.past).toHaveLength(3)
    history = undoTextEdit(history).history
    expect(history.present).toBe('dog 你')
    history = undoTextEdit(history).history
    expect(history.present).toBe('dog ')
    expect(redoTextEdit(history).history.present).toBe('dog 你')
    history = undoTextEdit(history).history
    expect(history.present).toBe('cat ')
  })

  it('removes a composition that returns to its original text', () => {
    const initial = createTextHistory('before')
    const started = recordTextEdit(initial, 'before x', 'ime')
    const canceled = recordTextEdit(started, 'before', 'ime')
    expect(canceled).toEqual(initial)
    expect(undoTextEdit(canceled).caret).toBeNull()
  })

  it('bounds the combined stacks to 200 edits while retaining nearby undo and redo', () => {
    let history = createTextHistory('')
    for (let i = 1; i <= 250; i++) history = recordTextEdit(history, 'x'.repeat(i))
    expect(history.past).toHaveLength(200)
    for (let i = 0; i < 200; i++) history = undoTextEdit(history).history
    expect(history.present).toBe('x'.repeat(50))
    expect(history.future).toHaveLength(200)
    for (let i = 0; i < 200; i++) history = redoTextEdit(history).history
    expect(history.present).toBe('x'.repeat(250))
  })

  it('bounds estimated UTF-16 bytes but retains one oversized replacement', () => {
    const large = 'x'.repeat(1024 * 1024 + 1)
    let history = recordTextEdit(createTextHistory(''), large)
    history = recordTextEdit(history, 'y'.repeat(large.length))
    expect(history.past).toHaveLength(1)
    expect(undoTextEdit(history).history.present).toBe(large)
    history = undoTextEdit(history).history
    expect(history.future).toHaveLength(1)
    expect(redoTextEdit(history).history.present).toBe('y'.repeat(large.length))
  })
})
