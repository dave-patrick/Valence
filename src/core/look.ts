// Adapted from the sibling Quantos application; kept dependency-free.
/**
 * Theming: background, text, accent, fonts, and granular interface element colours.
 * From a background colour the rest of the palette (panels, hover, lines, softer text)
 * is automatically calculated, light or dark, keeping text readable. Every specific element
 * can also be individually customised with full precision and saved as a vault theme file.
 */
export interface Look {
  bg: string | null;          // null: the built-in dark or light palette
  text: string | null;        // null: chosen for contrast with the background
  secondaryText?: string | null; // metadata, hints and placeholders; null: automatic
  accent: string | null;      // null: the accent preset (prefs.accent)
  fontUi: string | null;
  fontHeading: string | null;
  fontEditor: string | null;  // null: the Writing typeface setting
  fontMono: string | null;
  spacing: number;
  cardSpacing: number;
  editorSize: number;
  editorWidth: number;
  scale: number;              // interface text size, 0.9–1.25

  // Detailed interface element colours (null: auto-calculated or inherited)
  sidebarBg?: string | null;
  headerBg?: string | null;
  statusbarBg?: string | null;
  editorBg?: string | null;
  editorBorder?: string | null;
  panelBg?: string | null;
  raisedBg?: string | null;
  inputBg?: string | null;
  hoverBg?: string | null;
  activeBg?: string | null;
  selectBg?: string | null;
  line?: string | null;
  lineStrong?: string | null;
  lineFocus?: string | null;
  textSoft?: string | null;
  textMuted?: string | null;
  textFaint?: string | null;
  accentInk?: string | null;
  accentWash?: string | null;
  danger?: string | null;
  warn?: string | null;
  ok?: string | null;
}

export const DEFAULT_LOOK: Look = {
  bg: null,
  text: null,
  secondaryText: null,
  accent: null,
  fontUi: null,
  fontHeading: null,
  fontEditor: null,
  fontMono: null,
  spacing: 10,
  cardSpacing: 10,
  editorSize: 19,
  editorWidth: 72,
  scale: 1,
  sidebarBg: null,
  headerBg: null,
  statusbarBg: null,
  editorBg: null,
  editorBorder: null,
  panelBg: null,
  raisedBg: null,
  inputBg: null,
  hoverBg: null,
  activeBg: null,
  selectBg: null,
  line: null,
  lineStrong: null,
  lineFocus: null,
  textSoft: null,
  textMuted: null,
  textFaint: null,
  accentInk: null,
  accentWash: null,
  danger: null,
  warn: null,
  ok: null
};

export interface Preset { key: string; label: string; look: Partial<Look>; base?: 'dark' | 'light' }

/** Built-in starting palettes and user-facing color presets. */
export const PRESETS: Preset[] = [
  { key: 'quantos-dark', label: 'Valence Dark', look: {}, base: 'dark' },
  { key: 'quantos-light', label: 'Valence Light', look: {}, base: 'light' },
  { key: 'midnight', label: 'Midnight', look: { bg: '#0b0b12', sidebarBg: '#08080e', editorBg: '#0e0e18', accent: '#b6a2ff' } },
  { key: 'graphite', label: 'Graphite', look: { bg: '#1c1d21', sidebarBg: '#16171a', editorBg: '#212227', text: '#e8e6e3', accent: '#f4c46a' } },
  { key: 'nord', label: 'Nord', look: { bg: '#2e3440', sidebarBg: '#272c36', editorBg: '#3b4252', text: '#eceff4', accent: '#88c0d0' } },
  { key: 'forest', label: 'Forest', look: { bg: '#0f1a14', sidebarBg: '#0a120e', editorBg: '#14221b', text: '#e3efe7', accent: '#7fd8a6' } },
  { key: 'rose-pine', label: 'Rosé', look: { bg: '#191724', sidebarBg: '#13111c', editorBg: '#1f1d2e', text: '#e0def4', accent: '#ebbcba' } },
  { key: 'solarized-dark', label: 'Solarized Dark', look: { bg: '#002b36', sidebarBg: '#00212b', editorBg: '#073642', text: '#eee8d5', accent: '#2aa1e8' } },
  { key: 'solarized-light', label: 'Solarized Light', look: { bg: '#fdf6e3', sidebarBg: '#eee8d5', editorBg: '#fdf6e3', text: '#073642', accent: '#1e6fb5' } },
  { key: 'paper', label: 'Paper', look: { bg: '#f7f3ea', sidebarBg: '#ede7db', editorBg: '#fbf9f4', text: '#2b2620', accent: '#a64a17', fontHeading: 'Georgia', fontEditor: 'Georgia' } },
  { key: 'sky', label: 'Sky', look: { bg: '#eef5ff', sidebarBg: '#e1edff', editorBg: '#f6faff', text: '#10233d', accent: '#1d5fd6' } },
  { key: 'contrast', label: 'High contrast', look: { bg: '#000000', sidebarBg: '#0a0a0a', editorBg: '#000000', text: '#ffffff', accent: '#ffd400', line: '#444444', lineStrong: '#ffffff' } }
];

export const BUILTIN_DARK: Record<string, string> = {
  '--bg': '#2a2b2d',
  '--sidebar-bg': '#202123',
  '--header-bg': '#252628',
  '--statusbar-bg': '#252628',
  '--editor-bg': '#202123',
  '--bg-raised': '#252628',
  '--bg-panel': '#202123',
  '--bg-hover': '#303133',
  '--bg-active': '#393a3c',
  '--bg-select': '#254a70',
  '--bg-input': '#1b1c1e',
  '--line': '#414244',
  '--line-strong': '#505153',
  '--line-focus': '#78b6ff',
  '--text': '#edf2fa',
  '--text-soft': '#c5d0df',
  '--text-muted': '#9fb0c6',
  '--text-faint': '#8b9bb2',
  '--accent': '#78b6ff',
  '--accent-strong': '#a3ccff',
  '--accent-ink': '#091321',
  '--accent-wash': '#142338',
  '--danger': '#ff8a8a',
  '--warn': '#f4c46a',
  '--ok': '#7fd8a6'
};

export const BUILTIN_LIGHT: Record<string, string> = {
  '--bg': '#f5f7fb',
  '--sidebar-bg': '#eef2f8',
  '--header-bg': '#ffffff',
  '--statusbar-bg': '#ffffff',
  '--editor-bg': '#eef2f8',
  '--bg-raised': '#ffffff',
  '--bg-panel': '#eef2f8',
  '--bg-hover': '#e4eaf3',
  '--bg-active': '#d9e4f2',
  '--bg-select': '#bcd6f5',
  '--bg-input': '#ffffff',
  '--line': '#d6dde8',
  '--line-strong': '#c3cddc',
  '--line-focus': '#1a66c4',
  '--text': '#0c131d',
  '--text-soft': '#26364a',
  '--text-muted': '#4f6078',
  '--text-faint': '#5e6c80',
  '--accent': '#1a66c4',
  '--accent-strong': '#1559ad',
  '--accent-ink': '#ffffff',
  '--accent-wash': '#e3eefc',
  '--danger': '#c43a3a',
  '--warn': '#865a00',
  '--ok': '#17774a'
};

export type ElementCategory = 'surfaces' | 'interactive' | 'borders' | 'feedback';

export interface ElementDef {
  key: keyof Look;
  cssVar: string;
  label: string;
  category: ElementCategory;
  description: string;
}

export const THEME_ELEMENTS: ElementDef[] = [
  // Surfaces & Layout
  { key: 'sidebarBg', cssVar: '--sidebar-bg', label: 'Sidebar', category: 'surfaces', description: 'Left and right navigation sidebars' },
  { key: 'editorBg', cssVar: '--editor-bg', label: 'Editor canvas', category: 'surfaces', description: 'Main note writing area and tab panes' },
  { key: 'panelBg', cssVar: '--bg-panel', label: 'Panels & views', category: 'surfaces', description: 'Data tables, file tree and sub-panels' },
  { key: 'raisedBg', cssVar: '--bg-raised', label: 'Cards & dialogs', category: 'surfaces', description: 'Modals, popups, floating cards and toolbars' },
  { key: 'headerBg', cssVar: '--header-bg', label: 'Header bar', category: 'surfaces', description: 'Top brand bar and main toolbar' },
  { key: 'statusbarBg', cssVar: '--statusbar-bg', label: 'Status bar', category: 'surfaces', description: 'Bottom application status bar' },
  { key: 'inputBg', cssVar: '--bg-input', label: 'Input fields', category: 'surfaces', description: 'Search inputs and text fields' },

  // Interactive & Selections
  { key: 'selectBg', cssVar: '--bg-select', label: 'Selection highlight', category: 'interactive', description: 'Text selection and active table rows' },
  { key: 'hoverBg', cssVar: '--bg-hover', label: 'Hover highlight', category: 'interactive', description: 'Buttons and list items on hover' },
  { key: 'activeBg', cssVar: '--bg-active', label: 'Active item', category: 'interactive', description: 'Pressed buttons and active segments' },
  { key: 'lineFocus', cssVar: '--line-focus', label: 'Focus ring', category: 'interactive', description: 'Keyboard focus around controls and inputs' },
  { key: 'accentWash', cssVar: '--accent-wash', label: 'Accent wash', category: 'interactive', description: 'Subtle accent background for badges and chips' },
  { key: 'accentInk', cssVar: '--accent-ink', label: 'Accent text / ink', category: 'interactive', description: 'Text colour inside filled accent buttons' },

  // Borders & Dividers
  { key: 'editorBorder', cssVar: '--editor-border', label: 'Editor card border', category: 'borders', description: 'Border around the main writing card' },
  { key: 'line', cssVar: '--line', label: 'Subtle borders', category: 'borders', description: 'Standard borders and divider lines' },
  { key: 'lineStrong', cssVar: '--line-strong', label: 'Strong borders', category: 'borders', description: 'Focused pane borders and dialog boundaries' },

  // Status & Feedback
  { key: 'ok', cssVar: '--ok', label: 'Success', category: 'feedback', description: 'Successful actions and application status' },
  { key: 'warn', cssVar: '--warn', label: 'Warning', category: 'feedback', description: 'Non-blocking cautions, including export notices' },
  { key: 'danger', cssVar: '--danger', label: 'Error', category: 'feedback', description: 'Errors and destructive history actions' }
];

/** Fonts bundled with Valence, followed by common Windows fonts. Any installed font can be typed in. */
export const FONTS: { name: string; kind: 'sans' | 'serif' | 'mono' | 'display' }[] = [
  { name: 'Source Sans 3', kind: 'sans' }, { name: 'Chakra Petch', kind: 'display' }, { name: 'IBM Plex Mono', kind: 'mono' },
  { name: 'Segoe UI', kind: 'sans' }, { name: 'Calibri', kind: 'sans' }, { name: 'Arial', kind: 'sans' }, { name: 'Verdana', kind: 'sans' }, { name: 'Tahoma', kind: 'sans' },
  { name: 'Bahnschrift', kind: 'sans' }, { name: 'Candara', kind: 'sans' }, { name: 'Corbel', kind: 'sans' }, { name: 'Trebuchet MS', kind: 'sans' },
  { name: 'Georgia', kind: 'serif' }, { name: 'Cambria', kind: 'serif' }, { name: 'Constantia', kind: 'serif' }, { name: 'Palatino Linotype', kind: 'serif' },
  { name: 'Times New Roman', kind: 'serif' }, { name: 'Sitka Text', kind: 'serif' },
  { name: 'Cascadia Code', kind: 'mono' }, { name: 'Cascadia Mono', kind: 'mono' }, { name: 'Consolas', kind: 'mono' }, { name: 'Courier New', kind: 'mono' }
];

/** A CSS font-family value: the chosen font, then a fallback of the right kind. */
export function fontStack(name: string, role: 'ui' | 'heading' | 'editor' | 'mono'): string {
  const known = FONTS.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());
  const kind = known?.kind ?? (role === 'mono' ? 'mono' : 'sans');
  const generic = kind === 'mono' ? 'monospace' : kind === 'serif' ? 'serif' : 'sans-serif';
  const clean = name.replace(/["';{}<>\\]/g, '').trim();
  return `"${clean}", ${generic}`;
}

// ---- colour maths ----------------------------------------------------------------------------

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)!, y = parseHex(b)!;
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminance(hex: string): number {
  const c = parseHex(hex)!.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export const isLight = (hex: string) => luminance(hex) > 0.4;

/** Moves a colour toward black or white until it reaches the contrast asked for against the background. */
export function readable(color: string, bg: string, min: number): string {
  if (contrast(color, bg) >= min) return color;
  const target = isLight(bg) ? '#000000' : '#ffffff';
  for (let t = 0.05; t <= 1; t += 0.05) { const c = mix(color, target, t); if (contrast(c, bg) >= min) return c; }
  return target;
}

/** CSS variables for a look, including calculated palette and any explicit element overrides. */
export function lookVars(look: Look, base: 'dark' | 'light', fallback: Record<string, string> = base === 'light' ? BUILTIN_LIGHT : BUILTIN_DARK): Record<string, string> {
  const v: Record<string, string> = { '--card-gap': look.cardSpacing + 'px' };
  const bg = look.bg && parseHex(look.bg) ? toHex(parseHex(look.bg)!) : null;
  const surface = bg ?? fallback['--bg'];
  const selectedText = look.text && parseHex(look.text) ? toHex(parseHex(look.text)!) : null;
  if (bg) {
    const light = isLight(bg);
    const text = selectedText ?? (light ? '#141b24' : '#edf2fa');
    v['--bg'] = bg;
    v['--bg-raised'] = light ? mix(bg, '#ffffff', 0.55) : mix(bg, text, 0.035);
    v['--bg-panel'] = mix(bg, text, light ? 0.04 : 0.055);
    v['--bg-hover'] = mix(bg, text, light ? 0.07 : 0.09);
    v['--bg-active'] = mix(bg, text, light ? 0.11 : 0.13);
    v['--bg-input'] = light ? mix(bg, '#ffffff', 0.7) : mix(bg, '#000000', 0.12);
    v['--line'] = mix(bg, text, light ? 0.14 : 0.16);
    v['--line-strong'] = mix(bg, text, light ? 0.22 : 0.22);
    v['--text'] = text;
    v['--text-soft'] = readable(mix(text, bg, 0.15), bg, 7);
    v['--text-muted'] = readable(mix(text, bg, 0.3), bg, 4.8);
    v['--text-faint'] = readable(mix(text, bg, 0.42), bg, 4.6);
    v['--shadow'] = light ? '0 12px 32px rgb(0 0 0 / 0.14)' : '0 12px 36px rgb(0 0 0 / 0.45)';
  }
  if (selectedText && !bg) {
    v['--text'] = selectedText;
    v['--text-soft'] = readable(mix(selectedText, surface, 0.15), surface, 7);
    v['--text-muted'] = readable(mix(selectedText, surface, 0.3), surface, 4.8);
    v['--text-faint'] = readable(mix(selectedText, surface, 0.42), surface, 4.6);
  }
  if (look.accent && parseHex(look.accent)) {
    const raw = toHex(parseHex(look.accent)!);
    // Readable on the background and on its own tint (selected buttons, chips), so check against the tint.
    const tint = mix(surface, raw, isLight(surface) ? 0.12 : 0.14);
    const accent = readable(readable(raw, surface, 4.6), tint, 4.6);
    const text = v['--text'] ?? fallback['--text'];
    v['--accent'] = accent;
    v['--line-focus'] = accent;
    v['--accent-strong'] = readable(mix(accent, text, 0.25), surface, 5);
    v['--accent-wash'] = mix(surface, accent, isLight(surface) ? 0.12 : 0.14);
    v['--accent-ink'] = contrast(accent, '#000000') >= contrast(accent, '#ffffff') ? '#0b0f14' : '#ffffff';
    v['--bg-select'] = mix(surface, accent, isLight(surface) ? 0.28 : 0.32);
  }

  // Detailed interface element overrides
  if (selectedText) v['--text-soft'] = selectedText;
  const setOverride = (cssVar: string, hex?: string | null) => {
    if (hex && parseHex(hex)) v[cssVar] = toHex(parseHex(hex)!);
  };
  setOverride('--sidebar-bg', look.sidebarBg);
  setOverride('--header-bg', look.headerBg);
  setOverride('--statusbar-bg', look.statusbarBg);
  setOverride('--editor-bg', look.editorBg);
  setOverride('--editor-border', look.editorBorder);
  setOverride('--bg-panel', look.panelBg);
  setOverride('--bg-raised', look.raisedBg);
  setOverride('--bg-input', look.inputBg);
  setOverride('--bg-hover', look.hoverBg);
  setOverride('--bg-active', look.activeBg);
  setOverride('--bg-select', look.selectBg);
  setOverride('--line', look.line);
  setOverride('--line-strong', look.lineStrong);
  setOverride('--line-focus', look.lineFocus);
  setOverride('--text-soft', look.textSoft);
  setOverride('--text-muted', look.textMuted);
  setOverride('--text-faint', look.textFaint);
  if (look.secondaryText && parseHex(look.secondaryText)) {
    const secondary = toHex(parseHex(look.secondaryText)!);
    v['--text-muted'] = secondary;
    v['--text-faint'] = secondary;
  }
  setOverride('--accent-ink', look.accentInk);
  setOverride('--accent-wash', look.accentWash);
  if (look.danger && parseHex(look.danger)) {
    v['--danger'] = toHex(parseHex(look.danger)!);
    v['--danger-wash'] = mix(surface, v['--danger'], isLight(surface) ? 0.12 : 0.14);
  }
  if (look.warn && parseHex(look.warn)) {
    v['--warn'] = toHex(parseHex(look.warn)!);
    v['--warn-wash'] = mix(surface, v['--warn'], isLight(surface) ? 0.12 : 0.14);
  }
  if (look.ok && parseHex(look.ok)) {
    v['--ok'] = toHex(parseHex(look.ok)!);
    v['--ok-wash'] = mix(surface, v['--ok'], isLight(surface) ? 0.12 : 0.14);
  }

  if (look.fontUi) v['--font-body'] = fontStack(look.fontUi, 'ui');
  if (look.fontHeading) v['--font-display'] = fontStack(look.fontHeading, 'heading');
  if (look.fontEditor) v['--font-editor'] = fontStack(look.fontEditor, 'editor');
  if (look.fontMono) v['--font-mono'] = fontStack(look.fontMono, 'mono');
  return v;
}

/** Resolves the effective color value for an element, whether custom or automatic. */
export function effectiveColor(cssVar: string, look: Look, base: 'dark' | 'light', accentFallback = '#78b6ff'): string {
  const vars = lookVars(look, base);
  if (cssVar === '--editor-border') return vars[cssVar] ?? vars['--line'] ?? (base === 'light' ? BUILTIN_LIGHT : BUILTIN_DARK)['--line'];
  if (vars[cssVar]) return vars[cssVar];
  if (cssVar === '--accent' || cssVar === '--line-focus') return vars['--accent'] ?? accentFallback;
  const builtIn = base === 'light' ? BUILTIN_LIGHT : BUILTIN_DARK;
  return builtIn[cssVar] ?? '#808080';
}

/** Resets all detailed element overrides back to automatic while preserving base bg, text, accent, fonts, and scale. */
export function resetElements(look: Look): Look {
  return {
    bg: look.bg,
    text: look.text,
    secondaryText: null,
    accent: look.accent,
    fontUi: look.fontUi,
    fontHeading: look.fontHeading,
    fontEditor: look.fontEditor,
    fontMono: look.fontMono,
    scale: look.scale,
    spacing: look.spacing,
    cardSpacing: look.cardSpacing,
    editorSize: look.editorSize,
    editorWidth: look.editorWidth,
    sidebarBg: null,
    headerBg: null,
    statusbarBg: null,
    editorBg: null,
    editorBorder: null,
    panelBg: null,
    raisedBg: null,
    inputBg: null,
    hoverBg: null,
    activeBg: null,
    selectBg: null,
    line: null,
    lineStrong: null,
    lineFocus: null,
    textSoft: null,
    textMuted: null,
    textFaint: null,
    accentInk: null,
    accentWash: null,
    danger: null,
    warn: null,
    ok: null
  };
}

/** The look as a stylesheet; it outranks the built-in light and dark blocks. */
export function lookCss(look: Look, base: 'dark' | 'light'): string {
  const vars = lookVars(look, base);
  const body = Object.entries(vars).map(([k, val]) => `  ${k}: ${val};`).join('\n');
  return body ? `:root:root[data-theme] {\n${body}\n}\n` : '';
}

/** The base a look runs on: its background decides, otherwise the light/dark switch. */
export const baseOf = (look: Look, fallback: 'dark' | 'light'): 'dark' | 'light' => (look.bg && parseHex(look.bg) ? (isLight(look.bg) ? 'light' : 'dark') : fallback);


export function normaliseLook(input: unknown): Look {
 const out = { ...DEFAULT_LOOK };
 if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
 const raw = input as Record<string,unknown>;
 for (const key of Object.keys(DEFAULT_LOOK) as (keyof Look)[]) {
  const value = key === 'cardSpacing' && !Object.hasOwn(raw, 'cardSpacing') ? raw.spacing : raw[key];
  if (key === 'scale' || key === 'spacing' || key === 'cardSpacing' || key === 'editorSize' || key === 'editorWidth') {
   const bounds = key === 'scale' ? [.9,1.25] : key === 'spacing' ? [4,16] : key === 'cardSpacing' ? [0,24] : key === 'editorSize' ? [14,24] : [55,90];
   if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.min(bounds[1],Math.max(bounds[0],value));
  } else if (key.startsWith('font')) {
   if (typeof value === 'string' && /^[a-zA-Z0-9 ._-]{1,80}$/.test(value)) Object.assign(out,{[key]:value});
  } else if (typeof value === 'string' && parseHex(value)) Object.assign(out,{[key]:toHex(parseHex(value)!)});
 }
 return out;
}
export interface SavedAppearance { format: 'valence-appearance'; version: 1; theme: 'system' | 'light' | 'dark'; themeId: string; accentColor: string; look: Look }
export function parseAppearance(text: string): SavedAppearance {
 const raw = JSON.parse(text);
 if (!raw || raw.format !== 'valence-appearance' || raw.version !== 1 || !raw.look || typeof raw.look !== 'object' || Array.isArray(raw.look) || !['system','light','dark'].includes(raw.theme) || typeof raw.themeId !== 'string' || typeof raw.accentColor !== 'string' || !parseHex(raw.accentColor)) throw new Error('Choose a Valence appearance file (version 1).');
 return {format:'valence-appearance',version:1,theme:raw.theme,themeId:raw.themeId,accentColor:toHex(parseHex(raw.accentColor)!),look:normaliseLook(raw.look)};
}
