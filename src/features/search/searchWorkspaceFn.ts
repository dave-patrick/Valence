import { useCallback, useEffect, useState } from 'react'
import type { ScannedFile } from '../workspace/scan'
import type { VaultFile } from '@core/wiki'

export interface WorkspaceHit {
  path: string
  line: number
  snippet: string
}

/**
 * Searches every document in the scanned vault.
 *
 * Case-insensitive substring, which is what a person types. Returning sorted by path then
 * line means the same query gives the same answer every time, which is the property any
 * search that takes a second to run needs if it is going to be trusted.
 */
export async function searchWorkspace(
  files: readonly VaultFile[],
  read: (path: string) => Promise<string | null>,
  query: string,
): Promise<WorkspaceHit[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const out: WorkspaceHit[] = []
  for (const f of files) {
    let text: string | null
    try {
      text = await read(f.path)
    } catch {
      text = null
    }
    if (text === null) continue

    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.toLowerCase().includes(q)) {
        // Trim and clamp the snippet length so a long line does not dominate the list.
        let snippet = lines[i]!.trim()
        const MAX = 88
        if (snippet.length > MAX) snippet = snippet.slice(0, MAX).trimEnd() + '…'
        out.push({ path: f.path, line: i + 1, snippet })
      }
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
  return out
}