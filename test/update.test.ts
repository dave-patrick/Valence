/**
 * Update planning.
 *
 * The rules here are the ones a user would otherwise only discover by being wrong: a
 * release tagged `v0.1.10` must not be treated as older than `0.1.9`, a release for
 * another platform must not be offered, and a draft must never be.
 */

import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  isNewer,
  parseVersion,
  planUpdate,
  selectAsset,
  supportsSelfUpdate,
  type ReleaseAsset,
  type ReleaseInfo,
} from '../src/core/update'

const asset = (name: string, size = 1000): ReleaseAsset => ({
  name,
  browser_download_url: `https://example.test/${name}`,
  size,
})

const release = (over: Partial<ReleaseInfo> = {}): ReleaseInfo => ({
  tag_name: 'v0.2.0',
  name: 'Valence 0.2.0',
  body: 'Fixes things.',
  draft: false,
  prerelease: false,
  assets: [
    asset('Valence-0.2.0-win.zip', 200),
    asset('Valence-0.2.0.dmg', 300),
    asset('Valence-0.2.0.AppImage', 400),
  ],
  ...over,
})

describe('parseVersion', () => {
  it('strips the leading v', () => {
    expect(parseVersion('v1.2.3')).toBe('1.2.3')
    expect(parseVersion('1.2.3')).toBe('1.2.3')
    expect(parseVersion('V1.2.3')).toBe('1.2.3')
  })

  it('drops a prerelease suffix', () => {
    expect(parseVersion('v1.2.3-beta.1')).toBe('1.2.3')
    expect(parseVersion('v1.2.3+build7')).toBe('1.2.3')
  })

  it('rejects things that are not versions', () => {
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('v1.2')).toBeNull()
    expect(parseVersion('')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
  })

  it('compares numerically, not lexically', () => {
    // The bug this catches: "0.1.9" > "0.1.10" as strings, but not as versions.
    expect(compareVersions('0.1.9', '0.1.10')).toBeLessThan(0)
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0)
  })

  it('ignores the v prefix', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
  })
})

describe('isNewer', () => {
  it('is false for the same version', () => {
    expect(isNewer('1.2.3', '1.2.3')).toBe(false)
  })

  it('is true only for a strictly greater version', () => {
    expect(isNewer('1.2.4', '1.2.3')).toBe(true)
    expect(isNewer('1.2.2', '1.2.3')).toBe(false)
  })
})

describe('selectAsset', () => {
  const assets = [
    asset('Valence-0.2.0-win.zip'),
    asset('Valence-0.2.0.dmg'),
    asset('Valence-0.2.0.AppImage'),
  ]

  it('picks the windows build', () => {
    expect(selectAsset(assets, 'win32')?.name).toBe('Valence-0.2.0-win.zip')
  })

  it('picks the mac build', () => {
    expect(selectAsset(assets, 'darwin')?.name).toBe('Valence-0.2.0.dmg')
  })

  it('picks the linux build', () => {
    expect(selectAsset(assets, 'linux')?.name).toBe('Valence-0.2.0.AppImage')
  })

  it('returns null when the release has nothing for the platform', () => {
    expect(selectAsset([asset('Valence-0.2.0.dmg')], 'win32')).toBeNull()
    expect(selectAsset([], 'linux')).toBeNull()
  })

  it('does not confuse a mac build with a windows build', () => {
    const both = [asset('Valence-0.2.0.dmg'), asset('Valence-0.2.0-win.zip')]
    expect(selectAsset(both, 'win32')?.name).toContain('win')
    expect(selectAsset(both, 'darwin')?.name).toContain('dmg')
  })
})

describe('supportsSelfUpdate', () => {
  it('is true where the app can replace itself', () => {
    expect(supportsSelfUpdate('win32')).toBe(true)
    expect(supportsSelfUpdate('linux')).toBe(true)
  })

  it('is false on macOS, which ships a disk image', () => {
    // A .dmg cannot be mounted and applied from a running app, so the user is sent to
    // the releases page instead. Offering a silent update that cannot be delivered
    // would be worse than being honest about it.
    expect(supportsSelfUpdate('darwin')).toBe(false)
  })
})

describe('planUpdate', () => {
  it('offers a newer release', () => {
    const plan = planUpdate(release(), '0.1.9', 'win32')
    expect(plan).not.toBeNull()
    expect(plan!.version).toBe('0.2.0')
    expect(plan!.assetName).toBe('Valence-0.2.0-win.zip')
    expect(plan!.notes).toBe('Fixes things.')
    expect(plan!.size).toBe(200)
  })

  it('offers nothing when already current', () => {
    expect(planUpdate(release(), '0.2.0', 'win32')).toBeNull()
  })

  it('offers nothing when the current build is newer', () => {
    expect(planUpdate(release(), '0.3.0', 'win32')).toBeNull()
  })

  it('offers nothing for a draft', () => {
    expect(planUpdate(release({ draft: true }), '0.1.9', 'win32')).toBeNull()
  })

  it('offers nothing for a tag that is not a version', () => {
    expect(planUpdate(release({ tag_name: 'nightly' }), '0.1.9', 'win32')).toBeNull()
  })

  it('offers nothing when the release has no build for the platform', () => {
    const macOnly = release({ assets: [asset('Valence-0.2.0.dmg')] })
    expect(planUpdate(macOnly, '0.1.9', 'win32')).toBeNull()
    expect(planUpdate(macOnly, '0.1.9', 'darwin')).not.toBeNull()
  })

  it('compares against the app version, not the tag text', () => {
    // v0.1.10 must be seen as newer than 0.1.9, not older.
    const r = release({ tag_name: 'v0.1.10' })
    expect(planUpdate(r, '0.1.9', 'win32')).not.toBeNull()
    expect(planUpdate(r, '0.1.10', 'win32')).toBeNull()
  })
})
