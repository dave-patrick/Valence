/**
 * Applying an update.
 *
 * The main-process half of the updater. `src/core/update.ts` decides *whether* to update
 * and *what* to download; this file downloads it and puts it in place.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 *
 * Windows gets a bare zip. There is no installer to run, so an update means replacing
 * the files of a running application with the files of a newer one. That cannot happen
 * while the old executable is mapped, so the work is split across the restart:
 *
 *   1. Download the new build into a staging directory.
 *   2. Write a small script next to it that waits for this process to exit, copies the
 *      new files over the old ones, and starts the new executable.
 *   3. Run that script detached and quit.
 *
 * The script is a `.cmd` rather than a Node script because it has to outlive the
 * process it was written by, and the only thing guaranteed to be on the machine is
 * Windows itself.
 *
 * The copy is `robocopy /MIR`, which mirrors the staged tree over the installation.
 * That removes files the new build no longer ships, which a plain copy would leave
 * behind as stale cruft.
 */

import { app, BrowserWindow, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { copyFile, chmod, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import {
  planUpdate,
  supportsSelfUpdate,
  type ReleaseInfo,
  type UpdateCandidate,
  type UpdatePlatform,
} from '../core/update'

const REPO = 'dave-patrick/Valence'
const API = `https://api.github.com/repos/${REPO}/releases/latest`

/** Where the updater keeps its working files. */
function stagingRoot(): string {
  return join(tmpdir(), 'valence-updater')
}

/** The directory the application is installed in. */
function installDir(): string {
  return join(app.getPath('exe'), '..')
}

function platform(): UpdatePlatform {
  return process.platform as UpdatePlatform
}

/**
 * Fetch the latest release from GitHub.
 *
 * @returns the release, or null if GitHub is unreachable or says something unexpected
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(API, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Valence',
      },
    })
    if (!response.ok) return null
    const payload = (await response.json()) as ReleaseInfo
    if (!payload || typeof payload.tag_name !== 'string') return null
    return payload
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Work out whether there is an update to offer.
 *
 * @returns the candidate, or null when the app is current or the check failed
 */
export async function checkForUpdate(): Promise<UpdateCandidate | null> {
  const release = await fetchLatestRelease()
  if (!release) return null
  return planUpdate(release, app.getVersion(), platform())
}

/**
 * Can the app put a new build in place by itself?
 *
 * macOS ships a disk image, which cannot be mounted and applied from a running
 * application, so the user is sent to the releases page instead. Offering an update
 * that cannot actually be delivered would be worse than saying so plainly.
 */
export function canSelfUpdate(): boolean {
  return supportsSelfUpdate(platform())
}

/**
 * Download a build into the staging directory.
 *
 * @param candidate what to download
 * @param onProgress called with the fraction transferred so far
 * @returns the path of the downloaded file
 */
export async function downloadUpdate(
  candidate: UpdateCandidate,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const dir = join(stagingRoot(), candidate.version)
  await mkdir(dir, { recursive: true })
  const target = join(dir, candidate.assetName)

  const response = await fetch(candidate.assetUrl, {
    headers: { 'User-Agent': 'Valence' },
  })
  if (!response.ok) throw new Error(`download failed: ${response.status}`)

  const total = Number(response.headers.get('content-length') ?? candidate.size ?? 0)
  let received = 0

  const body = Readable.fromWeb(response.body as never)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (total > 0) onProgress?.(Math.min(1, received / total))
  })

  await pipeline(body, createWriteStream(target))
  onProgress?.(1)
  return target
}

/**
 * Unpack a downloaded build.
 *
 * Windows gets a zip, and `tar.exe` ships with Windows 10 and later, so no extra
 * tooling is needed. Linux gets an AppImage, which is a single file rather than an
 * archive, so it is not unpacked at all.
 *
 * @returns the directory the build was unpacked into
 */
async function unpack(archive: string, into: string): Promise<string> {
  await mkdir(into, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xf', archive, '-C', into], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar exited with code ${code}`)),
    )
  })
  return into
}

/**
 * Write the script that applies the update after this process exits.
 *
 * It waits for the given process to disappear, mirrors the staged build over the
 * installation, and starts the new executable. `robocopy` is used rather than `xcopy`
 * because `/MIR` deletes files the new build does not ship.
 */
async function writeApplyScript(staged: string, target: string, pid: number): Promise<string> {
  const script = join(stagingRoot(), `apply-${Date.now()}.cmd`)

  // The name of the executable to restart. Taken from the running one, so a renamed
  // install still restarts correctly.
  const exe = basename(app.getPath('exe'))

  // The wait loop polls for the parent process. `tasklist` is the only thing guaranteed
  // present, and it returns a non-zero exit code once the process is gone.
  const contents = [
    '@echo off',
    'setlocal',
    `:wait`,
    `tasklist /FI "PID eq ${pid}" /NH 2>nul | find "${pid}" >nul`,
    'if not errorlevel 1 (timeout /t 1 /nobreak >nul & goto wait)',
    `robocopy "${staged}" "${target}" /MIR /NFL /NDL /NJH /NJS /NP`,
    'if errorlevel 8 exit /b 1',
    `start "" "${join(target, exe)}"`,
    'endlocal',
    '',
  ].join('\r\n')

  await writeFile(script, contents, 'utf8')
  return script
}

/**
 * Apply a downloaded update.
 *
 * On Windows the new build is staged, an apply script is written, and that script is
 * started detached. It waits for this process to exit before touching anything, which is
 * what makes replacing a running application possible at all.
 *
 * On Linux the AppImage is a single file, so the swap is simpler: it can be moved into
 * place and the app restarted, because the running process holds its own copy of the
 * old inode.
 *
 * @returns true when the handoff was arranged
 */
export async function applyUpdate(candidate: UpdateCandidate): Promise<boolean> {
  const root = stagingRoot()
  const archive = join(root, candidate.version, candidate.assetName)

  if (!(await exists(archive))) return false

  if (process.platform === 'darwin') {
    // A .dmg cannot be applied from a running app. The user is sent to the releases
    // page, which is what a macOS update has always been.
    openReleasesPage()
    return false
  }

  if (process.platform === 'linux') {
    return applyLinuxUpdate(archive)
  }

  const staged = join(root, candidate.version, 'staged')
  await rm(staged, { recursive: true, force: true })
  await unpack(archive, staged)

  // The zip's entries sit at the top level, but a stray wrapper directory is common
  // enough to be worth handling.
  const effective = await findExecutable(staged)
  if (!effective) return false

  const target = installDir()
  const script = await writeApplyScript(effective, target, process.pid)

  const child = spawn('cmd.exe', ['/c', script], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  return true
}

/**
 * Replace the running AppImage with a newer one.
 *
 * The AppImage is a single executable file. Renaming the new one over the old is enough:
 * the running process keeps the old inode, and the next launch uses the new file.
 */
async function applyLinuxUpdate(archive: string): Promise<boolean> {
  const current = app.getPath('exe')
  const next = `${current}.new`

  try {
    await copyFile(archive, next)
    await chmod(next, 0o755)
    await rename(next, current)
  } catch {
    await rm(next, { force: true }).catch(() => {})
    return false
  }

  const child = spawn(current, [], { detached: true, stdio: 'ignore' })
  child.unref()
  return true
}

/**
 * Find the directory holding the new executable.
 *
 * @returns the directory, or null if it cannot be found
 */
async function findExecutable(staged: string): Promise<string | null> {
  const entries = await readdir(staged, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile())
  const dirs = entries.filter((e) => e.isDirectory())

  if (files.some((f) => f.name.toLowerCase().endsWith('.exe'))) return staged

  // One level down: the archive wrapped everything in a folder.
  for (const dir of dirs) {
    const inner = join(staged, dir.name)
    const innerEntries = await readdir(inner, { withFileTypes: true })
    if (innerEntries.some((e) => e.isFile() && e.name.toLowerCase().endsWith('.exe'))) {
      return inner
    }
  }

  return null
}

/**
 * Does a path exist?
 */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Open the releases page in the browser.
 *
 * Used when an update cannot be applied automatically, so the user is never left with a
 * dead end.
 */
export function openReleasesPage(): void {
  void shell.openExternal(`https://github.com/${REPO}/releases/latest`)
}
