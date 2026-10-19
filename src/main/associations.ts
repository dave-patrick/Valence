/**
 * Registering Valence as the editor for Markdown and text files.
 *
 * ── What Windows actually consults ─────────────────────────────────────────────
 *
 * Two places, and they are not the same:
 *
 *   `HKCU\Software\Classes\.ext`      the ProgId for the extension. Writing this is
 *                                      what makes the association real.
 *   `...\Explorer\FileExts\.ext\UserChoice`   the user's chosen default handler.
 *                                      Protected since Windows 8: a write without a
 *                                      valid hash is discarded silently, so an
 *                                      application cannot quietly make itself the
 *                                      default. That protection is deliberate and
 *                                      this does not try to defeat it.
 *
 * When there is no UserChoice -- the common case for a file type nobody has
 * configured -- the ProgId decides, and registering the association genuinely makes
 * Valence the default. When there is one, Windows keeps using it, and the honest
 * thing is to tell the user where to change it rather than pretend otherwise.
 *
 * ── Three things that have to happen ─────────────────────────────────────────
 *
 * 1. The ProgId is defined, with an open command and an icon.
 * 2. The extension points at that ProgId, *and* at it in `OpenWithProgids` so the
 *    app appears in Explorer's "Open with" list. Without that it is registered but
 *    invisible, which is what "it did nothing" looks like from the outside.
 * 3. The shell is told the associations changed. `SHChangeNotify` with
 *    `SHCNE_ASSOCCHANGED` is how that is done. Without it Explorer keeps serving a
 *    cached answer and the change appears to have failed until the next logon.
 */

import { execFile } from 'node:child_process'
import { shell } from 'electron'

/** The ProgId Valence registers under. */
export const PROG_ID = 'Valence.Document'

/** The file types Valence can be made the handler for. */
export const ASSOCIATED_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.txt'] as const

/** Run a command and capture its output. */
function run(command: string, args: string[]): Promise<{ err: string | null; stdout: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        resolve({ err: (stderr || err.message).trim(), stdout: '' })
        return
      }
      resolve({ err: null, stdout: stdout.toString() })
    })
  })
}

/** Run a command that has no useful output, reporting only whether it worked. */
function runQuiet(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (err, _stdout, stderr) => {
      resolve(err ? (stderr || err.message).trim() : null)
    })
  })
}

/**
 * Register Valence as the handler for the given file types.
 *
 * @param exePath the executable to hand the files to
 * @returns the writes that failed, if any. Empty means everything landed.
 */
export async function registerAssociations(exePath: string): Promise<string[]> {
  if (process.platform !== 'win32') return ['file associations are only supported on Windows']

  const failures: string[] = []

  const writes: [string, string[]][] = [
    [`HKCU\\Software\\Classes\\${PROG_ID}`, ['/ve', '/d', 'Valence Document']],
    [`HKCU\\Software\\Classes\\${PROG_ID}\\DefaultIcon`, ['/ve', '/d', `"${exePath}",0`]],
    [
      `HKCU\\Software\\Classes\\${PROG_ID}\\shell\\open\\command`,
      ['/ve', '/d', `"${exePath}" "%1"`],
    ],
  ]

  for (const ext of ASSOCIATED_EXTENSIONS) {
    // The extension's ProgId.
    writes.push([`HKCU\\Software\\Classes\\${ext}`, ['/ve', '/d', PROG_ID]])
    // And the same ProgId in the "Open with" list, so the app is offered there.
    writes.push([
      `HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`,
      ['/v', PROG_ID, '/t', 'REG_SZ', '/d', ''],
    ])
  }

  for (const [key, args] of writes) {
    const failure = await runQuiet('reg', ['add', key, ...args, '/f'])
    if (failure) failures.push(`${key}: ${failure}`)
  }

  if (failures.length === 0) notifyShellOfChange()

  return failures
}

/**
 * Is Valence the default handler for this extension?
 *
 * The user's own choice wins if they have made one; otherwise the ProgId does.
 */
export async function isDefaultFor(ext: string): Promise<boolean> {
  if (process.platform !== 'win32') return false

  const userChoice = await run('reg', [
    'query',
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${ext}\\UserChoice`,
    '/v',
    'ProgId',
  ])

  if (!userChoice.err) {
    const m = /ProgId\s+REG_SZ\s+(\S+)/.exec(userChoice.stdout)
    if (m) return m[1] === PROG_ID
  }

  const progId = await run('reg', ['query', `HKCU\\Software\\Classes\\${ext}`, '/ve'])
  if (progId.err) return false
  return progId.stdout.includes(PROG_ID)
}

/**
 * Open Windows' own Default Apps page.
 *
 * When the user has already chosen a different handler for a file type, Windows keeps
 * that choice, and the choice is protected: it cannot be set from outside the shell's
 * own UI. This is deliberate -- an application must not be able to make itself the
 * default behind the user's back.
 *
 * So when that is the situation, the user is sent to the one place where it can be
 * changed. Everything else the app can do by itself, and does.
 */
export function openDefaultAppsSettings(): void {
  if (process.platform !== 'win32') return
  void shell.openExternal('ms-settings:defaultapps')
}

/**
 * Tell the shell that the file associations have changed.
 *
 * `SHChangeNotify(SHCNE_ASSOCCHANGED, ...)` is how the shell is told to stop
 * serving its cached answer. Without it Explorer keeps opening the old application
 * and the change looks like it did nothing.
 */
function notifyShellOfChange(): void {
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ShellNotify {
  [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);
  public static void AssociationsChanged() {
    // SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0x0000
    SHChangeNotify(0x08000000, 0x0000, IntPtr.Zero, IntPtr.Zero);
  }
}
'@
[ShellNotify]::AssociationsChanged()
`
  // A failure here is not worth reporting: the registry is correct either way, and the
  // change takes effect at the next logon.
  void runQuiet('powershell', ['-NoProfile', '-NonInteractive', '-Command', script])
}
