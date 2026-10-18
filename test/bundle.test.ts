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
import { preloadFilename, preloadPath } from '../src/main/paths'

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

describe('packaged payload', () => {
  // electron-builder copies production `dependencies` into the asar even when `files` omits
  // them -- it is documented behaviour, not a bug, and it is easy to forget. Nothing here
  // needs them at runtime: the renderer is bundled by Vite and the main process uses only
  // node builtins and the externalised `electron`. Shipping them anyway cost 12,544 files
  // and roughly 110MB of a 205MB download.
  //
  // Revisit this if the main process ever grows a real runtime dependency; if it does, that
  // package must be un-excluded deliberately rather than arriving by accident.
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const files: string[] = pkg.build?.files ?? []

  it('excludes node_modules from the asar', () => {
    // The word appears in the negation pattern itself, so the meaningful check is that
    // every mention is an exclusion. Any positive mention would pull the tree back in.
    for (const pattern of files) {
      if (pattern.includes('node_modules')) {
        expect(pattern.startsWith('!'), `${pattern} would re-include node_modules`).toBe(true)
      }
    }
    expect(files).toContain('!**/node_modules/**/*')
  })

  it('still ships the built output and the manifest', () => {
    expect(files).toContain('out/**/*')
    expect(files).toContain('package.json')
  })

  it('has no un-excluded pattern that would drag dependencies back in', () => {
    const included = files.filter((f) => !f.startsWith('!'))
    expect(included.some((f) => f.includes('node_modules'))).toBe(false)
  })
})

describe('preload is reachable from main', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

  it('names the extension electron-vite actually emits', () => {
    // With "type": "module", electron-vite writes the ESM bundle as index.js. Asking for
    // index.mjs is what shipped: main looked for a file that does not exist, Electron logged
    // "Unable to load preload script" once, and the context bridge never ran. The editor
    // still opened, so the failure presented as "the app works" with every disk feature
    // silently dead.
    const expected = pkg.type === 'module' ? 'index.js' : 'index.mjs'
    expect(preloadFilename).toBe(expected)
  })

  it('resolves out/main -> out/preload', () => {
    expect(preloadPath('/app/out/main')).toBe(
      join('/app/out/main', '..', 'preload', preloadFilename),
    )
  })

  it.skipIf(!existsSync(join(ROOT, 'out', 'preload')))('points at a file that exists', () => {
    const built = join(ROOT, 'out', 'preload', preloadFilename)
    expect(existsSync(built), `${preloadFilename} is not in the build output`).toBe(true)
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