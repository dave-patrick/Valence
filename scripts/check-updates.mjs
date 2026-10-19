/**
 * Live check of the update planner against the real GitHub releases feed.
 *
 * Not part of the test suite -- it touches the network, so it cannot be a CI gate.
 * Run it by hand when the release feed or the asset naming changes:
 *
 *   node scripts/check-updates.mjs
 *
 * What it proves: the planner can read the real payload and pick the right asset for
 * this platform, using the same code path the app uses.
 */

import { planUpdate, selectAsset } from '../src/core/update.ts'

const REPO = 'dave-patrick/Valence'
const API = `https://api.github.com/repos/${REPO}/releases/latest`

const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'

const response = await fetch(API, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Valence' },
})

if (!response.ok) {
  console.error(`GitHub returned ${response.status}`)
  process.exit(1)
}

const release = await response.json()

console.log(`latest release: ${release.tag_name}`)
console.log(`draft: ${release.draft}  prerelease: ${release.prerelease}`)
console.log('assets:')
for (const asset of release.assets) {
  console.log(`  ${asset.name}  ${(asset.size / 1024 / 1024).toFixed(1)}MB`)
}

const asset = selectAsset(release.assets, platform)
console.log(`\nselected for ${platform}: ${asset ? asset.name : 'NONE'}`)

// A version older than the published one, so the plan is always non-null.
const plan = planUpdate(release, '0.0.1', platform)
if (plan) {
  console.log(`plan: ${plan.version} via ${plan.assetName}`)
  console.log(`url: ${plan.assetUrl}`)
} else {
  console.log('plan: none')
  process.exit(1)
}
