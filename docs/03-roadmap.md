# Roadmap

What is built, what is deliberately deferred, and why. Every item traces to a finding in
[`01-reverse-engineering.md`](./01-reverse-engineering.md).

---

## Where the project actually is

**Done and tested:**

| Area | State |
|---|---|
| Layered architecture with an enforced purity boundary | `test/purity.test.ts` fails the build on violation |
| Lossless markdown ⇄ block-state parse/serialise | `test/roundtrip.test.ts`, 48 cases + 120-document fuzz |
| CommonMark, GFM, footnotes, front matter, tables, math, diagrams | covered |
| **M1.1 Hidden syntax markers** | `test/markers.test.ts`, 8 tests; verified live in a browser |
| **M1.2 Math and diagram atoms** | `test/nodes.test.ts`, 11 tests; KaTeX verified live |
| **M1.3 Table editing** | `test/table.test.ts` + `test/tableToolbar.test.ts`, 19 tests |
| Editor shell -- hybrid / source / split over one document | `test/app.smoke.test.ts` drives real view switches |
| Read + export pipeline (Shiki, KaTeX, Mermaid) | renders in split view |
| Design system: tokens, typography, light/dark, strata gutter | `src/renderer/src/styles/` |
| Prose-only word count + reading time | `src/features/stats/` |
| Platform abstraction, Electron impl, browser fallback | renderer never imports `electron` |
| Electron main process, preload bridge, menu, PDF export | `src/main/`, `src/preload/` |
| electron-builder packaging config for mac/win/linux | `package.json` -> `build` |

95 tests passing, typecheck clean, production build succeeds.

### M1.1 -- what it does

Markers are ProseMirror widget decorations, not DOM mutations. The rule:

- markers in the block containing the caret are shown; every other block is clean;
- openers render in mark order and closers in reverse, so `**bold *and italic* **` reveals
  as valid Markdown rather than four asterisks where the document has four;
- they are `contenteditable=false`, so the caret steps over them;
- they are erased by any state update and can never reach the save path or undo history.

Typing here is the whole reason this is decorations and not a reconciler: MarkText's crashes
([#2800](https://github.com/marktext/marktext/issues/2800), #4346, #4654) all trace to
reconciling inside contenteditable.

### M1.2 -- what it does

`mathBlock`, `inlineMath` and `diagram` are **atoms holding their source in an attribute**,
never as text content. A NodeView renders the output; a textarea reveals the source on
demand and writes back through `setNodeMarkup`. `contentDOM: null`, so the caret can never
land inside KaTeX's or Mermaid's generated markup.

Invalid LaTeX renders in red rather than throwing -- a half-typed formula must degrade, not
blank the document.

### M1.3 -- what it does

MarkText's table tooling is the best in either reference app, and it was the largest gap.

- **Toolbar** floating above whichever table holds the caret: insert/delete row, insert/delete
  column, merge/split, delete table, and alignment cycling `default -> left -> centre -> right`.
- **Header toggles** for row and column. A column counts as a header only when *every* cell in
  it is one, which is the condition GFM actually writes to disk.
- **Chessboard picker** -- the control people miss most elsewhere. A 7x7 grid of sizes 2-8
  where hovering paints the shape before you click it, with a live `rows x cols` readout.
- **Column resize** handles, `contenteditable=false` and `pointer-events:none` so they can be
  neither selected nor serialised.

`tableContext()` derives the caret's row, column and alignment from position arithmetic rather
than `$sel.index(depth)` -- the latter returns the index of the node *at* that depth within its
parent, which is one level too high for the row and depends on caret depth. That bug reported
column 0 for every cell in the table; it is the reason `test/table.test.ts` asserts each cell
individually rather than one representative case.

---

## Verification status -- read this before trusting the visuals

Functional behaviour is verified three ways: 95 unit and integration tests, a jsdom mount
that drives the real app, and a live browser session reading computed styles from the
running app. That live session earned its keep -- it caught a bug no test could:

> **Tailwind v4 tree-shook the entire design token set.** `@theme` variables are only emitted
> when a generated utility references them, and this stylesheet reads tokens through raw
> `var()`, which does not count. Every token was dropped at build time and the prose silently
> fell back to **Times New Roman**. Unit tests and jsdom were both green throughout; only
> reading `getComputedStyle` from a real browser showed it.

**Not verified:**

| Area | Why |
|---|---|
| **Mermaid diagram sizing** | Mermaid measures via a scratch element; in this headless context it returns zero and emits its `width="400em"` fallback, producing a 400000-unit viewBox. The width guard holds (no overflow, capped inside the column), but the rendered diagram was never seen correctly sized. **Verify in a real window before trusting it.** |
| Screenshot / visual review | The browser tool requires a visible desktop window. Palette, type scale, measure, gutter and marker behaviour were confirmed via computed styles and DOM, but no one has laid eyes on the result. |
| Print / PDF pagination | Not exercised. |
| Pandoc export paths | Detected at runtime; Pandoc is not installed here. |
| Table toolbar via pointer | The component is tested against a real editor with real selections. Synthetic mouse events do not drive ProseMirror's `posAtCoords`, so clicking a `<td>` in an automated browser does not enter the table -- the toolbar's pointer behaviour is unverified end to end. |

The honest summary: **the architecture, the engine and the interaction model are tested. The
appearance is reasoned, not reviewed.**

---

## M1 -- Ship the editor people actually use

Sequenced so each step is independently useful.

## M1.3 - Tables (complete)

Every item from MarkText's model has shipped:

- **toolbar** floating above whichever table holds the caret: insert/delete row,
  insert/delete column, merge/split, delete table, alignment cycling
  default -> left -> centre -> right.
- **chessboard picker** - the control people miss most elsewhere. A 7x7 grid of sizes
  2-8 where hovering paints the shape before you click it, with a live readout.
- **header toggles** for row and column.
- **column resize** handles, `contenteditable=false` and `pointer-events:none` so they
  can be neither selected nor serialised.
- **column drag-to-reorder** with a drop indicator.


### M1.4 -- Smart paste and clipboard

Typora's behaviour: pasted HTML keeps its semantics (`<h1>` stays a heading) instead of
arriving as plain text. `htmlToBlocks` already handles this -- it needs wiring to a paste
handler plus `Copy as Markdown / HTML / Plain Text`.

Also: paste images from the clipboard straight into the document (both apps have this).

### M1.5 -- Focus and typewriter modes

Low cost, high perceived quality. Focus dims non-active paragraphs; typewriter pins the
current line to the vertical centre. Both are decorations on the existing editor.

---

## M2 -- ProseMirror state *becomes* the document

The architecture in [`02-architecture.md`](./02-architecture.md) fully realised. Replace
`htmlBridge.ts` with a direct block-state ⇄ ProseMirror mapping and delete the HTML
translation.

**Why it matters:** no HTML in the save path, no lossy intermediate, and editor state becomes
directly serialisable for collaborative editing later.

**How we know it worked:** the round-trip suite is unchanged and still green. That is the
contract.

---

## M3 -- Output

| Feature | Source | Notes |
|---|---|---|
| PDF with bookmarks | OS print pipeline | outline -> PDF bookmarks |
| HTML, images | native | already working |
| docx, odt, rtf, epub, LaTeX, MediaWiki | Pandoc | detect at runtime, one-click install, never hard-fail |
| Theme gallery + custom CSS | Typora | CSS-variable themes, drop-in import |

---

## M4 -- Organisation

File tree, file list, workspace-wide search with ripgrep, multi-tab sessions, workspace
restore. Typora's organisation model; MarkText's tab handling.

---

## M5 -- Beyond both

Neither reference app does these, and both would benefit:

- **Wiki links and backlinks.** `[[Note name]]` resolved against the vault, with a backlinks
  panel. The one thing people miss most when leaving Obsidian.
- **Session and version history.** Autosave snapshots with a diff view. Typora has history
  but no diff; a real diff is worth more than either.
- **Command palette.** One entry point for every command, so the menu bar stops being the
  only discoverable surface.
- **AI assistance, done honestly.** Rewrite, continue, and explain scoped to a selection --
  explicitly not "chat with your document", which is the feature that bloats editors.
- **Plugin API.** Muya's named-UI-registry pattern: plugins register named UI components and
  the editor dispatches events by name. `@muyajs/core` is the precedent that this is
  tractable.

---

## Explicitly not doing

- **Operational transform.** Muya's `ot-json1` choice. Single-user local editing gets nothing
  from it and pays in conflicts.
- **Hand-rolled inline lexer.** markdown-it's is decade-hardened and already handles the CJK
  flanking that cost MarkText three PRs.
- **CodeMirror 5.** Replaced by keeping ProseMirror as the only editing surface.
- **Telemetry, accounts, or sync.** Local-first, or it is a different product.

---

## Known build characteristic

Mermaid is already lazily `import()`ed, so a document with no diagram never downloads it --
Vite splits every diagram family into its own chunk. But once a document *does* contain one,
the whole Mermaid graph comes with it, including ELK (2.5 MB) and cytoscape (0.85 MB) for
diagram types most people never use.

Trimming that means importing `mermaid.core.mjs` and registering only the families we
support, so the rest stays out of the chunk graph entirely:

```ts
import mermaid from 'mermaid/dist/mermaid.core.mjs'
mermaid.registerExternalDiagrams([flow, sequence, class, state, er, gantt, pie, mindmap])
```

Worth doing before M1.4 ships: math and diagrams are the most visible feature in the app and
should not cost 3 MB of cold start.

---

## Test gates

CI fails on any of:

| Gate | Command |
|---|---|
| Round-trip drift | `pnpm test` |
| Purity boundary violation | `pnpm test` |
| Type errors | `pnpm typecheck` |
| App fails to mount or a view switch breaks | `pnpm test` |

The first two are the ones that matter. The rest is hygiene.
