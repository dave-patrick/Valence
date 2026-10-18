/**
 * Where the preload bundle lives, relative to the compiled main bundle.
 *
 * This is separated out because it is the one value in the app that can disagree with the
 * bundler without anything complaining. The electron-vite scaffold shipped
 * `../preload/index.mjs`; this project sets `"type": "module"`, so electron-vite emits
 * `index.js` instead. The mismatch is invisible in dev -- the dev server serves the preload
 * from its own location and rewrites the path -- and fatal in a packaged build, where the
 * main process asks Electron for a file that is not there.
 *
 * Electron logs "Unable to load preload script" and carries on. The window opens, the editor
 * renders, and every feature that needs the filesystem -- open, save, workspace, export,
 * version history, pasted images -- is dead, because the context bridge never ran. Nothing in
 * the UI reports that.
 *
 * `preloadFilename` is asserted against the build output in `test/bundle.test.ts`.
 */

import { isAbsolute, join } from 'node:path'

/**
 * Matches electron-vite's output for this project. With `"type": "module"` in package.json
 * the ESM bundle is written as `.js`; `.mjs` would be right only for a CommonJS project.
 */
export const preloadFilename = 'index.js'

export function preloadPath(mainDir: string): string {
  return join(mainDir, '..', 'preload', preloadFilename)
}

/**
 * Where a path from the renderer actually lives.
 *
 * Absolute paths are real files the user chose, and are returned untouched. Relative paths
 * are the app's own scratch state -- settings, session -- and belong in the per-user data
 * directory.
 *
 * Node would resolve those against `process.cwd()`, which is wherever the app happened to be
 * launched from. That scattered `valence.settings` into the launch folder, and launching from
 * somewhere read-only (Program Files, the root of a drive) meant settings could not be saved.
 */
export function resolveDataPath(path: string, userDataDir: string): string {
  if (isAbsolute(path)) return path
  return join(userDataDir, path)
}