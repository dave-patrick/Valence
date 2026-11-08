/**
 * The build ID is written in package.json twice (the `buildId` field and the file name pattern),
 * and the release notes name both numbers. They have to agree, or a release ships files named
 * for a different build than the notes and the About box say.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

describe('release metadata', () => {
  it('uses the YYYY.DD.MM.revision build ID format', () => {
    expect(pkg.buildId).toMatch(/^\d{4}\.\d{2}\.\d{2}\.[1-9]\d*$/)
  })

  it('names the artifacts with the same build ID', () => {
    expect(pkg.build.artifactName).toContain(`-build-${pkg.buildId}-`)
  })

  it('release notes name this version and build', () => {
    const notes = readFileSync(join(ROOT, 'RELEASE-NOTES.md'), 'utf8')
    expect(notes).toContain(`# Valence ${pkg.version}`)
    expect(notes).toContain(pkg.buildId)
  })

  it('points at the real repository', () => {
    expect(JSON.stringify([pkg.repository, pkg.homepage, pkg.bugs])).not.toContain('OWNER')
  })
})
