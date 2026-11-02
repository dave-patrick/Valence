# Valence 0.2.3

Build: **2026.02.11.10**

## Changes

- Drag vertical dividers to resize the document tab lists, navigation panel, document statistics panel, and editor/preview split.
- Dividers support keyboard resizing with arrow keys and Home/End, and enforce size limits. Pane sizes are retained for the current session.
- The action rail stays to the left of document tabs. The V button in the top-left opens the application menu, including Open and Save.
- Text and Markdown source editors fill the available width instead of leaving an unused strip beside the scrollbar.
- Corrected Left and Right labels in the tab-position menu and added feedback for unreadable files.

## Downloads

Every artifact filename includes release **0.2.3** and build **2026.02.11.10**.

- Windows x64: extract the ZIP, then run Valence.exe. Close the previous copy before replacing it.
- Linux: mark the AppImage executable, then run it.
- macOS: open the DMG and drag Valence to Applications.

Documents and settings are stored separately from the application files.

## Verification

The release workflow runs automated tests and TypeScript checks on Windows, Linux, and macOS. It also starts the packaged Linux app and checks the preload bridge, file round-trip, source editor width, divider dragging, split limits, and responsive inspector visibility before publishing.
