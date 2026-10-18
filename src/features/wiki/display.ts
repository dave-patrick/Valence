/**
 * Human-facing name for a note.
 *
 * Both separators are handled because the renderer receives whatever path shape the
 * platform produced: Windows hands back `C:\notes\README.md`, everything else uses forward
 * slashes. Splitting on `/` alone meant the Windows build showed the entire absolute path
 * wherever a note name was expected -- in the backlinks panel's empty state it read
 * "Link to this note with [[C:\repos\Valence\README]]".
 */

import { basenameOf } from '@shared/path'

export function displayName(path: string | null): string {
  if (!path) return 'this note'
  return basenameOf(path).replace(/\.[^.]+$/, '') || path
}

export { stripExtension } from '@core/wiki'