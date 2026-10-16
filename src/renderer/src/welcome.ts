export const WELCOME = `---
title: Valence
date: 2026-10-15
---

# Writing in Valence

Valence keeps a single document open in a single column, and hides the machinery. What you see
here is what gets written to disk — there is no separate source buffer and no preview pane to
keep in sync.

## The three views are three views of one thing

Press **⌘\\\\** to cycle. Nothing is converted when you switch, so your cursor, selection and
scroll position stay exactly where they were. Most editors rebuild the document from text on
every mode change; that is why they lose your place.

| View | What it is for |
|---|---|
| Hybrid | Writing. Inline styles resolve as you finish them. |
| Source | Reading the raw bytes. Fully editable, two-way bound. |
| Split | Checking the rendered output beside your writing. |

## Everything markdown can express

**Emphasis**, *emphasis*, ~~strikethrough~~, \`inline code\`, [a link](https://commonmark.org),
and ![an image](https://commonmark.org/help/images/).

- Task lists work, and you can click them
- Nested lists keep their nesting

1. Ordered lists
2. Keep their numbering
3. Across edits

> Blockquotes hold a thought aside. They take emphasis, lists, and code like anything else.

### Code

\`\`\`typescript
// ~100 languages via Shiki's TextMate grammars
export function serialise(doc: ParsedDocument): string {
  return doc.blocks.map(blockToMarkdown).join('\\n\\n')
}
\`\`\`

### Math

Inline math like $e^{i\\pi} + 1 = 0$ sits in the line, and display math gets its own block:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

### Diagrams

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[Block state]
  B --> C[Editor]
  B --> D[Render]
  C --> B
\`\`\`

### Tables

| Feature | From | Notes |
|---|---|---|
| Theme ecosystem | Typora | CSS-driven, community gallery |
| Table tooling | MarkText | Resize, reorder, row/column menus |
| Editor engine | Neither | ProseMirror, so IME and undo actually hold up |

---

Start typing anywhere. Press **⌘S** to save, **⌘O** to open, **⌘/** to switch theme.

Nothing leaves your machine. There is no account, no sync service, and no telemetry.
`