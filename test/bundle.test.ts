/**
 * Bundle boundary enforcement.
 *
 * The main and preload bundles run inside a runtime that already *provides* some modules.
 * `electron` is one of them: it is not a library you ship, it is the host process talking to
 * itself. If the bundler inlines the npm package instead of leaving it external, the app
 * executes `node_modules/electron/index.js` at launch -- which spawns the download script,
 * prints "Downloading Electron binary..." in a loop, and never opens a window.
 *
 * The build stays green in that state, because building is not running. Only launching is.
 * So the rule is pinned here, where CI runs it on every commit.
 *
 * This is the same species of guard as `purity.test.ts`: a convention that cost a release
 * becomes a test that cannot be quietly undone.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import config from '../electron.vite.config'

const ROOT = join(__dirname, '..')

/**
 * Modules the Electron runtime injects into the main and preload contexts. Bundling any of
 * them replaces a working built-in with whatever happens to sit in node_modules.
 */
const RUNTIME_PROVIDED = ['electron']

/** Signature of the npm install shim. Finding this in a bundle means it got inlined. */
const SHIM_MARKERS = ['Downloading Electron binary', 'Electron failed to install correctly']

type Section = {
  build?: { rollupOptions?: { external?: unknown } }
}

function externalsOf(section: unknown): string[] {
  const external = (section as Section | undefined)?.build?.rollupOptions?.external
  if (Array.isArray(external)) return external.filter((e): e is string => typeof e === 'string')
  return []
}

describe('electron is never bundled', () => {
  it.each([
    ['main', config.main],
    ['preload', config.preload],
  ])('the %s build marks runtime-provided modules external', (_name, section) => {
    const external = externalsOf(section)
    for (const mod of RUNTIME_PROVIDED) {
      expect(external, `${mod} must be listed in the ${_name} externals`).toContain(mod)
    }
  })
})

describe('built output', () => {
  // Skipped when there is nothing built; CI builds after tests, so this only bites locally.
  const targets = [
    ['out/main/index.js', join(ROOT, 'out', 'main', 'index.js')],
    ['out/preload/index.js', join(ROOT, 'out', 'preload', 'index.js')],
  ] as const

  for (const [label, path] of targets) {
    it.skipIf(!existsSync(path))(`${label} contains no inlined electron shim`, () => {
      const code = readFileSync(path, 'utf8')
      for (const marker of SHIM_MARKERS) {
        expect(code, `${label} inlined the electron npm shim (found "${marker}")`).not.toContain(
          marker,
        )
      }
    })
  }
})