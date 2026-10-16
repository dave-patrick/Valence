/**
 * The editor schema.
 *
 * `StarterKit` covers paragraphs, headings, lists, quotes, rules, code and the basic marks,
 * but it ships **no tables, no task lists and no images** -- dropping Markdown into it
 * silently flattens those constructs to plain text. Those are first-class in CommonMark and
 * GFM, so they are declared here explicitly.
 *
 * The exported array is a factory rather than a constant because focus and typewriter mode
 * read live settings: their behaviour has to reach the editor at the moment it is created,
 * and a frozen list cannot carry a getter that tracks a settings change.
 */

import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import type { Extensions } from '@tiptap/core'
import { SyntaxMarkers } from './markers'
import { InlineMathNode, MathBlockNode, DiagramNode } from './nodes'
import { ColumnReorder } from './columnDrag'
import { ViewModes } from './viewModes'
import { ClipboardPaste, type ClipboardHooks } from './clipboard'

/** Live switches the editor reads through getters rather than captured values. */
export interface EditorModeFlags {
  focusMode: () => boolean
  typewriter: () => boolean
}

const MODES_OFF: EditorModeFlags = {
  focusMode: () => false,
  typewriter: () => false,
}

/** Flags default to off so tests and any headless use can construct an editor directly. */
export function createExtensions(
  modes: Partial<EditorModeFlags> = {},
  clipboard?: ClipboardHooks,
): Extensions {
  const flags: EditorModeFlags = { ...MODES_OFF, ...modes }
  return [
    // Markers are decorations over document state, independent of the schema, but listing
    // them first keeps the intent obvious to a reader.
    SyntaxMarkers,

    ViewModes.configure({
      focus: flags.focusMode,
      typewriter: flags.typewriter,
    }),

    // Column drag-to-reorder. Its mouse handling runs through `handleDOMEvents`, so ordering
    // in the list does not change when it sees a press relative to the other extensions.
    ColumnReorder,

    // Only present when the app can actually write images; without a platform that would
    // fail silently on every paste.
    ...(clipboard ? [ClipboardPaste(clipboard)] : []),

    // Math and diagram atoms. Their source lives in an attribute, never as text content, so
    // the document model stays a model rather than a pile of rendered markup.
    InlineMathNode,
    MathBlockNode,
    DiagramNode,

    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      codeBlock: { HTMLAttributes: { class: 'valence-codeblock' } },
      // Horizontal rules round-trip through `blocksToHtml` as `<hr>`; StarterKit's default
      // already matches, so no translation layer is needed.
    }),

    // Task lists. `nested: true` because GFM permits a task item to contain other tasks, and
    // MarkText's #4341 was exactly this case regressing.
    TaskList,
    TaskItem.configure({ nested: true }),

    // Markdown images are inline constructs -- `![alt](src)` can sit mid-sentence -- so the
    // node must be inline or it cannot live inside a paragraph and the marker pass cannot
    // reach it.
    Image.configure({ inline: true, allowBase64: true }),

    Table.configure({ resizable: true, allowTableNodeSelection: true }),
    TableRow,
    TableHeader,
    TableCell,
  ]
}