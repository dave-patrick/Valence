# Valence 0.2.4

Build: **2026.07.11.11**

## Changes

- **Updates no longer delete other files.** The Windows updater mirrored the new build over the folder holding Valence.exe, which deleted everything else in that folder. It now adds and replaces files, and removes only files an earlier update installed. Downloads are checked against GitHub's checksum before they are installed.
- **Links in the preview are safe.** A link used to replace the whole app with the linked page. Web links now open in your browser, links to documents open as tabs (relative to the document), and other links do nothing. The app window is sandboxed.
- **Changes made outside Valence are noticed.** An unedited document reloads; an edited one keeps your edits, and saving asks before replacing the file. A failed save now says so.
- **Unsaved edits survive a crash.** They are kept in the app's data folder and come back on the next start.
- **Copy as Markdown, HTML and plain text** now reach the clipboard.
- **Exports:** Word, OpenDocument, EPUB and LaTeX export works when Pandoc is installed (it was hidden and produced broken files). PDF export asks where to save once, and uses Letter paper in the US and Canada.
- **Faster typing in long documents** (the conversion to Markdown waits for a pause) and much faster opening of large folders (`.git` and `node_modules` are skipped).
- Version history files include the file extension, so `notes.md` and `notes.txt` no longer share one history.
- Fonts are bundled, so the app looks the same offline.

## Downloads

Every artifact filename includes release **0.2.4** and build **2026.07.11.11**.

- Windows x64: extract the ZIP into its own folder, then run Valence.exe. Close the previous copy before replacing it.
- Linux: mark the AppImage executable, then run it.
- macOS: open the DMG and drag Valence to Applications.

Documents and settings are stored separately from the application files.

## Verification

The workflow runs automated tests and TypeScript checks on Windows, Linux and macOS for every push, and starts the packaged Linux app and checks the preload bridge and a file round-trip before publishing a tagged release.
