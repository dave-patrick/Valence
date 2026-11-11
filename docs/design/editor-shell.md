# Editor shell — Operate

## Direction contract
THESIS: The document leads inside a calm, inset card workspace inherited from Quantos. Preserve Valence navigation, editor modes and panel docking.
OWN-WORLD: Quantos neutral canvas, 12px pane corners, restrained rules, separate header/sidebar/editor/status surfaces. Source Sans 3 interface and existing bundled font family options. Full editable palette and typography.
STORY: Open a document, write, navigate headings and adjust appearance without losing editor state. Appearance is live and saved locally.
FIRST VIEWPORT: Inset header with subdued menu and document tabs; narrow rail, optional navigation card, dominant editor card; compact status below. Shared spacing control defaults to 10px.
FORM: User-selected Quantos interface reference, code-led adaptation; no random seed or composition tournament because the owner selected the source design.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implementation and validation
Adapt the dependency-free Quantos Look model, calculating automatic colors from the actual Valence fallback theme. Normalize saved values and imported versioned JSON. Controls include presets, base and element colors, font roles, interface size, workspace spacing and editor measure. Clear stale style properties and follow system theme changes. Preserve existing settings as fallback. Validate normalization and palette behavior, existing tests and package interaction probes, and dark/light/narrow renders. Build 2026.11.11.17, semantic version unchanged.
