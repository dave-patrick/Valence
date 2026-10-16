# Architecture & Design System -- Valence

## Part 1 -- System architecture

### 1.1 Layers

```
┌-┐
-  features/     outline · files · search · wordcount · focus  -
-                typewriter · export · themes                    -
├-┤
-  ui/           React shell · layout · sidebar · strata gutter -
├-┤
-  core/         ⚠ PURITY BOUNDARY -- no Node, no Electron      -
-                schema · markdown ⇄ prosemirror · render       -
-                extensions (math · diagram · codeblock · table)-
├-┤
-  platform/     fs · window · menu · dialogs · clipboard      -
-                interface only -- Electron impl, Tauri-ready   -
└-┘
```

**The purity boundary is the load-bearing rule.** Muya's best decision was making the editor
engine a package that could not reach for Electron or Node. We keep that, and enforce it:

- `src/core/**` may import only from `src/core/**` and `src/shared/**`.
- A test walks the import graph and fails the build on violation.

This is what makes the engine unit-testable, browser-testable, and eventually embeddable.

### 1.2 Why Electron, and how Tauri stays possible

Electron 44 -- both reference apps are Electron, MarkText itself is on 42. We get identical
Chromium in the renderer and the OS PDF/print pipeline for free.

But **the shell is behind an interface**, so the renderer never imports `electron` directly:

```ts
// src/platform/index.ts
export interface Platform {
  fs: { read, write, stat, watch, reveal }
  window: { setTitle, setDirty, onCloseGuard }
  dialog: { openFile, openFolder, confirm }
  menu: { build(spec) }
  clipboard: { read, write, writeImage }
  export: { toPdf, via(htm, format) }
}
```

A `TauriPlatform` implementing the same interface is ~200 lines. We do not ship it now --
Electron is the right call for feature density -- but the migration is additive, not a rewrite.

### 1.3 The editor core

**Single source of truth: the ProseMirror document.**

```
        ┌-┐
        -        ProseMirror document   ← single truth   -
        -   schema-validated · transactional · undoable -
        └-┬-┘
                        -  pure, round-trip tested
          ┌-┴-┐
          ▼                           ▼
  parseMarkdown()              serialiseMarkdown()
  src/core/markdown/parse      src/core/markdown/serialise
```

Markdown is a **serialisation of editor state**, not a parallel text buffer. This is the
correction to the flaw both reference apps share, and it is why mode switching, undo, and
round-trip fidelity all stop being problems.

### 1.4 Three views over one state

| View | Implementation | Cost of switching |
|---|---|---|
| **Hybrid** (default) | Inline markers hidden by decorations; blocks render live | none |
| **Source** | Raw-text node view, syntax highlighted, same doc | none |
| **Split** | Hybrid left, render pipeline right | none |

No export/import step. No conversion. Cursor, selection, scroll position, and undo history
survive by construction -- not by patch. (Typora shipped this as a bugfix in 1.13, 2026.)

### 1.5 Schema

Blocks mirror Muya's spec partition, with the Parent/Content insight preserved via a
discriminated union instead of sanctioned `any`:

```ts
type BlockKind =
  // CommonMark
  | 'paragraph' | 'heading' | 'blockquote' | 'bullet_list' | 'ordered_list'
  | 'list_item' | 'code_block' | 'thematic_break' | 'html_block' | 'setext_heading'
  // GFM
  | 'table' | 'table_row' | 'table_cell' | 'task_item'
  // Extensions
  | 'math_block' | 'diagram' | 'footnote' | 'front_matter'

type BlockState = { kind: BlockKind, attrs: BlockAttrs, content: InlineContent[] }
```

`BlockAttrs` is a mapped type keyed by `BlockKind`, so `attrs.lang` on a `code_block` is
type-checked and `attrs.lang` on a `paragraph` is a compile error. This is the exact hole
Muya documents in `block/types.ts`.

### 1.6 Rendering pipeline

```
markdown -> markdown-it -> block tokens -> renderer -> HTML
                                          ├- Shiki 4      (code, 200+ grammars)
                                          ├- KaTeX 0.19   (math, sync, fast)
                                          └- Mermaid 12   (diagrams)
```

Separate from the editor engine on purpose: editing needs exactness and speed, export needs
beauty and breadth. One pipeline cannot do both well.

### 1.7 Event bus

Muya's `EventCenter` pattern, preserved -- the editor emits, it never calls widgets:

```
content-change · selection-change · format-change
heading-activate · quick-insert · image-action · export-request
```

### 1.8 Testing strategy

| Layer | Method | Gate |
|---|---|---|
| `markdown/` | **Differential round-trip fuzz** over CommonMark + GFM suites | CI fails on drift |
| `schema/` | Invariant checks (no empty docs, attrs match kind) | unit |
| `core/` purity | Import-graph walk | CI fails on violation |
| Platform impls | Contract tests, one suite, both impls | unit |

The differential fuzz test is the direct lesson from MarkText. Muya has the best conformance
testing in either app -- the mistake was testing the *parser* rather than the *round-trip*.
Round-trip is where users lose their work.

---

## Part 2 -- Design system

### 2.1 Brief

A *writing instrument*. The subject is long-form text and the craft of setting it. The design
brief: **a tool that disappears while you write and is beautiful when you look at it.**

### 2.2 Colour -- valence and brass

The product is named after columnar valence: cold, dense volcanic rock veined with brighter
mineral. Cool slate neutrals carry the entire UI; **brass** is the single accent, used only
where the user acts or the document matters.

Deliberately rejected: cream/terracotta (the house default), near-black + acid green,
everything-same-border-radius card grids.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#F4F5F7` | `#131519` | Cool paper / valence |
| `--surface` | `#FFFFFF` | `#1A1D23` | Chrome, sidebar |
| `--surface-2` | `#EDEFF2` | `#21252C` | Hover, wells |
| `--ink` | `#1A1D23` | `#E6E8EC` | Body text |
| `--ink-2` | `#4A515C` | `#A8AFBB` | Secondary text |
| `--ink-3` | `#79808C` | `#6E7683` | Tertiary, hints |
| `--rule` | `#DFE2E7` | `#2A2F37` | Hairlines |
| `--brass` | `#A8762A` | `#D9A44B` | **Accent** |
| `--brass-soft` | `#F3E8D5` | `#2E2619` | Accent wash |
| `--sage` | `#4A7C59` | `#6FA37D` | Success, saved |

Light mode is a **cool white**, not cream -- cream belongs to the serif-magazine cliché we are
rejecting. Contrast: body text >= 12:1, secondary >= 5.5:1, all interactive states visible
without relying on hue.

### 2.3 Type

| Role | Family | Rationale |
|---|---|---|
| Prose | **Newsreader** (variable, optical size) | Designed for screen reading. Real personality without decoration. Optically sized so 16px at body and 28px at H1 are both correct. |
| UI | **Geist Sans** | Technical, slightly narrow, not Inter. Small sizes stay legible. |
| Code | Shiki-managed | Grammar-driven, never a UI decoration. |

Scale follows *The Elements of Typographic Style* -- body 19px/1.65 for long-form writing,
measure capped at **68 characters**, serif gets extra leading.

**No monospace is used for UI labels**, and no labels are set in all caps. Meta strings are not
joined with middots. There are no eyebrows above headings. Interface text is sentence case.

### 2.4 Layout

```
┌-┬-┬-┬-┐
- r  -  sidebar     -                                     - inspector-
- a  -              -        ▓ the column ▓               -          -
- i  -  files       -   68ch measure, centred             -  words   -
- l  -  outline     -                                     -  chars   -
-    -  search      -   ║ strata gutter ║                 -  reading -
-    -              -                                     -  time    -
├-┴-┴-┴-┤
-  status:  path · words · mode · saved                         1,204 -
└-┘
```

- Rail: 48px, icon-only, always visible.
- Sidebar: resizable, collapsible.
- Prose column: centred, 68ch, generous top/bottom.
- Inspector: collapsible right panel.
- Status bar: 24px, bottom, quiet.

### 2.5 The signature -- the strata gutter

**This is the one bold move.** A 3px strip at the left edge of the prose column, showing
document position and heading nesting as stacked horizontal ticks -- like the columnar
jointing of valence. Clicking a tick jumps to that section.

It is genuinely functional (position + navigation), it encodes real information rather than
decorating, and it is not a device any Markdown editor has. Everything else stays quiet so
this element reads as the identity of the product.

### 2.6 Motion

Almost none, and all of it answers an action:

| Trigger | Motion |
|---|---|
| Sidebar resize | live, no easing |
| Theme switch | 180ms cross-fade |
| Floating toolbar / picker | 120ms fade + 4px rise |
| Save confirmation | brass rule sweeps the gutter once |

`prefers-reduced-motion: reduce` removes all of it. No entrance animations, no scroll-triggered
reveals, no hover transitions on static cards.

### 2.7 Quality floor

- Responsive to 380px -- sidebar and inspector collapse, the column never breaks.
- Visible focus: 2px brass ring, 2px offset, on every interactive element.
- Full keyboard path; all commands reachable without a mouse.
- Respects `prefers-color-scheme` on first run.
- No network calls. No telemetry. Files never leave the machine.