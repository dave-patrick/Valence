# Valence 0.2.1

Build: **2026.29.10.2**

## Changes

- Open and edit YAML/YML, LOG, JSON/JSONL, TOML, INI, CFG/CONF, XML, CSV/TSV, and TXT alongside Markdown. Text files use a plain text editor that preserves indentation and the original LF or CRLF line-ending convention.
- Click an outline entry or a position-bar marker to jump to its Markdown section in Hybrid, Source, or Split view. Repeated and formatted headings navigate to their own sections; code, math, and HTML blocks no longer create phantom outline headings.
- Export text documents to escaped HTML or PDF using their current contents. Restoring a Markdown snapshot in Source view also updates the rich editor.
- Show the release version and build ID separately in Settings and the status bar. Line numbers are available under Settings → Writing.
- Improve workspace browsing and recursive file discovery, and refresh document rendering.
- Stage Windows builds at `C:\Users\davem\Apps\Valence`. Staging closes the app normally and stops if files remain locked, preserving the chosen application path.

## Downloads

Each artifact filename includes release **0.2.1** and build **2026.29.10.2**.

- Windows x64: extract the ZIP, then run `Valence.exe`. Close the previous copy before launching the updated app.
- Linux: mark the AppImage executable, then run it.
- macOS: open the DMG and drag Valence to Applications.

## Verification

- 511 automated tests, TypeScript checking, and Herald validation passed locally.
- The Windows package passed startup, preload bridge, file read/write, and local asset checks. Outline navigation was manually verified in the installed Windows app with a long document.
- GitHub Actions also builds Windows, Linux, and macOS packages and verifies startup of the unpacked Linux application before publishing.
