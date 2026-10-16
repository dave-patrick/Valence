/**
 * @vitest-environment jsdom
 *
 * Version history.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { getPlatform } from '@platform'
import {
  loadSnapshots,
  saveSnapshot,
  formatAge,
  snapshotPath,
  MAX_SNAPSHOTS,
} from '../src/features/history/history'

let counter = 0
const fresh = () => `/doc-${++counter}.md`

describe('snapshotPath', () => {
  it('puts history beside the document in a dotfile directory', () => {
    expect(snapshotPath('/notes/journal.md')).toBe('/notes/.valence/journal.history.json')
    expect(snapshotPath('/notes/journal.txt')).toBe('/notes/.valence/journal.history.json')
  })

  it('handles a rootless path', () => {
    expect(snapshotPath('journal.md')).toBe('.valence/journal.history.json')
  })
})

describe('formatAge', () => {
  it('says "just now" under a minute', () => {
    expect(formatAge(950_000, 1_000_000)).toBe('just now')
  })
  it('reports minutes', () => {
    expect(formatAge(940_000, 1_000_000)).toBe('1m ago')
  })
  it('reports hours', () => {
    expect(formatAge(2_000_000, 10_000_000)).toBe('2h ago')
  })
  it('reports days', () => {
    expect(formatAge(0, 100_000_000)).toBe('1d ago')
  })
})

describe('saveSnapshot / loadSnapshots', () => {
  it('returns true and stores the new snapshot', async () => {
    const p = fresh()
    const saved = await saveSnapshot(p, '# a')
    expect(saved).toBe(true)
    const snaps = await loadSnapshots(p)
    expect(snaps).toHaveLength(1)
    expect(snaps[0]?.source).toBe('# a')
  })

  it('returns false and stores nothing when nothing changed', async () => {
    const p = fresh()
    await saveSnapshot(p, '# a')
    const saved = await saveSnapshot(p, '# a')
    expect(saved).toBe(false)
    expect(await loadSnapshots(p)).toHaveLength(1)
  })

  it('keeps newest first', async () => {
    const p = fresh()
    await saveSnapshot(p, 'v1')
    await new Promise((r) => setTimeout(r, 5))
    await saveSnapshot(p, 'v2')
    const snaps = await loadSnapshots(p)
    expect(snaps.map((s) => s.source)).toEqual(['v2', 'v1'])
  })

  it('prunes to MAX_SNAPSHOTS', async () => {
    const p = fresh()
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) {
      await saveSnapshot(p, `v${i}`)
      await new Promise((r) => setTimeout(r, 2))
    }
    const snaps = await loadSnapshots(p)
    expect(snaps.length).toBe(MAX_SNAPSHOTS)
    expect(snaps[0]?.source).toBe(`v${MAX_SNAPSHOTS + 4}`)
  })

  it('loads [] when nothing exists (fails silently, never throws)', async () => {
    expect(await loadSnapshots(fresh())).toEqual([])
  })

  it('isolates documents by path', async () => {
    const [a, b] = [fresh(), fresh()]
    await saveSnapshot(a, 'A')
    await saveSnapshot(b, 'B')
    expect((await loadSnapshots(a)).map((s) => s.source)).toEqual(['A'])
    expect((await loadSnapshots(b)).map((s) => s.source)).toEqual(['B'])
  })
})