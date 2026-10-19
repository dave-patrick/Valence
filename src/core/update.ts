/**
 * Update planning.
 *
 * Pure. No network, no filesystem, no Electron -- just the decisions that turn "here is
 * a GitHub release" into "should this app update, and to what".
 *
 * ── Why this exists instead of electron-updater ──────────────────────────────
 *
 * Valence ships a bare zip on Windows: no installer, by design. electron-updater's
 * Windows path is `NsisUpdater`, which downloads an `.exe` installer and runs it, and
 * electron-builder only writes the `app-update.yml` that tells the updater where to look
 * when the build target is `nsis`. With a zip target it writes nothing, so the very first
 * `checkForUpdates()` dies with `ENOENT ... app-update.yml`. That is not a
 * misconfiguration to work around -- the mechanism assumes an installer that this
 * distribution deliberately does not have.
 *
 * So the update path is built here instead, on top of the same public release feed
 * electron-updater would have used, and the platform-specific part of applying an update
 * lives in `src/main/updater.ts`.
 */

/** The platforms Valence is built for. */
export type UpdatePlatform = 'win32' | 'darwin' | 'linux'
/** One downloadable file attached to a release. */
export interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

/** The subset of the GitHub release payload this module reads. */
export interface ReleaseInfo {
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  assets: ReleaseAsset[]
}

/** A resolved update: what to download, and why. */
export interface UpdateCandidate {
  /** Normalised version, without the leading `v`. */
  version: string
  /** Release notes, as written. */
  notes: string
  /** The asset to download. */
  assetName: string
  assetUrl: string
  /** Asset size in bytes. */
  size: number
}

/**
 * Strip the tag decoration from a version.
 *
 * Git tags are conventionally `v0.1.10`; the version in `package.json` is `0.1.10`.
 * Comparing the two directly would report every release as newer.
 *
 * @returns the bare version, or null if the tag is not a version
 */
export function parseVersion(tag: string): string | null {
  const trimmed = tag.trim().replace(/^v/i, '')
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(trimmed)
  if (!match) return null
  return `${match[1]}.${match[2]}.${match[3]}`
}

/**
 * Compare two dotted versions.
 *
 * @returns a negative number if `a` is older, zero if equal, positive if `a` is newer
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (pa === null || pb === null) return 0

  const left = pa.split('.').map(Number)
  const right = pb.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Is `candidate` strictly newer than `current`?
 */
export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

/**
 * Choose the asset that carries this platform's build.
 *
 * Matching is on the file suffix, never on the version inside the name. A release
 * published from a build whose `package.json` lagged behind its tag would otherwise be
 * unmatchable, and the version is already known from the tag.
 *
 * @returns the asset, or null if the release has nothing for this platform
 */
export function selectAsset(assets: readonly ReleaseAsset[], platform: UpdatePlatform): ReleaseAsset | null {
  const matching = assets.filter((asset) => {
    const name = asset.name.toLowerCase()
    switch (platform) {
      case 'win32':
        return name.endsWith('.zip') && name.includes('win')
      case 'darwin':
        return name.endsWith('.dmg')
      case 'linux':
        return name.endsWith('.appimage')
    }
  })

  if (matching.length === 0) return null

  // Prefer the newest build when a release ships several, e.g. an x64 and an arm64 mac.
  // Ties break on name so the choice is stable between runs.
  return matching.sort((a, b) => {
    const diff = compareVersions(b.name, a.name)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })[0]!
}

/**
 * Can this platform apply an update without the user doing it by hand?
 *
 * Windows and Linux ship a single unpacked tree or a single file, so a newer build can
 * be put in place by the app itself. macOS ships a disk image, which cannot be mounted
 * and applied silently from a running application, so the user is sent to the releases
 * page instead.
 */
export function supportsSelfUpdate(platform: UpdatePlatform): boolean {
  return platform === 'win32' || platform === 'linux'
}

/**
 * Decide whether a release is an update worth offering.
 *
 * @returns the candidate, or null when the app is already current
 */
export function planUpdate(
  release: ReleaseInfo,
  current: string,
  platform: UpdatePlatform,
): UpdateCandidate | null {
  if (release.draft) return null

  const version = parseVersion(release.tag_name)
  if (version === null) return null
  if (!isNewer(version, current)) return null

  const asset = selectAsset(release.assets, platform)
  if (!asset) return null

  return {
    version,
    notes: release.body ?? '',
    assetName: asset.name,
    assetUrl: asset.browser_download_url,
    size: asset.size,
  }
}
