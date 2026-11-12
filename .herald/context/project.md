# Valence: project context

## Overview
Valence - a local-first Markdown editor. Typora seamless reading, MarkText editor depth, modernised.

## Existing guidance
- Read `README.md` for existing project guidance; follow directory-specific instructions where present.
- Read `graft/INDEX.md` for existing project guidance; follow directory-specific instructions where present.

## Stack evidence
- `package.json` is present; use it to confirm dependencies and supported commands.

## Conventions

- Stage Windows builds at `C:\Users\davem\Apps\Valence`, the application's canonical executable location. Do not silently use another staging folder when this destination is locked.
- Change the semantic version only when requested; increment the separate `YYYY.DD.MM.revision` build ID (Phoenix date, monotonic revision). Retries and platform variants of one build share its ID.

- Document extensions are defined in `src/shared/fileTypes.ts` for file discovery and pickers. Non-Markdown documents stay in the raw text editor and bypass Markdown conversion.
- Outline navigation uses source offsets for text and schema-parsed prefix heading counts for the rich editor; DOM heading IDs are not required.
- Updater requests use Electron `net.fetch` after app readiness so system proxy configuration is respected. Failed release checks reject with a diagnostic error; they must never be classified as an up-to-date result. Manual checks bypass cached release responses.
- Preserve existing project instructions, configuration, credentials, and application data.
- Use Graft for code context when available, following the global and project Graft guidance.
- Keep this context accurate as project architecture and conventions are established.
- Herald compiler output replaces vendor files. Preserve and merge existing guidance before compiling.
- Pane resizing uses the controlled ResizeDivider/ResizablePane UI components. Widths live in App state for the session; pointer movement uses deltas and side-aware direction. Keep inspector visibility and its divider together.
- Keep vertical scrolling inside the editor/preview panes and the height-constrained Sidebar body. All navigation panels share the persisted sidebarSide setting and can dock on either side with the divider on the inward edge. Right-click the navigation rail or panel header to switch sides. The heading-position navigation must remain height-constrained and keep its first and last controls reachable for documents with many headings; the outer workspace only scrolls horizontally.
- Active-document Find/Replace uses literal UTF-16 ranges. Rich replacements are isolated ProseMirror history transactions; Source replacements and typing use document-scoped delta history, with grouped IME composition and the existing line-ending-preserving input path. Ctrl+F finds, Ctrl+H replaces, and Ctrl+Alt+H opens history.

- Appearance uses the adapted Quantos Look model in src/core/look.ts, normalized in Settings. resolveAppearance combines legacy palettes with derived and explicit colors. Clear removed root CSS properties; keep header/sidebar/editor/status backgrounds themed. Windows native overlay colors follow the header through validated win:appearance IPC. Window padding, card spacing, editor border color, and typography are independently persisted, separately from documents.
- Quantos vault moves go through the desktop preload bridge. Hold the document operation guard across move and save, lock the editor while moving, and update the tab only after the destination is committed. The main-process move uses exclusive publication and retains a recovery copy of an existing source file.
- Word statistics use Markdown prose parsing for source documents and ProseMirror traversal for immediate rich-editor updates; keep live counts scoped to the active document.
