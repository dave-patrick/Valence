/**
 * The update mechanism.
 *
 * Valence ships a bare zip on Windows: no installer, by design. electron-updater cannot
 * drive that distribution -- its Windows path downloads and runs an `.exe` installer, and
 * electron-builder only writes the `app-update.yml` that tells it where to look when the
 * build target is `nsis`. With a zip target it writes nothing, and the first
 * `checkForUpdates()` fails with `ENOENT ... app-update.yml`.
 *
 * That is not a misconfiguration to work around. The updater is therefore hand-rolled on
 * top of the same public GitHub releases feed, and the rules below pin that choice so it
 * cannot be quietly undone by someone reaching for the familiar package.
 *
 * The behaviour of the planner itself is covered in `test/update.test.ts`.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

function readAll(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...readAll(full, ext))
    else if (entry.name.endsWith(ext)) out.push(full)
  }
  return out
}

describe('electron-updater is not used', () => {
  it('is not a dependency', () => {
    expect(pkg.dependencies?.['electron-updater']).toBeUndefined()
    expect(pkg.devDependencies?.['electron-updater']).toBeUndefined()
  })

  it('is not imported anywhere in the source', () => {
    // An import would still fail at runtime -- it is no longer installed -- but the
    // failure would be at launch, not at build time, which is how it goes unnoticed.
    const sources = [
      ...readAll(join(ROOT, 'src'), '.ts'),
      ...readAll(join(ROOT, 'src'), '.tsx'),
    ]
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      expect(text, `${file} imports electron-updater`).not.toMatch(/from\s+['"]electron-updater['"]/)
    }
  })
})

describe('the updater is wired end to end', () => {
  it('the main process imports the updater', () => {
    const main = readFileSync(join(ROOT, 'src', 'main', 'index.ts'), 'utf8')
    expect(main).toMatch(/from\s+['"]\.\/updater['"]/)
  })

  it('the core planner is free of platform imports', () => {
    // The planner decides what to download. If it reached for `fetch` or `fs` it would
    // stop being testable, which is the whole reason it is a separate module.
    const planner = readFileSync(join(ROOT, 'src', 'core', 'update.ts'), 'utf8')
    expect(planner).not.toMatch(/from\s+['"]node:/)
    expect(planner).not.toMatch(/\bfetch\s*\(/)
  })

  it('the preload exposes the update surface', () => {
    const preload = readFileSync(join(ROOT, 'src', 'preload', 'index.ts'), 'utf8')
    for (const channel of [
      'update:check',
      'update:download',
      'update:install',
      'update:progress',
    ]) {
      expect(preload, `preload does not expose ${channel}`).toContain(channel)
    }
  })
})
