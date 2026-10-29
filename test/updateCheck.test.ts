import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chromiumFetch = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: { getVersion: () => '0.2.0', whenReady: () => Promise.resolve() },
  net: { fetch: chromiumFetch },
  BrowserWindow: {},
  shell: {},
}))

import { checkForUpdate, fetchLatestRelease } from '../src/main/updater'

beforeEach(() => { chromiumFetch.mockImplementation((...args) => fetch(...args as [string, RequestInit])) })
afterEach(() => { chromiumFetch.mockReset(); vi.unstubAllGlobals(); vi.useRealTimers() })

const release = {
  tag_name: 'v0.2.1', name: 'Valence 0.2.1', body: 'Update', draft: false, prerelease: false,
  assets: [
    { name: 'Valence-0.2.1-build-2026.29.10.2-win-x64.zip', browser_download_url: 'https://example.test/windows', size: 100 },
    { name: 'Valence-0.2.1-build-2026.29.10.2-linux-x86_64.AppImage', browser_download_url: 'https://example.test/linux', size: 100 },
    { name: 'Valence-0.2.1-build-2026.29.10.2-mac-arm64.dmg', browser_download_url: 'https://example.test/mac', size: 100 },
  ],
}

describe('update check failures are not reported as current', () => {
  it('uses Chromium networking when Node networking is blocked and bypasses the release cache', async () => {
    const nodeFetch = vi.fn().mockRejectedValue(new Error('Node cannot reach this network'))
    vi.stubGlobal('fetch', nodeFetch)
    chromiumFetch.mockResolvedValue(new Response(JSON.stringify(release)))
    expect((await checkForUpdate())?.version).toBe('0.2.1')
    expect(nodeFetch).not.toHaveBeenCalled()
    expect(chromiumFetch).toHaveBeenCalledWith(expect.stringContaining('/releases/latest'), expect.objectContaining({ cache: 'no-store' }))
  })
  it('offers the published build to version 0.2.0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(release))))
    expect((await checkForUpdate())?.version).toBe('0.2.1')
  })

  it.each([403, 429, 500])('reports HTTP %s instead of no update', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    await expect(checkForUpdate()).rejects.toThrow(`HTTP ${status}`)
  })

  it('reports a network failure instead of no update', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: new Error('CERT_HAS_EXPIRED') })))
    await expect(checkForUpdate()).rejects.toThrow(/CERT_HAS_EXPIRED/)
  })

  it('reports invalid release data instead of no update', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"bad response"}')))
    await expect(fetchLatestRelease()).rejects.toThrow(/invalid/i)
  })

  it('reports the request timeout and releases its timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const check = fetchLatestRelease().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(15000)
    expect(await check).toMatchObject({ message: expect.stringMatching(/timed out/i) })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns no update after successfully reading an equal version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...release, tag_name: 'v0.2.0' }))))
    expect(await checkForUpdate()).toBeNull()
  })
})
