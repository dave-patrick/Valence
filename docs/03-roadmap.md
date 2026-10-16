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
| **M1.4 Smart paste and clipboard images** | `test/paste.test.ts`, 19 tests |
| **M1.5 Focus and typewriter modes** | `src/core/editor/viewModes.ts`; both were dead settings toggles before this |
| **M3 Export** | `test/export.test.ts`, 28 tests; PDF via print, Pandoc for the rest |
| **M4 Workspace file tree** | `test/tree.test.ts` + `test/path.test.ts`, 49 tests |
| Session restore, including files deleted since last run | `test/session.test.ts`, 34 tests |
| Editor shell -- hybrid / source / split over one document | `test/app.smoke.test.ts`, 17 tests |
| Read + export pipeline (Shiki, KaTeX, Mermaid) | renders in split view |
| Design system: house tokens shared with Quantos | `src/renderer/src/styles/tokens.css` |
| Prose-only word count + reading time | `src/features/stats/` |
| Platform abstraction, Electron impl, browser fallback | renderer never imports `electron` |
| Electron main process, preload bridge, menu, PDF export | `src/main/`, `src/preload/` |
| electron-builder packaging config for mac/win/linux | `package.json` -> `build` |

354 tests passing, typecheck clean, production build succeeds.

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

Functional behaviour is verified three ways: 354 unit and integration tests, a jsdom mount
that drives the real app, and a live browser session reading computed styles from the
running app.

**A method note, because it will mislead anyone repeating this.** In a headless browser, CSS
transitions do not tick. `getComputedStyle` therefore returns the *pre-transition* value for
any element carrying `transition-colors`, and colour measurements on those elements are
worthless. Freezing transitions before auditing is not optional — a full contrast audit of
the sidebar and tab bar reported eleven failures at ratios as low as 1.05, and every one of
them vanished the moment transitions were disabled. Nothing was wrong with those colours.

### What the live session found that no test could

Four defects, all invisible to unit tests and jsdom, all now fixed:

> **Tailwind had never run.** `@tailwindcss/vite` was not a dependency and not registered in
> either Vite config, so `@import 'tailwindcss'` expanded to nothing and every utility class
> in the JSX was an inert string. Zero utilities existed in the output. Not one layout rule
> applied: the rail, sidebar and status bar stacked as block elements and the document column
> was not centred. An element with `className="flex h-full flex-col"` computed
> `display: block`.

> **The CSP blocked Shiki outright.** `script-src 'self'` forbids WebAssembly instantiation,
> and Shiki's TextMate grammar engine is WebAssembly. `renderToHtml` therefore rejected at the
> highlighter — so syntax highlighting had *never* worked, and the read pane had no error
> handling, so it presented as a permanently blank preview. Fixed with `'wasm-unsafe-eval'`,
> which permits WASM compilation without permitting `eval()` of JavaScript strings.

> **Diagram rendering was unreachable dead code.** `isDiagram()` existed and was never called;
> every fence went through Shiki, so a ```mermaid block rendered as a highlighted code sample.
> The `findDiagrams` regex that was supposed to catch the output also matched on `-->` and so
> would have broken on any Mermaid arrow (`A-->B`) had it ever run. Both are gone: diagrams are
> now recognised from the structured fence list and replaced by index, with no regex.

> **The read pane waited on Mermaid before showing anything.** One diagram in a plain document
> meant the whole reader stayed blank while a multi-megabyte graph library loaded. `renderToHtml`
> now returns the prose immediately with placeholders and hands back `hydrated` separately, so
> the reader paints first and diagrams patch in when they land. Export still awaits hydration,
> because a placeholder in a PDF is a bug.

The pattern across all four: **a failure that produces nothing is the one that survives.** The
CSP rejection, the dead render path, the blocking await — each one had no test because each one
produced silence rather than a wrong answer. `renderToHtml` now has an error surface, and the
read pane says so instead of staying blank.

**Not verified:**

| Area | Why |
|---|---|
| **Mermaid diagram output** | The prose-and-placeholder path is verified: prose renders, the placeholder holds the right height, no error. Mermaid itself never finished loading in dev — Vite serves its graph (mermaid, ELK, graphlib, cytoscape) unbundled and one module at a time, so the diagram stayed pending for minutes. Needs a check against a packaged build. |
| **Mermaid diagram sizing** | Same reason, and it was already unverified before. |
| Screenshot / visual review | Available intermittently; the desktop window loses visibility. Layout, overflow, contrast and geometry were confirmed by measurement instead, across both themes and all three view modes. |
| Print / PDF pagination | Not exercised. |
| Pandoc export paths | Detected at runtime; Pandoc is not installed here. |
| Table toolbar via pointer | The component is tested against a real editor with real selections. Synthetic mouse events do not drive ProseMirror's `posAtCoords`, so clicking a `<td>` in an automated browser does not enter the table -- the toolbar's pointer behaviour is unverified end to end. |

The honest summary: **the architecture, the engine and the interaction model are tested, and
the layout is measured. The rendered appearance of a diagram is still unverified, and nobody
has laid eyes on a packaged build.**

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


### M1.4 -- Smart paste and clipboard (complete)

Pasted HTML keeps its semantics: `<h2>` arrives as a heading, a `<ul>` as a list, a table as a
table. The clipboard's HTML flavour is preferred over its plain-text flavour, and absolute
links are rewritten relative to the current document. Web URLs, already-relative links and
anchors are left alone.

Clipboard images are written beside the document and inserted as a relative-path image. The
name is timestamped and checked against what is already in the folder, so two pastes in the
same second do not overwrite each other. This needed a new `writeBinary` on the `Platform`
contract, implemented in Electron, Node and the browser fallback.

`Copy as Markdown / HTML / Plain Text` is **not** done.

The tests for this found a bug that had nothing to do with paste: `htmlToBlocks` treated
every element that was not a `<div>` as loose inline content and never wrapped it, so
clipboard HTML arriving as a bare inline fragment — a lone `<a>`, a `<strong>` run — was
flattened to plain text with every mark discarded. That is precisely the failure smart paste
exists to prevent, and it was live in the HTML bridge before this feature existed.

### M1.5 -- Focus and typewriter modes (complete)

Focus dims non-active paragraphs; typewriter pins the current line to the vertical centre.

Both were settings that did nothing before this. They are decorations driven off the active
paragraph in `src/core/editor/viewModes.ts`, off the same flags the settings panel writes.

The focus-mode CSS deliberately has **no transition**. ProseMirror re-creates decorated nodes
on every transaction, so a transition restarts constantly and reads as flicker.

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

## M3 -- Output (mostly done)

| Feature | Source | State |
|---|---|---|
| PDF | OS print pipeline | **done** — uses the same HTML split view renders |
| HTML, plain text | native | **done** |
| docx, odt, epub, LaTeX, MediaWiki | Pandoc | **done** — detected at runtime, disabled with a reason when absent |
| Theme gallery (via Custom CSS) | Typora | **done** — custom CSS injected live, house variables available |

Pandoc availability is checked before the dialog offers anything, so a missing binary shows
up as a disabled entry with its reason attached rather than an error at click time. The
Pandoc target name is mapped separately from our own format id — `latex` is `latex` to
Pandoc but `.tex` on disk, and passing our id through silently produces a wrong file rather
than an error. That mapping is asserted in `test/export.test.ts` rather than trusted at the
call site.

Export is `Ctrl/Cmd+E`.

---

## M4 -- Organisation (done)

| Feature | State |
|---|---|
| File tree | **done** — collapsible, directories before files, active file highlighted |
| Tree search | **done** — filters the tree rather than listing flat matches |
| Multi-tab sessions | **done** — reordering, dirty state, session restore |
| File list view | **done** |
| Workspace-wide search | **done** — substring over all documents |
| Workspace restore | **done** — workspace root plus session tabs |

The tree search filters rather than replacing the view on purpose: you reason about where a
note lives by its folder, so the folder structure has to survive you typing.

The tree is rooted at the **active document's folder**, not at a chosen workspace. That is a
deliberate simplification — Typora and MarkText both make you pick a workspace first — and
it is the main thing to revisit if multi-folder vaults matter.

---

## M5 -- Beyond both

Neither reference app does these, and both would benefit:

- ~~**Command palette.**~~ **Done.** `Ctrl/Cmd+P`. One registry drives the menu, the keyboard
  and the palette, so a command cannot exist in one and be missing from another. The matcher is
  a real search over all valid alignments rather than the usual greedy walk — greedy leftmost
  matches the wrong span ("pdf" matches the *p* in "Ex**p**ort as P**DF**"), and greedy
  best-scoring strands the rest of the query ("pd" picks the *p* of "paste", which has no *d*
  after it). Both are pinned in `test/commands.test.ts`.
- **Wiki links and backlinks.** `[[Note name]]` resolved against the vault, with a backlinks
  panel. The one thing people miss most when leaving Obsidian. Blocked on a real workspace
  concept — the tree is currently rooted at the open document's folder.
- **Session and version history.** Autosave snapshots with a diff view. Typora has history
  but no diff; a real diff is worth more than either.
- **AI assistance, done honestly.** Rewrite, continue, and explain scoped to a selection --
  explicitly not "chat with your document", which is the feature that bloats editors.
- **Plugin API.** Muya's named-UI-registry pattern: plugins register named UI components and
  the editor dispatches events by name. `@muyajs/core` is the precedent that this is
  tractable. The command registry is a reasonable first step toward it.

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
