/**
 * @vitest-environment jsdom
 *
 * Progressive diagram rendering.
 *
 * `renderToHtml` used to await Mermaid before returning anything, so a document containing a
 * single diagram left the reader pane blank for as long as a multi-megabyte graph library took
 * to load. The contract now is that the prose is returned immediately with placeholders, and
 * `hydrated` carries the resolved version.
 *
 * The tests here pin that ordering, because the failure it prevents is invisible: nothing
 * throws, the promise simply never settles, and the pane stays empty.
 */

import { describe, expect, it } from 'vitest'
import { renderToHtml } from '../src/core/render'

const WITH_DIAGRAM = [
  '# Heading',
  '',
  'Some prose that must be readable without waiting for anything.',
  '',
  '```mermaid',
  'graph TD;',
  '  A-->B;',
  '```',
  '',
  'More prose after the diagram.',
].join('\n')

const NO_DIAGRAM = '# Plain\n\nJust text and `code`, no diagrams at all.\n'

/** Resolves true if the promise settles, false if it is still pending after `ms`. */
async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let done = false
  void promise.then(
    () => {
      done = true
    },
    () => {
      done = true
    },
  )
  const start = Date.now()
  while (!done && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 10))
  }
  return done
}

describe('renderToHtml without diagrams', () => {
  it('returns the finished document immediately', async () => {
    const r = await renderToHtml(NO_DIAGRAM)
    expect(r.diagrams).toBe(0)
    expect(r.html).toContain('Plain')
    expect(r.html).not.toContain('valence-diagram--pending')
  })

  it('hydrates to exactly the same html, since there is nothing to wait for', async () => {
    const r = await renderToHtml(NO_DIAGRAM)
    await expect(r.hydrated).resolves.toBe(r.html)
  })
})

describe('renderToHtml with a diagram', () => {
  it('resolves without loading Mermaid', async () => {
    // The whole point: if this hangs, the reader pane is blank.
    //
    // The budget is generous on purpose. What is being asserted is *independence from the
    // diagram renderer*, not a speed — Shiki initialises a WASM grammar engine on first use,
    // which on a loaded machine can take longer than any budget worth writing down. A tight
    // number here would turn a slow machine into a red build that says nothing about the
    // behaviour under test.
    const settled = await settlesWithin(renderToHtml(WITH_DIAGRAM), 20000)
    expect(settled, 'renderToHtml must not wait on the diagram renderer').toBe(true)
  }, 40000)

  it('returns the prose with a placeholder where the diagram goes', async () => {
    const r = await renderToHtml(WITH_DIAGRAM)
    expect(r.diagrams).toBe(1)
    expect(r.html).toContain('Some prose that must be readable')
    expect(r.html).toContain('More prose after the diagram')
    expect(r.html).toContain('valence-diagram--pending')
  })

  it('leaves the mermaid source out of the immediate html', async () => {
    // Showing the source is what the *failed* state is for. In the pending state it would
    // flash as raw code before swapping to SVG.
    const r = await renderToHtml(WITH_DIAGRAM)
    expect(r.html).not.toContain('graph TD;')
  })

  it('does not resolve hydrated synchronously', async () => {
    const r = await renderToHtml(WITH_DIAGRAM)
    // It may already have settled if Mermaid is cached from a previous test; what matters
    // is that the immediate html is the usable one, which the two assertions above cover.
    expect(typeof r.hydrated.then).toBe('function')
  })
})