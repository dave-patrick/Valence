/**
 * Detects the state where the app is running inside Electron but the preload bridge never
 * loaded.
 *
 * This combination is the dangerous one, and it is silent. `createNodePlatform` falls back
 * to the in-memory web platform whenever the bridge is absent -- correct for `vite dev` in
 * a plain browser and for unit tests, but in a packaged build it means the whole application
 * quietly becomes a notepad with no disk access. The editor opens, the welcome document
 * renders, and open/save/export/history/workspace are all dead with no error anywhere.
 *
 * It reached a release because a stale `../preload/index.mjs` path meant the preload script
 * was never found. Electron logged it once at startup and carried on.
 *
 * So: the fallback stays, but under Electron a missing bridge is a fault to be shown, not a
 * mode to be absorbed.
 */

export interface BridgeStatus {
  /** Running inside the Electron shell. */
  electron: boolean
  /** The preload script exposed its API. */
  bridge: boolean
  /** Electron is present but the bridge is not: something is broken. */
  degraded: boolean
}

function detect(): BridgeStatus {
  const bridge = typeof (globalThis as { valence?: unknown }).valence !== 'undefined'
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const electron = /Electron\//.test(ua)
  return { electron, bridge, degraded: electron && !bridge }
}

// Deliberately not cached. The check is a regex and a property read, the renderer memoises
// it once, and an uncached value keeps this testable and keeps a late-loading bridge honest.
export function bridgeStatus(): BridgeStatus {
  return detect()
}