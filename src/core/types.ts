/**
 * Purity boundary: nothing in `src/core/**` may import Node, Electron, or `src/platform`.
 * Enforced by `test/purity.test.ts` (walks the import graph). This is the single most
 * important structural rule in the codebase — see docs/02-architecture.md §1.1.
 *
 * Allowed: ECMAScript, DOM/BOM, and imports that resolve inside `src/core` or `src/shared`.
 */

/**
 * The document is one of three discriminated shapes. A discriminated union is what makes
 * `attrs.lang` on a heading a compile error instead of `undefined` at runtime — the hole
 * MarkText documents as a sanctioned `any` in `block/types.ts`.
 */
export type BlockKind =
  // ── CommonMark ───────────────────────────────────────────────
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bullet_list'
  | 'ordered_list'
  | 'list_item'
  | 'code_block'
  | 'thematic_break'
  | 'html_block'
  // ── GFM ──────────────────────────────────────────────────────
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'task_item'
  // ── Extensions ───────────────────────────────────────────────
  | 'math_block'
  | 'diagram'
  | 'footnote'
  | 'front_matter'

export interface InlineSpan {
  text: string
  marks: InlineMark[]
}

export type InlineMark =
  | { type: 'strong' }
  | { type: 'emphasis' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'link'; href: string; title?: string }
  | { type: 'image'; src: string; alt?: string; title?: string }
  | { type: 'math'; display: false }
  | { type: 'footnote_ref'; id: string }
  | { type: 'sub' }
  | { type: 'sup' }
  | { type: 'mark' }

/** Per-kind attributes, keyed by kind so a wrong attribute name is a compile error. */
export interface BlockAttrs {
  heading: { level: 1 | 2 | 3 | 4 | 5 | 6; setext?: boolean }
  bullet_list: { tight: boolean; start?: never }
  ordered_list: { start: number; tight: boolean }
  list_item: { checked?: boolean | null; index: number }
  task_item: { checked: boolean; index: number }
  code_block: { lang: string; fenceChar?: '`' | '~'; meta?: string }
  table: { alignments: Array<'left' | 'center' | 'right' | null>; header: boolean }
  table_cell: { align: 'left' | 'center' | 'right' | null; header: boolean }
  math_block: { display: true }
  diagram: { kind: string; theme?: string }
  front_matter: { format: 'yaml' | 'toml' }
  html_block: {}
  blockquote: {}
  paragraph: {}
  thematic_break: {}
  table_row: {}
  footnote: { id: string; label: string }
}

/** Maps kind -> its attrs. `BlockState<"heading">` can only carry heading attrs. */
export type BlockState<K extends BlockKind = BlockKind> = {
  [P in K]: {
    kind: P
    attrs: BlockAttrs[P]
    /** Container blocks own child blocks; leaf blocks own inline spans. */
    children?: BlockState[]
    spans?: InlineSpan[]
  }
}[K]

export type AnyBlock = BlockState

export interface ParsedDocument {
  /** Verbatim front matter source, preserved byte-for-byte. */
  frontMatter: string | null
  blocks: AnyBlock[]
}

/** Result of a serialise pass. `text` is what gets written to disk. */
export interface SerialisedDocument {
  text: string
  /** Constructs that could not be represented losslessly, for the round-trip test report. */
  lossy: string[]
}