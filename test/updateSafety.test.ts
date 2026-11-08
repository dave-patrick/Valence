/**
 * Updates must never delete the person's files. `robocopy /MIR` mirrored the new build over
 * the folder holding Valence.exe, which deletes everything else in it -- a disaster when the
 * zip was extracted into Downloads or the Desktop.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cmdPath, INSTALL_MANIFEST, parseDigest, planUpdate, staleFiles } from '../src/core/update'

describe('staleFiles', () => {
  it('deletes nothing when no earlier update left a manifest', () => {
    expect(staleFiles(null, ['Valence.exe'])).toEqual([])
  })

  it('deletes only files the last update installed and this build dropped', () => {
    const before = ['Valence.exe', 'old.dll', 'locales/xx.pak', INSTALL_MANIFEST]
    const after = ['Valence.exe', 'new.dll', 'locales/en-US.pak']
    expect(staleFiles(before, after)).toEqual(['old.dll', 'locales/xx.pak'])
  })

  it('ignores names that try to leave the folder', () => {
    expect(staleFiles(['../Documents/a.md', 'C:/x.txt', '/etc/passwd', 'a/../../b'], [])).toEqual([])
  })

  it('matches names without regard to case, as Windows does', () => {
    expect(staleFiles(['VALENCE.EXE'], ['Valence.exe'])).toEqual([])
  })
})

describe('the apply script', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'main', 'updater.ts'), 'utf8')

  it('copies without mirroring', () => {
    // The command itself (a template string), not the comments that explain the change.
    const command = source.split('\n').filter((l) => /^\s*`robocopy /.test(l))
    expect(command).toHaveLength(1)
    expect(command[0]).not.toContain('/MIR')
    expect(command[0]).toContain(' /E ')
  })

  it('escapes % in paths, which a .cmd file would expand', () => {
    expect(cmdPath('C:\\100% notes\\Valence')).toBe('C:\\100%% notes\\Valence')
    expect(() => cmdPath('C:\\a"b')).toThrow()
  })
})

describe('checksums', () => {
  it('reads GitHub digests', () => {
    expect(parseDigest('sha256:' + 'AB'.repeat(32))).toBe('ab'.repeat(32))
    expect(parseDigest('md5:abc')).toBeNull()
    expect(parseDigest(undefined)).toBeNull()
  })

  it('carries the digest into the update candidate', () => {
    const c = planUpdate({
      tag_name: 'v9.0.0', name: null, body: null, draft: false, prerelease: false,
      assets: [{ name: 'Valence-9.0.0-build-1-win-x64.zip', browser_download_url: 'https://x/z.zip', size: 1, digest: 'sha256:' + '0'.repeat(64) }],
    }, '0.2.3', 'win32')
    expect(c?.sha256).toBe('0'.repeat(64))
  })
})
