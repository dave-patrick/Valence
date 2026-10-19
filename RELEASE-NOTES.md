# Valence

A local-first Markdown editor. The document is a live WYSIWYG surface; the `.md` file is
the serialisation, not the source you type into. Open, edit, and save a plain Markdown file
— nothing proprietary, no database, no lock-in.

## Downloads

| Platform | File | How to run |
| --- | --- | --- |
| Windows | `Valence-0.1.10-win.zip` | Extract it anywhere, then run `Valence.exe` |
| Linux | `Valence-0.1.10.AppImage` | `chmod +x`, then run it |
| macOS | `Valence-0.1.10-arm64.dmg` | Open it and drag Valence to Applications |

**On Windows, extract the zip first.** Running the executable from inside the zip will
trigger SmartScreen and it will not start.

There is no installer. Valence makes no registry entries, writes nothing outside your
workspace folder, and uninstalls by deleting the folder.

## What works

- **Three views of one document.** Hybrid (formatting visible, syntax hidden), Source (raw
  Markdown), and Split. Switching does not convert or lose anything — the editor document
  is the document, and Markdown is how it serialises.
- **Markdown that round-trips.** Tables, task lists, fenced code, footnotes, front matter,
  maths, and `[[wiki links]]` survive an edit/save/reopen cycle byte-for-byte.
- **Syntax highlighting** via Shiki, **maths** via KaTeX (inline and display).
- **Slash commands** — type `/` for headings, lists, tables, code, math, quotes, dividers.
- **Smart paste.** Paste a heading from a web page and it arrives as a heading, not
  `## Pasted`. Paste an image and it is written next to the document and linked.
- **Command palette** (`Ctrl+P`) covering every menu action and keyboard shortcut.
- **Wiki links and backlinks.** `[[Other note]]` renders as a link, opens on click, and
  shows up in the target's backlinks panel. Clicking a link to a note that does not exist
  creates it.
- **Version history** (`Ctrl+H`). Every save snapshots; browse the list, diff two versions,
  restore one.
- **Export** to PDF and single-file HTML, plus Word/EPUB/LaTeX if you have Pandoc installed.
- **Workspace mode** — open a folder for a file tree, workspace-wide search, and the outline
  of the current note.
- **Focus and typewriter modes**, a daily word goal, light/dark/system themes, and custom CSS.

## What's new in 0.1.10

- **The app icon is right.** The window and taskbar icon was being built from a
  near-white page with the artwork cropped out of the middle, which left a speckled
  fringe around a white square. The alpha is now reconstructed from the artwork itself.
- **Updates work.** Valence checks the GitHub releases feed on launch, and Settings →
  Updates can check on demand. On Windows and Linux a new build is downloaded and put in
  place at the next restart. On macOS the build is a disk image, so you are sent to the
  releases page instead.
- **Mermaid diagrams render.** They were showing as raw code fences in the reading view.
- **Theming.** A gallery of named themes (House, Slate, Forest, Amber) and a custom
  accent colour, applied live.
- **File associations.** Settings → File associations can register Valence as the
  default editor for `.md`, `.markdown`, `.mdown`, `.mkd`, and `.txt`.

## Keyboard shortcuts

| | |
| --- | --- |
| `Ctrl+P` | Command palette |
| `Ctrl+S` | Save |
| `Ctrl+E` | Export |
| `Ctrl+H` | Version history |
| `Ctrl+N` | New document |
| `Ctrl+W` | Close tab |
| `Ctrl+/` | Toggle theme |
| `Ctrl+,` | Settings |

## Reporting problems

Open an issue with what you did and what you expected instead. The test plan in
`docs/test-plan.md` lists what is verified and what is known to be unproven.