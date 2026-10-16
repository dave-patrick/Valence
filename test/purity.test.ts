/**
 * Purity boundary enforcement.
 *
 * `src/core/**` may import only from `src/core/**` and `src/shared/**`. It may not reach for
 * Node, Electron, or `src/platform`. This is the load-bearing structural rule of the
 * codebase and the reason the editor engine stays unit-testable and embeddable.
 *
 * Adapted from Muya's best decision — an engine package that *cannot* depend on its host —
 * with the "cannot" upgraded from convention to a test.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

const ROOT = join(__dirname, '..')
const CORE = join(ROOT, 'src', 'core')

const FORBIDDEN = [
  /from\s+['"]node:/,
  /from\s+['"]electron['"]/,
  /from\s+['"]@platform/,
  /from\s+['"][^'"]*\/platform\//,
  /require\(\s*['"](node|electron)/,
  /\bprocess\.(?!env\b)/,
  /__dirname/,
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('core purity', () => {
  const files = walk(CORE)

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((f) => [relative(ROOT, f), f]))('%s stays pure', (_name, file) => {
    const source = readFileSync(file, 'utf8')
    // Comments are stripped so documentation *about* the boundary does not trip the rule.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    for (const rule of FORBIDDEN) {
      expect(rule.test(code), `${relative(ROOT, file)} matched ${rule}`).toBe(false)
    }
  })

  it('imports nothing from outside core and shared', () => {
    // Local aliases that would break the boundary. Scoped npm packages (`@tiptap/...`)
    // are fine — the rule is about not reaching back into the host application.
    const FORBIDDEN_ALIASES = ['@ui/', '@features/', '@platform', '@/']

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
      for (const spec of specifiers) {
        if (spec.startsWith('.') || spec.startsWith('@core/') || spec.startsWith('@shared/')) continue

        // A scoped package is `@scope/name`. Distinguish it from our own `@name/...` aliases.
        const isScopedPackage = /^@[^/]+\/[^/]/.test(spec)
        if (isScopedPackage) {
          const scope = spec.split('/')[0]!
          if (FORBIDDEN_ALIASES.includes(`${scope}/`)) {
            throw new Error(`${relative(ROOT, file)} imports "${spec}" — breaks the purity boundary.`)
          }
          continue
        }

        if (FORBIDDEN_ALIASES.some((a) => spec === a.replace(/\/$/, '') || spec.startsWith(a))) {
          throw new Error(`${relative(ROOT, file)} imports "${spec}" — breaks the purity boundary.`)
        }
      }
    }
  })
})

describe('layering', () => {
  it('platform does not import ui or features', () => {
    const files = walk(join(ROOT, 'src', 'platform'))
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]@ui\//)
      expect(source).not.toMatch(/from\s+['"]@features\//)
    }
  })

  it('core never references the renderer', () => {
    const files = walk(CORE)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, relative(ROOT, file)).not.toMatch(/from\s+['"]react['"]/)
    }
  })
})

describe('shared', () => {
  it('has no runtime dependencies of its own', () => {
    const files = walk(join(ROOT, 'src', 'shared'))
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
      for (const spec of specifiers) {
        expect(spec.startsWith('.'), `${relative(ROOT, file)} imports "${spec}"`).toBe(true)
      }
    }
  })
})

void dirname