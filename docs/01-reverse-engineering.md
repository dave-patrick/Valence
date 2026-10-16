# Reverse-Engineering Report: Typora & MarkText

**Date:** 2026-10-15
**Method:** Public source + documentation analysis (no local binaries were available).
**Sources:** `marktext/marktext@develop` (v0.22.0-dev, MIT), `typora.io`, `support.typora.io`.

---

## 1. Correction to the common framing

Most comparisons say *"Typora is the polished one, MarkText is the free clone."* That framing
is out of date and it misdescribes the engineering.

MarkText's `develop` branch is **not** the abandoned project the web still describes. It is:

| | Detail |
|---|---|
| Version | `0.22.0-dev` |
| Structure | pnpm monorepo -- `packages/desktop`, `packages/muya`, `packages/website` |
| Toolchain | TypeScript 6, Vue 3.5, Pinia 4, Vite 8, electron-vite 5, Electron 42 |
| Editor engine | Extracted to **`packages/muya`**, published as **`@muyajs/core`** |
| Conformance | `test/spec/` runs the CommonMark and GFM spec suites as a CI gate |

The legacy JavaScript Muya engine has been fully retired (`#4257`). The remaining legacy
`muya/*` alias was removed once nothing referenced it.

**So the real comparison is not "good app vs. clone."** It is:

- **Typora** -- a closed-source *rendering-first* product with the deepest feature surface and
  the best-in-class theme ecosystem, built on an undocumented hybrid-DOM engine.
- **MarkText** -- an open *architecture-first* project whose real contribution is the extracted
  editor core, built with a well-modelled block system that carries visible technical debt.

The interesting work is not picking a winner. It is **extracting each one's genuinely good
decisions and discarding the parts each got wrong.**

---

## 2. Typora -- what the binary reveals

Typora ships no source. Analysis is behavioural, from official docs, changelogs, and the
public issue tracker.

### 2.1 The engine: "hybrid view"

Typora's defining move is a single contenteditable pane where **inline** syntax renders the
instant it closes and **block** syntax renders on Enter. Markdown markers are real characters
in the DOM, shown and hidden by CSS on selection/focus.

The maintainer's own words on its limits (issue #3170):

> "Source code mode is designed as a **temporary workaround** in Typora, we will not put much
> effort on improving the source code mode, so we will not make it default."

Confirmed structurally by Typora's own dev changelog -- only in **1.13** (2026) did they ship
*"view switch between source code mode and hybrid editing mode preserves scroll position."*
Three years of users filing that exact bug.

**Verdict:** the hybrid-view *concept* is excellent and is the single best idea in either app.
The *implementation* -- hand-managed contenteditable DOM -- is the root cause of its long tail
of selection, IME, and scroll-sync bugs. Keep the concept, replace the engine.

### 2.2 Where Typora is genuinely ahead

- **Themes.** A CSS-driven theme system with a large community gallery (`theme.typora.io`).
  Typora's own docs frame it as a feature: *"Use your own css code... auto-numbering headers."*
  This is the strongest single feature in either product.
- **Export breadth.** Pandoc-backed: PDF (with bookmarks), HTML, docx, odt, rtf, epub, LaTeX,
  MediaWiki, and images.
- **Organisation.** File *tree*, file *list*, *outline*, and workspace-wide search.
- **Math.** MathJax v4 (upgraded in 1.13) with mhchem, AMSmath, BBox, and equation
  auto-numbering.
- **Diagrams.** Mermaid 11.13 -- Venn, Ishikawa, plus everything below that.
- **Writing aids.** Word count (words/chars/lines/reading time), focus mode, typewriter mode,
  RTL, auto-save, version history, spell-check, i18n.
- **Clipboards.** Smart paste (HTML -> preserves semantics), Copy as HTML / Markdown / Plain.
- **Images.** Drag-drop, resize, relative path, `typora-root-url`, cloud upload.

### 2.3 Where Typora is weak

- Source mode is explicitly unmaintained by policy.
- No split view. Deliberate, but it forecloses a workflow half the audience wants.
- No API for anything except CSS themes.
- Closed source and paid -- no plugin ecosystem is possible.
- Paid licences are per-device (3 devices) with no floating option.

---

## 3. MarkText / Muya -- the architecture, from source

This is the part worth stealing. Verified against the actual tree.

### 3.1 Package layout

```
packages/muya/src/
  muya.ts          new Muya(el, opts) -- swaps el for a contenteditable div,
                   then constructs EventCenter, Editor, Ui, I18n
  index.ts         public API
  editor/          JSONState, InlineRenderer, Selection, Search, Clipboard,
                   History, ScrollPage. Owns activeContentBlock; routes DOM events
  block/
    commonMark/    atxHeading, setextHeading, blockQuote, bulletList, orderList,
                   listItem, codeBlock, html, paragraph, thematicBreak, headingCopyLink
    gfm/           table, taskList, taskListItem, taskListCheckbox
    extra/         diagram, footnote, frontmatter, math
    content/       the inline leaf blocks -- paragraphContent, codeBlockContent,
                   tableCell, thematicBreakContent, langInputContent
    scrollPage/    root virtual scroller
    base/linkedList/
    blockTransforms.ts   markdown AST -> block state
  inlineRenderer/  custom lexer + rules -> snabbdom vdom -> snabbdom-to-html
  ui/              23 registered UI components
  utils/           diagram/, marked/, prism/, turndownService/
```

### 3.2 The genuinely good decisions -- keep these

**a. The engine is a standalone, dependency-pure package.**
`@muyajs/core` uses *only* JS, DOM, and BOM. No Electron, no Node. It has its own examples
app and a Playwright E2E host page. This is why it can be unit-tested in isolation and why
the CommonMark/GFM suites can run in CI against it.

> **Take:** enforce a hard purity boundary on the editor core. Ours: `src/core/` may import
> nothing from `src/platform/` or `src/main/`. Enforce it with a lint rule, not a comment.

**b. Parent / Content block split.**
Container blocks (`listItem`, `blockQuote`, `table`) are separated from inline leaf blocks
(`paragraphContent`, `tableCell`). A list item and the paragraph inside it are *different
block types* with different keydown behaviour. This is a real insight most editors get wrong.

**c. Doubly-linked list for the block tree** (`block/base/linkedList`) -- O(1) sibling
traversal, and cheap insertion.

**d. `ScrollPage` -- a virtualising root.** Only visible blocks are materialised. Documents
tens of thousands of lines long stay responsive.

**e. A named UI-component registry** (`src/ui/ui.ts`, 23 components). The editor talks to
`Ui`, not to widgets. This is what makes the plugin surface tractable.

**f. Pure round-trip functions.** `markdownToState()` and `stateToMarkdown()` are the single
source of truth for document representation. Testable without a DOM.

**g. A real spec-conformance suite** in CI as the quality gate.

**h. Rich interaction surface.** The 23 UI components include `tableChessboard`,
`tableColumnToolbar`, `tableDragBar`, `tableRowColumMenu`, `imageResizeBar`,
`paragraphQuickInsertMenu`, `linkTools`, `footnoteTool`, `codeBlockLanguageSelector`,
`emojiSelector`. **MarkText's tables and image tooling are years ahead of Typora's.**

**i. Diagram breadth beyond Mermaid** -- KaTeX, Prism, Mermaid, **Vega / Vega-Lite**,
PlantUML.

### 3.3 The technical debt -- do not copy

**a. Operational Transform (ot-json1).** `Editor.updateContents(operations, selection, source)`
applies OT operations to the live block tree. OT is a 1990s concurrency model (jupiter, ot.js,
Etherpad). It is genuinely conflict-prone, and for a **single-user local editor it buys nothing**
-- there is no concurrent remote author to reconcile against. ProseMirror's immutable-state +
transaction model is strictly better and is collaborative-ready for free later.

**b. snabbdom reconciling *inside* contenteditable.** Muya hand-rolls virtual-DOM diffing over a
live contenteditable region. Every crash in their tracker traces back to this:

| Issue | Symptom |
|---|---|
| `#2800` | `IndexSizeError` -- setStart offset out of range |
| `#4346`, `#4654` | null-parent renderer crash on list / detached block |
| `#4446` | Cmd+A, copy, cut, paste parity regressions |
| `#4437`, `#4435` | table chessboard deleted, then reverted |
| `#4355`, `#4401`, `#4307` | CJK flanking rules for `*emphasis*` |
| `#4354` | nested lists of differing types |
| `#4408` | `insertParagraph` anchoring in nested blocks |

Contenteditable plus a vdom reconciler is fighting the browser's own mutation observer.
**ProseMirror owns the DOM** and has spent fifteen years solving exactly this.

**c. A hand-rolled inline lexer.** `src/inlineRenderer/` reimplements inline tokenisation.
markdown-it has had that exact lexer battle-tested for a decade and got **CJK flanking** right
(MarkText needed three separate PRs to catch up).

**d. Export -> edit -> re-import for mode switching.** Their ARCHITECTURE.md admits it:

> "The editor (renderer process) ... load[s] the markdown text from Muya (export), operate on
> it and re-import the text into Muya when switching to preview mode."

This is a destructive round-trip on every tab switch -- it is why Typora and MarkText *both*
lose cursor and scroll position, and Typora needed 1.13 to fix it.

**e. CodeMirror 5 for source mode.** Their own docs: *"not well optimized nor feature rich."*
CM5 is from 2015. Should be CM6.

**f. Sanctioned `any` in the block registry.** `block/types.ts` admits it directly:

```ts
export interface IConstructor<T> {
  blockName: string
  // eslint-disable-next-line ts/no-explicit-any
  create: (muya: Muya, state: any) => any
  new (...args: never[]): T
}
```

A heterogeneous registry needs *some* escape hatch, but `any` in both directions is a type-safety
leak across the entire block system. We solve this with a discriminated union of block states.

**g. Prism for highlighting.** Prism has no TextMate grammar ecosystem and lags on modern
languages. Shiki has 200+ grammars and visibly better output.

**h. `flowchart.js`** -- abandoned; superseded by Mermaid.

---

## 4. Head-to-head feature map

| Capability | Typora | MarkText | **Verdict for Valence** |
|---|---|---|---|
| Hybrid live preview | ✅ signature feature | ✅ | **Take -- with a different engine** |
| Source mode quality | ❌ explicitly unmaintained | ⚠️ CM5 | **Replace both -- CM6, cursor-preserving** |
| Split view | ❌ by policy | ❌ | **Add -- cheap once the engine is unified** |
| Scroll/cursor preserved across modes | ✅ 1.13 only | ❌ | **Guarantee structurally, not as a patch** |
| Themes / theming | ✅✅ ecosystem, CSS | ⚠️ 6 bundled | **Take Typora's model + ship tokenised light/dark** |
| Export breadth | ✅✅ Pandoc, 8+ formats | ⚠️ HTML + PDF | **Take Typora's** |
| Tables (edit UX) | ✅ good | ✅✅ chessboard, col/drag/row-col menus | **Take MarkText's** |
| Images (resize, drag, path) | ✅✅ | ✅✅ | **Merge both** |
| Outline / file tree / search | ✅✅ | ✅ | **Take Typora's** |
| Word count | ✅✅ incl. reading time | ⚠️ | **Take Typora's** |
| Smart paste | ✅✅ HTML-aware | ✅ | **Take Typora's** |
| Math | ✅✅ MathJax 4, mhchem | ✅ KaTeX | **KaTeX inline (speed) + MathJax on export** |
| Mermaid | ✅✅ 11.13 | ✅ | **Mermaid 12** |
| Other diagrams | ⚠️ flowchart/seq (legacy) | ✅✅ Vega, PlantUML | **Take MarkText's breadth** |
| Syntax highlighting | ✅ ~100 langs | ⚠️ Prism | **Shiki 4 -- 200+ TextMate grammars** |
| Editor engine robustness | ⚠️ contenteditable | ⚠️ OT + snabbdom | **ProseMirror** |
| Spec conformance | ⚠️ undocumented | ✅ CommonMark + GFM in CI | **Keep the CI gate** |
| Plugin system | ❌ CSS only | ✅ mu-plugin | **Take the registry pattern** |
| Focus / typewriter / RTL | ✅✅ | ✅ | **Take Typora's** |
| License | proprietary, paid | ✅ MIT | **MIT** |

---

## 5. What we build, and why

### 5.1 The one architectural correction

Typora and MarkText share the same hidden flaw, and it is the root of their worst bugs:

**they treat "source text" and "rendered view" as two different representations, and convert
between them on demand.** Both convert on mode switch. MarkText converts via OT operations;
Typora converts via DOM state. Either way the conversion is lossy and asymmetric.

**Valence inverts this: the ProseMirror document *is* the document.** Markdown is a *serialisation*
of the editor state, not a parallel text buffer.

```
        ┌-┐
        -        ProseMirror document  (single truth)  -
        -   schema-validated · transactional · undoable -
        └-┬-┘
                        -  pure functions, both directions
          ┌-┴-┐
          ▼                           ▼
   markdownToState()           stateToMarkdown()
   (parse on open/import)      (serialise on save)
```

Consequences, which is where the wins come from:

1. **Mode switching is free.** Source mode is a *view of the same state*. No conversion, so
   cursor, selection, scroll, and undo history survive by construction. This is the bug both
   apps have been patching for years.
2. **Round-trip fidelity is a unit test**, not a hope. We test `md -> state -> md` as an
   idempotence property over the CommonMark and GFM suites -- exactly the CI gate MarkText got
   right, applied to the thing that actually broke both apps.
3. **One engine.** The hybrid view is a ProseMirror plugin (decorations hide inline markers);
   source mode is a ProseMirror node that shows raw text. Not two editors that sync badly.

### 5.2 Editor engine decision

**TipTap 3 / ProseMirror**, not a re-implementation. Rationale, in priority order:

1. It **owns the contenteditable**. Fifteen years of IME, composition, selection, and
   composition-event work -- the exact area where MarkText has three open CJK bugs and Typora
   still ships a degraded Windows source mode.
2. **Schema-validated documents.** Invalid states are unrepresentable, not caught at render time.
3. **Transactions + undo.** Muya's `History` is homegrown; ProseMirror's is one of the best in
   existence.
4. **Decorations** give us Typora's marker-hiding as a plugin -- the concept is preserved, the
   fragile implementation is not.
5. **NodeViews** for math, diagrams, and code blocks give us MarkText's interaction bar without
   hand-rolling vdom over contenteditable.
6. Collaborative-ready later, with no engine migration.

### 5.3 Two engines for markdown, deliberately

MarkText got this right and it is worth preserving: **an editor engine and a render engine are
different problems.**

- **Editor engine** (`src/core/markdown/`): markdown-it 15 -> ProseMirror doc, and the inverse.
  Must be exact, lossless, and fast.
- **Render engine** (`src/core/render/`): markdown-it 15 -> HTML with Shiki, KaTeX, Mermaid.
  Used for read mode, HTML export, and PDF export.

This is why export can be beautiful while editing stays lossless. Forcing one pipeline to do both
is how you get either a slow editor or a lossy export.

---

## 6. Attribution and licensing

Valence is a clean-room implementation informed by public documentation and open-source code
(MIT). Specifically:

- MarkText and Muya are **MIT**. We studied its architecture and deliberately diverged from its
  engine; no Muya source is copied.
- Typora is **proprietary**. No code is available and none is used. Its features are
  reimplemented from documented behaviour.
- Third-party runtime libraries keep their own licenses (Shiki MIT, KaTeX MIT, Mermaid MIT,
  markdown-it MIT, ProseMirror MIT, TipTap MIT, Electron MIT).

Valence is released **MIT**.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Round-trip is not perfectly lossless for exotic markdown | Track it with a differential fuzz test over the CommonMark/GFM suites; fail CI on drift. Surface known-lossy constructs in a settings panel. |
| ProseMirror Markdown ecosystem is young | We own the two parsers. They are ~400 lines, pure, and exhaustively tested -- the smallest, most testable part of the system. |
| Pandoc dependency for the full export matrix | Detect at runtime, offer a one-click install, degrade gracefully to native HTML/PDF. Never hard-fail. |
| A VDOM over contenteditable is what broke Muya | We never reconcile inside contenteditable. ProseMirror does; we only supply decorations and NodeViews. |