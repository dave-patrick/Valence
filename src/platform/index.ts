/**
 * Platform resolution.
 *
 * The renderer resolves the implementation once at startup. In a browser (e.g. `vite dev`
 * without Electron, or the test runner) it falls back to a working in-memory implementation,
 * so the editor is fully usable and demonstrable with no shell at all. That is deliberate —
 * the core must never require a platform to prove it works.
 */

import type { Platform } from './types'
import { createNodePlatform } from './node'

let cached: Platform | null = null

export function getPlatform(): Platform {
  if (cached) return cached
  cached = createNodePlatform()
  return cached
}

export function setPlatform(p: Platform): void {
  cached = p
}

export type { Platform } from './types'
export type { FileStat, OpenFileResult, MenuItemSpec, ExportFormat } from './types'