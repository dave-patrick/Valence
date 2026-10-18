/**
 * Stage a build for hand testing.
 *
 * The release loop is: build here, put it where you can run it, you test it, and only then
 * does anything get tagged and pushed to GitHub. This script is the first half of that --
 * it produces a verified, unpacked, runnable app at C:\Users\davem\Valence by default, and
 * refuses to declare success unless the packaged app actually starts.
 *
 *   node scripts/stage-release.mjs [destination] [--no-build]
 *
 * `release/` and `out/` are wiped first. A stale artifact there once cost an afternoon: the
 * zip on disk was from a previous run, the probe reported against it, and the real fix was
 * not in the thing being tested.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_DEST = 'C:\\Users\\davem\\Valence'

let dest = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_DEST)
const skipBuild = process.argv.includes('--no-build')

const IS_WIN = process.platform === 'win32'

/**
 * Resolve a package's bin to its actual JavaScript entry and run it under Node.
 *
 * Two dead ends came first. `npx` puts the build behind an npm shell that hangs when launched
 * from a script. Spawning `node_modules/.bin/<tool>.cmd` with `shell: false` fails with
 * EINVAL, because Node no longer allows running .cmd without a shell -- and running it *with*
 * a shell is what the unescaped-args deprecation warning is about.
 *
 * Reading each package's own `bin` field avoids all three: no shell, no npm, and it keeps
 * working when a dependency reorganises its entry point.
 */
function binScript(pkgName) {
  const pkgJson = join(ROOT, 'node_modules', pkgName, 'package.json')
  if (!existsSync(pkgJson)) throw new Error(`missing ${pkgName} -- run pnpm install`)
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'))
  const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[pkgName]
  if (!entry) throw new Error(`${pkgName} declares no bin entry`)
  return join(ROOT, 'node_modules', pkgName, entry)
}

function runTool(pkgName, args) {
  return spawnClean(process.execPath, [binScript(pkgName), ...args], `${pkgName} exited`)
}

/** For things that are not npm packages: powershell, unzip, and our own verify script. */
function runCommand(command, args, label = command) {
  return spawnClean(command, args, `${label} exited`)
}

function spawnClean(command, args, onFail) {
  return new Promise((res, rej) => {
    const p = spawn(command, args, { cwd: ROOT, stdio: 'inherit', shell: false })
    p.on('error', rej)
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${onFail} with code ${code}`))))
  })
}

/** Node has no built-in unzip. PowerShell is the reliable option on Windows. */
async function extractZip(zipPath, target) {
  mkdirSync(target, { recursive: true })
  if (IS_WIN) {
    await runCommand('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${target}' -Force`,
    ], 'Expand-Archive')
  } else {
    await runCommand('unzip', ['-oq', zipPath, '-d', target], 'unzip')
  }
}

console.log(`\n  destination: ${dest}\n`)

if (!skipBuild) {
  console.log('  building...')
  rmSync(join(ROOT, 'release'), { recursive: true, force: true })
  rmSync(join(ROOT, 'out'), { recursive: true, force: true })
  await runTool('electron-vite', ['build'])
  await runTool('electron-builder', ['--win', '--x64', '--publish', 'never'])
}

const releaseDir = join(ROOT, 'release')
if (!existsSync(releaseDir)) throw new Error('release/ does not exist -- run without --no-build')

const zip = readdirSync(releaseDir).find((f) => f.endsWith('.zip'))
if (!zip) throw new Error('no .zip in release/ -- the build produced nothing to test')

/**
 * Prove the staged app.asar is the one that was just built.
 *
 * A Valence left running from an earlier session can hold app.asar mapped, Windows refuses
 * to replace it, and `Expand-Archive -Force` reports success anyway. The result is a folder
 * that looks fresh, passes every check, and runs the *previous* build -- which is how a fix
 * gets "verified" twice without ever being tested.
 *
 * Comparing digests of what we built against what we delivered closes that off.
 */
function assertStagedIsFresh(builtAsar, stagedAsar) {
  if (!existsSync(builtAsar)) return // only the zip target was built; nothing to compare
  if (!existsSync(stagedAsar)) throw new Error(`staged build is missing ${stagedAsar}`)

  const a = createHash('sha256').update(readFileSync(builtAsar)).digest('hex')
  const b = createHash('sha256').update(readFileSync(stagedAsar)).digest('hex')
  if (a !== b) {
    throw new Error(
      `staged app.asar does not match the build.\n` +
        `  built:  ${a}\n` +
        `  staged: ${b}\n` +
        `Something is holding the destination open. Close any running Valence and re-run.`,
    )
  }
  console.log('  staged build matches the artifact just produced')
}

console.log(`  extracting ${zip}...`)

// If a Valence from an earlier session holds app.asar locked, rmSync fails and
// neither deletion nor Expand-Archive -Force can replace it. The freshness
// proof below works on whichever folder we land in, so try a numbered
// alternative instead of extracting over a locked (possibly stale) build.
let attempt = 1
while (true) {
  try {
    rmSync(dest, { recursive: true, force: true })
    break
  } catch (e) {
    if (attempt > 10) {
      throw new Error(
        `cannot clear ${dest}: ${e.code ?? e.message}\n` +
          `Close any running Valence and re-run.`,
      )
    }
    const next = `${dest}-${attempt}`
    console.warn(`\n  ${dest} is locked; staging at ${next} instead\n`)
    dest = next
    attempt++
  }
}
await extractZip(join(releaseDir, zip), dest)
assertStagedIsFresh(
  join(releaseDir, 'win-unpacked', 'resources', 'app.asar'),
  join(dest, 'resources', 'app.asar'),
)

const exe = readdirSync(dest).find((f) => f.toLowerCase().endsWith('.exe'))
if (!exe) throw new Error('no executable in the extracted build')

console.log(`  verifying ${dest}\\${exe}...`)
await runCommand(process.execPath, [join(ROOT, 'scripts', 'verify-package.mjs'), join(dest, exe)], 'verify-package')

console.log(`\n  Ready to test: ${dest}\\${exe}\n`)
console.log('  Nothing has been pushed to GitHub. Tag and release when you are happy with it.\n')