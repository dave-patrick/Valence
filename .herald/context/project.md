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
- Increment the semantic version for each new build, alongside the separate `YYYY.DD.MM.revision` build ID (Phoenix date, monotonic revision). Retries and platform variants of one build share its ID.

- Document extensions are defined in `src/shared/fileTypes.ts` for file discovery and pickers. Non-Markdown documents stay in the raw text editor and bypass Markdown conversion.
- Outline navigation uses source offsets for text and schema-parsed prefix heading counts for the rich editor; DOM heading IDs are not required.
- Updater requests use Electron `net.fetch` after app readiness so system proxy configuration is respected. Failed release checks reject with a diagnostic error; they must never be classified as an up-to-date result. Manual checks bypass cached release responses.
- Preserve existing project instructions, configuration, credentials, and application data.
- Use Graft for code context when available, following the global and project Graft guidance.
- Keep this context accurate as project architecture and conventions are established.
- Herald compiler output replaces vendor files. Preserve and merge existing guidance before compiling.
