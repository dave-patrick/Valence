/**
 * Bridge status.
 *
 * The point of this module is that a total failure is not allowed to look like a working
 * app. These tests pin the one distinction that matters: a browser without the bridge is a
 * legitimate mode, and Electron without the bridge is a fault.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { bridgeStatus } from '../src/platform/bridge'

const CHROME_UA = 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'
const ELECTRON_UA = 'Mozilla/5.0 Electron/44.7.2 Chrome/140.0.0.0 Safari/537.36'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bridgeStatus', () => {
  it('treats a plain browser with no bridge as healthy', () => {
    vi.stubGlobal('navigator', { userAgent: CHROME_UA })
    const s = bridgeStatus()
    expect(s.electron).toBe(false)
    expect(s.bridge).toBe(false)
    expect(s.degraded).toBe(false)
  })

  it('treats Electron with no bridge as degraded', () => {
    vi.stubGlobal('navigator', { userAgent: ELECTRON_UA })
    const s = bridgeStatus()
    expect(s.electron).toBe(true)
    expect(s.bridge).toBe(false)
    expect(s.degraded).toBe(true)
  })

  it('treats Electron with a loaded bridge as healthy', () => {
    vi.stubGlobal('navigator', { userAgent: ELECTRON_UA })
    vi.stubGlobal('valence', {})
    const s = bridgeStatus()
    expect(s.electron).toBe(true)
    expect(s.bridge).toBe(true)
    expect(s.degraded).toBe(false)
  })

  it('does not throw when there is no navigator at all', () => {
    vi.stubGlobal('navigator', undefined)
    expect(() => bridgeStatus()).not.toThrow()
    expect(bridgeStatus().degraded).toBe(false)
  })
})