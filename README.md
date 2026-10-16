# Valence

A local-first Markdown editor. Typora's seamless reading experience, MarkText's editor depth,
on a modernised foundation.

MIT.

---

## Why this exists

Typora and MarkText look like rivals. They are not -- they share a hidden architectural flaw,
and fixing it is the whole idea here.

**Both treat "source text" and "rendered view" as two separate representations, and convert
between them whenever the view changes.** MarkText does it with operational transforms
against its block tree; Typora does it by exporting the document and re-importing it. Either
way the conversion is lossy -- which is why *both* have spent years fixing cursor and scroll
position jumping when you switch modes. Typora shipped that fix in 1.13, in 2026.

Valence inverts it:

```
        ┌-┐
        -        ProseMirror document  ← single truth  -
        -   schema-validated · transactional · undoable -
        └-┬-┘
                        -  pure functions, both directions
          ┌-┴-┐
          ▼                           ▼
   parseMarkdown()              serialiseMarkdown()
   (on open / import)            (on save)
```

Markdown is a **serialisation of editor state**, not a parallel text buffer. Hybrid view,
source view, and split view are then just three renderings of one thing -- switching is free,
and cursor, selection, scroll and undo survive by construction rather than by patch.

Everything else follows from taking each project's good decisions seriously:

| Taken from | What |
|---|---|
| **Typora** | theme ecosystem, Pandoc export breadth, outline/files/search, word count, smart paste, MathJax-class math, Mermaid, focus & typewriter modes |
| **MarkText** | the block-structured core, the Parent/Content split, the virtualising `ScrollPage`, the named UI-component registry, CommonMark+GFM conformance in CI, and their table/image interaction tooling |
| **Neither** | the editor engine. ProseMirror owns the contenteditable, so IME, selection and undo stop being a permanent bug class |

The full analysis, with evidence and issue references, is in
[`docs/01-reverse-engineering.md`](docs/01-reverse-engineering.md).

---

## Running it

```bash
pnpm install
pnpm dev          # Electron
pnpm dev:web      # renderer in a browser, backed by the in-memory platform
pnpm test         # round-trip + purity + app smoke
pnpm typecheck
```

`pnpm dev:web` exists because the editor core must never need a shell to work -- it runs
against a `localStorage` platform implementation, which also makes the UI easy to iterate on.

---

## Architecture

```
src/core/       ⚠ PURITY BOUNDARY -- no Node, no Electron, no React
                types.ts · markdown/ (parse ⇄ serialise) · render/ · editor/ · htmlBridge.ts
src/platform/   fs · window · dialog · menu · clipboard · export
                interface only -- Electron impl, Tauri-ready, browser fallback
src/ui/         React shell -- Rail · Sidebar · StrataGutter · Inspector · StatusBar
src/features/   outline · stats
src/main/       Electron main process
src/preload/    the entire renderer->OS surface
```

**The purity boundary is the load-bearing rule.** Muya's best decision was making the editor
engine a package that could not reach for Electron or Node. We keep that and promote it from
convention to a build gate: `test/purity.test.ts` walks the import graph and fails CI if
`src/core/**` imports anything outside itself and `src/shared/**`.

---

## Design

Columnar valence: cold slate stone veined with brass.

| Token | Light | Dark |
|---|---|---|
| Background | `#F4F5F7` | `#131519` |
| Surface | `#FFFFFF` | `#1A1D23` |
| Ink | `#1A1D23` | `#E6E8EC` |
| Rule | `#DFE2E7` | `#2A2F37` |
| Accent (brass) | `#A8762A` | `#D9A44B` |

Prose is **Newsreader** (variable, optical size) at 19px/1.65 on a 68-character measure. UI is
**Geist Sans** -- deliberately not Inter. Syntax highlighting is grammar-driven via Shiki and
never doubles as decoration. No monospace labels, no all-caps eyebrows, no middot-joined meta
strings, no uniform grid of rounded cards.

The one bold move is the **strata gutter** -- a 3px strip at the edge of the column showing
document position and heading nesting as stacked ticks, like the columnar jointing of valence.
It is clickable, so it is navigation rather than ornament. Everything around it stays quiet.

Full rationale in [`docs/02-architecture.md`](docs/02-architecture.md).

---

## Testing

307 tests, all passing. The five that matter:

**`test/roundtrip.test.ts`** -- `parse -> serialise` must be idempotent, across 48 hand-written
cases (CJK emphasis, nested mixed-type lists, setext headings, fences containing fences,
tables with escaped pipes, front matter that must not be confused with a thematic break) and
120 deterministically-seeded generated documents.

This is the direct lesson from MarkText. They were the only project of the two with real spec
conformance in CI, and the mistake was testing the *parser* when the thing that actually broke
both apps was the *round trip*. It found five genuine bugs during development, including an
off-by-one that silently ate every second heading.

**`test/purity.test.ts`** -- walks the import graph and fails the build if the editor core
reaches for Node, Electron, the platform layer, or React.

**`test/markers.test.ts`** -- moves a real selection through a real document and reads the
decoration set, rather than asserting a CSS class exists. Covers bold, italic, links, images,
nested runs, block exit, and the guarantee that markers never enter the serialised document.

**`test/table.test.ts` and `test/tableToolbar.test.ts`** -- assert each table cell
individually. That is not paranoia: `tableContext` originally used `$sel.index(depth)`, which
returns the index of the node *at* that depth within its parent. One level too high for the
row, and dependent on caret depth -- so it reported column 0 for every cell in the table while
the shape assertions still passed.

**`test/columnDrag.test.ts`** -- `reorderColumn` is pure, and it is the entire risk surface of
drag-to-reorder: getting it wrong silently shreds a table, and undo is not always a rescue.
Tested for direction, no-ops, out-of-range refusal, non-mutation of the source node, markdown
round-trip, and the case it *must* refuse -- a table whose rows have differing cell counts,
where "column 2" means something different per row.

**`test/app.smoke.test.ts`** mounts the real app in jsdom and drives view switches and theme
changes. It caught that TipTap's StarterKit ships no table, task-list or image extension --
so tables were silently flattening to plain text.

---

## What is verified, and what is not

Worth reading before trusting the appearance. Full detail in
[`docs/03-roadmap.md`](docs/03-roadmap.md#verification-status--read-this-before-trusting-the-visuals).

**Verified** -- 307 tests, a jsdom mount of the real app, and a live browser session reading
computed styles from the running application.

That last one earned its keep. It caught a bug nothing else could:

> **Tailwind v4 tree-shook the entire design token set.** `@theme` variables are emitted only
> when a generated utility references them, and this stylesheet reads tokens through raw
> `var()`, which does not count. Every token vanished at build time and the prose silently fell
> back to Times New Roman. Tests were green throughout.

**Not verified:**

- **Mermaid diagram sizing.** Mermaid measures via a scratch element; in the headless context
  available here that returns zero and Mermaid emits its `400em` fallback. A CSS guard caps
  the width so the layout is safe, but the diagram has never been seen correctly sized. Check
  it in a real window.
- **Visual review.** No screenshot was possible -- the browser tool needs a visible desktop
  window. Type scale, measure, palette, gutter and marker behaviour were confirmed via
  computed styles; the overall composition has not been laid eyes on.
- **Print/PDF pagination** and the **Pandoc export paths** (Pandoc is not installed here).

The honest summary: the architecture, engine and interaction model are tested. The appearance
is reasoned, not reviewed.

---

## Status

This is a design and scaffold, and the parts that carry the idea are real and tested:

**Built** -- the layered architecture with an enforced purity boundary; the lossless
markdown to editor-state round trip; hybrid / source / split views over one document;
hidden syntax markers; KaTeX math and Mermaid diagram atoms; the complete MarkText table
model (floating toolbar, chessboard picker, header toggles, resize handles, column
drag-to-reorder); tabs with configurable locations and session restore; the read and
export pipeline; the design system; prose-only word count; the swappable platform layer;
and the Electron shell with PDF export.

**Next** -- smart paste with clipboard images, then focus and typewriter modes. After that,
Pandoc export for the full format matrix, file-tree browsing, and the Tauri backend behind
the existing `Platform` interface.

Sequenced in [`docs/03-roadmap.md`](docs/03-roadmap.md).

**One honest compromise.** The ProseMirror document is not yet *the* source of truth --
`src/core/htmlBridge.ts` translates through HTML, because TipTap's schema and our block
schema are separate models today. The seam is isolated to two functions
(`blocksToHtml` / `htmlToBlocks`), both covered by the round-trip suite, so replacing it is a
change of implementation rather than of contract.

---

## Licence

MIT. MarkText and Muya are MIT and informed the architecture here; no Muya source is copied.
Typora is proprietary -- none of its code is used, only its documented behaviour is reimplemented.
