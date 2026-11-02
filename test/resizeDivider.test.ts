/** @vitest-environment jsdom */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ResizeDivider } from '../src/ui/ResizeDivider'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.hasPointerCapture = () => true
  HTMLElement.prototype.releasePointerCapture = () => {}
})
afterEach(() => { act(() => root.unmount()); host.remove() })
function setup(direction: 1 | -1 = 1, scale = 1) {
  function Demo() {
    const [value, onChange] = useState(220)
    return createElement(ResizeDivider, { label: 'Resize test pane', value, onChange, min: 140, max: 420, direction, unitsPerPixel: () => scale })
  }
  act(() => root.render(createElement(Demo)))
  return host.querySelector('[role="separator"]')!
}
function pointer(el: Element, type: string, x: number, id = 1, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button })
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true } })
  act(() => el.dispatchEvent(event))
}
const value = (el: Element) => Number(el.getAttribute('aria-valuenow'))
describe('pane resizing', () => {
  it('uses drag deltas without jumping and stops on pointer up', () => {
    const el = setup(); pointer(el, 'pointerdown', 700); pointer(el, 'pointermove', 730)
    expect(value(el)).toBe(250)
    pointer(el, 'pointerup', 730); pointer(el, 'pointermove', 800)
    expect(value(el)).toBe(250)
  })
  it('reverses movement for right-hand panes and clamps both bounds', () => {
    const el = setup(-1); pointer(el, 'pointerdown', 700); pointer(el, 'pointermove', 670)
    expect(value(el)).toBe(250)
    pointer(el, 'pointermove', 0); expect(value(el)).toBe(420)
    pointer(el, 'pointermove', 2000); expect(value(el)).toBe(140)
  })
  it.each(['pointercancel', 'lostpointercapture'])('stops on %s', type => {
    const el = setup(); pointer(el, 'pointerdown', 100); pointer(el, type, 100); pointer(el, 'pointermove', 200)
    expect(value(el)).toBe(220)
  })
  it('ignores right clicks and another pointer during a drag', () => {
    const el = setup(); pointer(el, 'pointerdown', 100, 1, 2); pointer(el, 'pointermove', 200)
    expect(value(el)).toBe(220)
    pointer(el, 'pointerdown', 100); pointer(el, 'pointermove', 200, 2)
    expect(value(el)).toBe(220)
  })
  it('converts pixels to split percentages', () => {
    const el = setup(1, 0.1); pointer(el, 'pointerdown', 100); pointer(el, 'pointermove', 200)
    expect(value(el)).toBe(230)
  })
  it('supports keyboard directions and Home/End', () => {
    const el = setup(-1)
    const key = (key: string) => act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
    key('ArrowLeft'); expect(value(el)).toBe(230)
    key('ArrowRight'); expect(value(el)).toBe(220)
    key('Home'); expect(value(el)).toBe(140)
    key('End'); expect(value(el)).toBe(420)
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.getAttribute('aria-orientation')).toBe('vertical')
  })
})
