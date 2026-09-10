/**
 * Terminal colour schemes. Each theme carries the xterm palette plus the UI
 * accent, and applyUiTheme() publishes them as CSS variables so the whole
 * window (not just the terminal grid) follows the choice.
 */
export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface ThemeDef {
  id: string;
  label: string;
  /** UI accent used for highlights, focus rings and active states. */
  accent: string;
  /** Panel/background pair for app chrome behind the terminal. */
  chrome: { background: string; panel: string; border: string; text: string; dim: string };
  terminal: XtermTheme;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'matrix',
    label: 'OmniTerm Matrix',
    accent: '#00FF41',
    chrome: {
      background: '#0F0F10',
      panel: '#161618',
      border: '#2A2A2E',
      text: '#E0E0E5',
      dim: '#88888E',
    },
    terminal: {
      background: '#0A0A0B',
      foreground: '#D7DAE0',
      cursor: '#22C55E',
      selectionBackground: '#264F78',
      black: '#1B1D22',
      red: '#F87171',
      green: '#22C55E',
      yellow: '#EAB308',
      blue: '#60A5FA',
      magenta: '#C084FC',
      cyan: '#22D3EE',
      white: '#D7DAE0',
      brightBlack: '#6B7280',
      brightRed: '#FCA5A5',
      brightGreen: '#4ADE80',
      brightYellow: '#FDE047',
      brightBlue: '#93C5FD',
      brightMagenta: '#D8B4FE',
      brightCyan: '#67E8F9',
      brightWhite: '#F9FAFB',
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    accent: '#FF79C6',
    chrome: {
      background: '#191A21',
      panel: '#21222C',
      border: '#343746',
      text: '#F8F8F2',
      dim: '#8B92B4',
    },
    terminal: {
      background: '#1E1F29',
      foreground: '#F8F8F2',
      cursor: '#FF79C6',
      selectionBackground: '#44475A',
      black: '#21222C',
      red: '#FF5555',
      green: '#50FA7B',
      yellow: '#F1FA8C',
      blue: '#BD93F9',
      magenta: '#FF79C6',
      cyan: '#8BE9FD',
      white: '#F8F8F2',
      brightBlack: '#6272A4',
      brightRed: '#FF6E6E',
      brightGreen: '#69FF94',
      brightYellow: '#FFFFA5',
      brightBlue: '#D6ACFF',
      brightMagenta: '#FF92DF',
      brightCyan: '#A4FFFF',
      brightWhite: '#FFFFFF',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    accent: '#88C0D0',
    chrome: {
      background: '#242933',
      panel: '#2E3440',
      border: '#3B4252',
      text: '#E5E9F0',
      dim: '#7B88A1',
    },
    terminal: {
      background: '#2E3440',
      foreground: '#D8DEE9',
      cursor: '#88C0D0',
      selectionBackground: '#434C5E',
      black: '#3B4252',
      red: '#BF616A',
      green: '#A3BE8C',
      yellow: '#EBCB8B',
      blue: '#81A1C1',
      magenta: '#B48EAD',
      cyan: '#88C0D0',
      white: '#E5E9F0',
      brightBlack: '#4C566A',
      brightRed: '#D08770',
      brightGreen: '#B9D5A0',
      brightYellow: '#F5E0A3',
      brightBlue: '#9FB8D6',
      brightMagenta: '#C9A6C4',
      brightCyan: '#9FD6E3',
      brightWhite: '#ECEFF4',
    },
  },
  {
    id: 'solarized',
    label: 'Solarized Dark',
    accent: '#B58900',
    chrome: {
      background: '#00252e',
      panel: '#01313d',
      border: '#0b4a58',
      text: '#93A1A1',
      dim: '#718b8b',
    },
    terminal: {
      background: '#002B36',
      foreground: '#93A1A1',
      cursor: '#B58900',
      selectionBackground: '#073642',
      black: '#073642',
      red: '#DC322F',
      green: '#859900',
      yellow: '#B58900',
      blue: '#268BD2',
      magenta: '#D33682',
      cyan: '#2AA198',
      white: '#EEE8D5',
      brightBlack: '#586E75',
      brightRed: '#CB4B16',
      brightGreen: '#719E07',
      brightYellow: '#CFA715',
      brightBlue: '#3FA7E0',
      brightMagenta: '#E06FB0',
      brightCyan: '#44B5AC',
      brightWhite: '#FDF6E3',
    },
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox Dark',
    accent: '#FABD2F',
    chrome: {
      background: '#1d2021',
      panel: '#282828',
      border: '#3c3836',
      text: '#EBDBB2',
      dim: '#928374',
    },
    terminal: {
      background: '#282828',
      foreground: '#EBDBB2',
      cursor: '#FABD2F',
      selectionBackground: '#504945',
      black: '#282828',
      red: '#FB4934',
      green: '#B8BB26',
      yellow: '#FABD2F',
      blue: '#83A598',
      magenta: '#D3869B',
      cyan: '#8EC07C',
      white: '#EBDBB2',
      brightBlack: '#928374',
      brightRed: '#FB4934',
      brightGreen: '#B8BB26',
      brightYellow: '#FABD2F',
      brightBlue: '#83A598',
      brightMagenta: '#D3869B',
      brightCyan: '#8EC07C',
      brightWhite: '#FBF1C7',
    },
  },
  {
    id: 'paper',
    label: 'Paper (light)',
    accent: '#0F766E',
    chrome: {
      background: '#F6F6F4',
      panel: '#FFFFFF',
      border: '#DCDCD8',
      text: '#1F2328',
      dim: '#6B7280',
    },
    terminal: {
      background: '#FCFCFA',
      foreground: '#2B2B2B',
      cursor: '#0F766E',
      selectionBackground: '#CDE7E3',
      black: '#2B2B2B',
      red: '#C0392B',
      green: '#1A7F37',
      yellow: '#9A6700',
      blue: '#0969DA',
      magenta: '#8250DF',
      cyan: '#0F766E',
      white: '#6E7781',
      brightBlack: '#57606A',
      brightRed: '#D1242F',
      brightGreen: '#1A7F37',
      brightYellow: '#BF8700',
      brightBlue: '#218BFF',
      brightMagenta: '#A475F9',
      brightCyan: '#14B8A6',
      brightWhite: '#1F2328',
    },
  },
  {
    id: 'custom',
    label: 'Custom colours',
    accent: '#00FF41',
    chrome: {
      background: '#0F0F10',
      panel: '#161618',
      border: '#2A2A2E',
      text: '#E0E0E5',
      dim: '#88888E',
    },
    terminal: {
      background: '#0A0A0B',
      foreground: '#D7DAE0',
      cursor: '#22C55E',
      selectionBackground: '#264F78',
    },
  },
];

export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

/** Terminal palette for the current settings, applying custom colours. */
interface ThemeSource {
  theme: string;
  custom: {
    background?: string;
    foreground?: string;
    cursor?: string;
    selection?: string;
    accent?: string;
  };
}

export function terminalTheme(settings: ThemeSource): XtermTheme {
  const base = themeById(settings.theme);
  if (settings.theme !== 'custom') return base.terminal;
  return {
    ...base.terminal,
    background: settings.custom.background || base.terminal.background,
    foreground: settings.custom.foreground || base.terminal.foreground,
    cursor: settings.custom.cursor || base.terminal.cursor,
    selectionBackground: settings.custom.selection || base.terminal.selectionBackground,
  };
}

/** Publish the theme to CSS variables so the app chrome matches the terminal. */
export function applyUiTheme(settings: ThemeSource): void {
  const t = themeById(settings.theme);
  const root = document.documentElement;
  const accent = (settings.theme === 'custom' && settings.custom.accent) || t.accent;
  root.style.setProperty('--ui-accent', accent);
  root.style.setProperty('--ui-bg', t.chrome.background);
  root.style.setProperty('--ui-panel', t.chrome.panel);
  root.style.setProperty('--ui-border', t.chrome.border);
  root.style.setProperty('--ui-text', t.chrome.text);
  root.style.setProperty('--ui-dim', t.chrome.dim);
  root.style.setProperty('--ui-terminal-bg', terminalTheme(settings).background);
  root.dataset.theme = t.id;
}
