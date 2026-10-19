/**
 * File associations.
 *
 * "Set as default" was doing the registry writes and reporting success whether or not
 * they worked, so a failure looked exactly like a success. And the app was never added
 * to the extension's OpenWithProgids, so it did not appear in Explorer's "Open with"
 * list at all -- registered, but invisible, which from the outside is "it did nothing".
 *
 * These tests pin the shape of the module's contract rather than the registry itself,
 * which is not something a test should be writing to.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const source = readFileSync(join(ROOT, 'src', 'main', 'associations.ts'), 'utf8')

describe('the association module', () => {
  it('registers the app in the OpenWithProgids list', () => {
    // Without this the app is registered but never offered in Explorer's "Open with"
    // menu, so the user has no way to pick it.
    expect(source).toContain('OpenWithProgids')
  })

  it('tells the shell the associations changed', () => {
    // Explorer serves a cached answer. Without SHChangeNotify the change does not
    // appear until the next logon, which is what made it look like nothing happened.
    expect(source).toContain('SHChangeNotify')
  })

  it('checks the user choice before the ProgId', () => {
    // The user's own choice wins. Reading only the ProgId would claim to be the
    // default when Windows is handing the files to something else.
    const userChoice = source.indexOf('UserChoice')
    const progId = source.indexOf('Software\\\\Classes')
    expect(userChoice).toBeGreaterThan(-1)
    expect(progId).toBeGreaterThan(-1)
    expect(userChoice).toBeLessThan(progId)
  })

  it('reports the writes that failed rather than swallowing them', () => {
    expect(source).toContain('failures')
    expect(source).not.toMatch(/\.catch\(\(\) => \{\}\)/)
  })
})

describe('the association handlers', () => {
  const main = readFileSync(join(ROOT, 'src', 'main', 'index.ts'), 'utf8')
  const app = readFileSync(join(ROOT, 'src', 'renderer', 'src', 'App.tsx'), 'utf8')

  it('does not report success unconditionally', () => {
    // The old handler returned { ok: true } whatever happened, and the renderer only
    // looked at that flag.
    expect(main).toMatch(/if \(failures\.length > 0\)/)
    expect(app).toMatch(/if \(!r\.ok\)/)
  })

  it('tells the user which types Windows is still giving to another app', () => {
    expect(main).toContain('notDefault')
  })
})
