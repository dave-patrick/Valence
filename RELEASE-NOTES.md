# Valence 0.2.2

Build: **2026.29.10.3**

## Changes

- Update checks and downloads now use Electron's Chromium networking stack, which supports system proxy configuration, rather than Node's separate networking stack.
- Manual update checks bypass cached release responses.
- Failed HTTP, network, certificate, and timeout checks report an error instead of incorrectly saying the application is on the latest version.
- Settings shows the update-check error details and always offers an Open releases button for a manual download.
- Includes the text-file support and clickable outline navigation from 0.2.1.

## Updating an older copy

If version 0.2.0 or 0.2.1 says it is current despite a newer release, download this release manually, close Valence, and extract the Windows ZIP over the application folder. This replaces the old updater code. Documents and user settings are stored separately from the application files.

## Downloads

Every artifact filename includes release **0.2.2** and build **2026.29.10.3**.

- Windows x64: extract the ZIP, then run Valence.exe. Close the previous copy before launching the updated app.
- Linux: mark the AppImage executable, then run it.
- macOS: open the DMG and drag Valence to Applications.

## Verification

The release workflow runs automated tests and TypeScript checks on Windows, Linux, and macOS and verifies startup of the unpacked Linux application before publishing.
