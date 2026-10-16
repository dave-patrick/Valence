import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPlatform } from '@platform'
import {
  buildTree,
  expandedFor,
  filterTree,
  isDocument,
  normalise,
  type TreeNode,
} from './tree'

interface FileTreeProps {
  /** Workspace root; the tree is relative to it. */
  root: string | null
  /** Path of the active document, highlighted in the tree. */
  activePath: string | null
  onOpen: (path: string) => void
  /** Called when the user asks to pick a workspace folder. */
  onWorkspaceOpen?: () => void
  onError: (message: string) => void
}

/**
 * Workspace browser.
 *
 * Typora's file tree, with the improvement that a search filters the tree rather than
 * listing flat matches — you keep the folder structure while you type, which is how you
 * reason about where a note lives.
 */
export function FileTree({ root, activePath, onOpen, onWorkspaceOpen, onError }: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!root) {
      setTree([])
      return
    }
    setLoading(true)
    try {
      // scanVault recurses correctly on the Electron platform, where listDir is shallow.
      // On the web fallback, listDir already returns everything, and scanVault's against-
      // the-root filter keeps only matching entries.
      const { scanVault } = await import('../workspace/scan')
      const files = await scanVault(root, (dir) =>
        getPlatform().fs.listDir(dir).then((xs) =>
          xs.map((e) => ({ path: e.path, isDirectory: e.isDirectory })),
        ),
      )
      // buildTree wants directory entries, but scanVault already collapsed those into paths.
      // Re-derive them: parent dirs of every file become implicit structure.
      const entries = files.map((f) => ({ path: f.path, isDirectory: false }))
      setTree(buildTree(root, entries))
    } catch {
      onError(`Could not read ${root}`)
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [root, onError])

  useEffect(() => {
    void load()
  }, [load])

  // A newly opened file reveals its own ancestors, so it is never hidden in a collapsed
  // folder the user cannot see.
  useEffect(() => {
    if (!activePath || !root) return
    setOpenDirs((prev) => expandedFor([activePath], prev))
  }, [activePath, root])

  const visible = useMemo(() => filterTree(tree, query), [tree, query])
  const expanded = useMemo(
    () => (query ? new Set<string>(collectDirs(visible)) : openDirs),
    [visible, query, openDirs],
  )

  const toggle = useCallback((path: string) => {
    setOpenDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  if (!root) {
    return (
      <div className="px-4 py-6 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        No folder open — pick one to browse its notes, or open a single file.
        {onWorkspaceOpen && (
          <button
            className="mt-3 block rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px]"
            style={{ background: 'var(--bg-active)', color: 'var(--ink)' }}
            onClick={onWorkspaceOpen}
          >
            Open workspace …
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
          className="w-full rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[12.5px]"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--line)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
      </div>

      {loading && <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>Reading folder...</p>}

      {!loading && !visible.length && (
        <p className="px-4 py-4 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          {query ? `Nothing matches "${query}".` : 'No documents in this folder yet.'}
        </p>
      )}

      <ul role="tree" aria-label="Workspace files" className="pb-4">
        {visible.map((node) => (
          <Row
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            activePath={activePath}
            root={root}
            onToggle={toggle}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </div>
  )
}

function Row({
  node,
  depth,
  expanded,
  activePath,
  root,
  onToggle,
  onOpen,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  activePath: string | null
  root: string
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}) {
  const pad = 10 + depth * 12

  if (node.kind === 'dir') {
    const open = expanded.has(node.path)
    return (
      <li role="treeitem" aria-expanded={open}>
        <button
          onClick={() => onToggle(node.path)}
          className="flex w-full items-center gap-1.5 py-[3px] text-left text-[12.5px] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
          style={{ paddingLeft: pad, color: 'var(--text-soft)' }}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.12s var(--ease)',
              flexShrink: 0,
            }}
          >
            <path d="M4 2.5 8.5 6 4 9.5" />
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
        {open && (
          <ul role="group">
            {node.children.map((child) => (
              <Row
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                activePath={activePath}
                root={root}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const active = normalise(node.path) === normalise(activePath ?? '')
  const childDocs = countDocuments(node)

  return (
    <li role="treeitem" aria-selected={active}>
      <button
        onClick={() => onOpen(node.path)}
        title={node.path}
        className="flex w-full items-center gap-1.5 py-[3px] text-left text-[12.5px] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
        style={{
          paddingLeft: pad + 11,
          color: active ? 'var(--accent)' : 'var(--text)',
          background: active ? 'var(--bg-active)' : undefined,
          fontWeight: active ? 500 : 400,
        }}
      >
        <span className="truncate">{node.name}</span>
        {childDocs > 0 && (
          <span className="ml-auto pr-2 text-[10.5px] tnum" style={{ color: 'var(--text-faint)' }}>
            {childDocs}
          </span>
        )}
      </button>
    </li>
  )
}

function collectDirs(nodes: readonly TreeNode[]): string[] {
  const out: string[] = []
  const walk = (list: readonly TreeNode[]) => {
    for (const n of list) {
      if (n.kind === 'dir') {
        out.push(n.path)
        walk(n.children)
      }
    }
  }
  walk(nodes)
  return out
}

function countDocuments(node: TreeNode): number {
  if (node.kind === 'file') return 1
  return node.children.reduce((n, c) => n + countDocuments(c), 0)
}