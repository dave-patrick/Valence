---
name: Valence
description: A calm, customizable card workspace for local writing.
colors:
  dark-canvas: "#2a2b2d"
  dark-panel: "#202123"
  dark-raised: "#252628"
  dark-input: "#1b1c1e"
  dark-hover: "#303133"
  dark-active: "#393a3c"
  dark-selection: "#254a70"
  dark-line: "#414244"
  dark-line-strong: "#505153"
  dark-text: "#edf2fa"
  dark-text-soft: "#c5d0df"
  dark-text-muted: "#9fb0c6"
  dark-text-faint: "#8b9bb2"
  dark-accent: "#78b6ff"
  dark-accent-ink: "#091321"
  dark-accent-wash: "#142338"
  light-canvas: "#f5f7fb"
  light-panel: "#eef2f8"
  light-raised: "#ffffff"
  light-hover: "#e4eaf3"
  light-active: "#d9e4f2"
  light-selection: "#bcd6f5"
  light-line: "#d6dde8"
  light-text: "#0c131d"
  light-text-soft: "#26364a"
  light-text-muted: "#4f6078"
  light-text-faint: "#5e6c80"
  light-accent: "#1a66c4"
  light-accent-wash: "#e3eefc"
typography:
  body:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "19px"
    lineHeight: 1.62
  label:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
  headline:
    fontFamily: "Chakra Petch, Source Sans 3, sans-serif"
  mono:
    fontFamily: "IBM Plex Mono, Cascadia Mono, Consolas, monospace"
rounded:
  control: "4px"
  field: "6px"
  tab: "7px"
  status: "9px"
  pane: "12px"
  dialog: "14px"
spacing:
  compact: "6px"
  workspace: "10px"
  appearance: "14px"
  editor-top: "2rem"
components:
  editor-card:
    backgroundColor: "{colors.dark-panel}"
    rounded: "{rounded.pane}"
  editor-card-light:
    backgroundColor: "{colors.light-panel}"
    rounded: "{rounded.pane}"
  tab-active:
    backgroundColor: "{colors.dark-active}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.tab}"
    height: "32px"
  appearance-select:
    rounded: "{rounded.field}"
    padding: "0 8px"
    height: "32px"
---

# Design System: Valence

## Overview

**Creative North Star: "The calm card workspace"**

The document leads inside a quiet, inset workspace inherited from Quantos. Separate header, navigation, editor and status surfaces make the application readable without competing with the writing. Controls stay compact; the editor receives the generous reading measure.

The palette, typography and spacing are user-controlled. Defaults define the family resemblance, while live appearance settings preserve that structure across custom colors, installed fonts and legacy paired themes.

**Key Characteristics:**
- Inset, softly rounded panes on a neutral canvas.
- Restrained blue interaction cues and hierarchical text.
- Independent interface, heading, editor and monospace font roles.
- Local, persistent appearance customization.

## Colors

### Primary
Clear blue marks focus, active navigation, links and selection affordances. Use resolved accent, accent ink and accent wash roles together rather than assuming fixed contrast.

### Neutral
Charcoal canvas and graphite panels anchor dark mode; cool paper and white raised surfaces anchor light mode. Frontmatter records the built-in Look palettes from src/core/look.ts, rather than the older pre-resolution stylesheet fallback. Header and status use raised surfaces; sidebar and editor use panel surfaces. Soft, muted and faint text establish hierarchy.

**The Resolved Palette Rule.** Consume semantic CSS variables. A custom background determines light/dark derivation, and explicit element overrides remain authoritative. Automatic swatches must show the actual resolved palette.

Success, warning and danger use --ok, --warn and --danger. resolveAppearance merges the selected legacy fallback palette with Look; user accent and granular overrides determine the final output.

## Typography

Source Sans 3 supplies the interface and default editor text. Chakra Petch supplies the default heading role; IBM Plex Mono supplies source and code. All three are bundled for offline use. Installed fonts are selectable with role-appropriate fallbacks.

Interface text scales through --ui-scale. Tabs use 12.5px, navigation 13px and status 11.5px before scaling. Default editor text uses the body token and a 72ch measure. Source mode uses monospace at 0.78 times editor size. Editor and heading selections also apply in preview.

**The Four Roles Rule.** Keep UI, heading, editor and code fonts independently configurable; do not hardcode a font into new application controls.

## Layout

Shell padding and pane gaps share the workspace spacing token. Header minimum height is 46px; rail width is 44px; status minimum height is 30px. Preserve optional navigation, outline docking, resizers, tabs and editor modes. Split panes use zero-minimum tracks so reading measure cannot force horizontal growth.

At 640px and below, outer and workspace gaps are capped at compact spacing and appearance colors become one column. The inspector appears from 1280px. Settings width is min(620px, calc(100vw - 2rem)). Reading width remains configurable.

Windows uses standard Electron caption controls on a themed draggable title strip, 30px high with 140px reserved on the right. Native caption buttons have not been visually verified by the available capture helper.

## Elevation & Depth

Workspace panes are flat, separated by tone, one-pixel rules and gaps. Active tabs use filled surfaces without shadows. Floating menus use 0 6px 20px rgb(0 0 0 / 0.14); settings use 0 24px 64px rgb(0 0 0 / 0.28). Focus and selected preset rings convey state.

## Shapes

Use pane corners for header, rail, navigation and editor. Status and tabs use their smaller corner tokens; fields and compact controls retain tighter corners. Settings use the dialog radius. Resizer rules become accent-colored on hover or keyboard focus.

## Components

Tabs are quiet rounded document selectors. Selection uses the active surface; keyboard focus reveals the close action. Rail controls use hover fill and accent wash for pressed state.

Inputs use the input surface, text role and subtle border. Appearance selectors sit beside their label. Color controls show resolved automatic values; element reset buttons relinquish individual overrides, and disabled reset controls recede.

The editor card clips contents while preserving internal scrolling. Find/Replace wraps controls and marks the current match with accent and accent ink. Appearance settings group presets, base colors, typography and spacing above expandable element controls. Versioned JSON import/export carries appearance only.

## Do's and Don'ts

### Do:
- Do use resolved semantic colors and the four font roles.
- Do preserve pane resizing, outline docking, editor modes and keyboard commands.
- Do test dark, light, narrow and customized appearances.
- Do keep automatic swatches consistent with the actual resolved palette.

### Don't:
- Don't replace editable appearance roles with hardcoded default colors.
- Don't use decorative shadows on resting workspace panes.
- Don't let reading width force split panes wider than their container.
- Don't introduce shipping raster assets without recording provenance.

Source authority: docs/design/editor-shell.md, src/core/look.ts, src/core/theme.ts and appended shell rules in src/renderer/src/styles/editor.css. Quantos reference: C:/repos/Quantos/frontend/src/lib/look.ts. Capture fixtures: artifacts/appearance/{dark-workspace,light-workspace,narrow-workspace,appearance-settings}.png. No shipping raster changes.
