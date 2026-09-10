import { useSyncExternalStore } from 'react';

/**
 * User settings, persisted per machine in localStorage and read live by every
 * component through useSettings(). One store, so the Settings tab, the header
 * and the terminals can never disagree.
 */
export interface TerminalSettings {
  /** Theme id from themes.ts, or 'custom' to use the colour fields below. */
  theme: string;
  custom: {
    background: string;
    foreground: string;
    cursor: string;
    selection: string;
    accent: string;
  };
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  scrollback: number;
  /** Select text with the mouse and it goes straight to the clipboard. */
  copyOnSelect: boolean;
  /** Middle click pastes the clipboard (X11 primary selection on paste). */
  middleClickPaste: boolean;
  /** Typing `git` then Up/Down cycles only commands starting with `git`. */
  prefixHistory: boolean;
  /** Show `exit 0 · 1.2s` next to each prompt line. */
  commandDecorations: boolean;
  /** Right click opens a context menu; off means it does nothing. */
  contextMenu: boolean;
  /** actionId -> binding, e.g. { newTab: 'Ctrl+Shift+T' }. */
  shortcuts: Record<string, string>;
}

export const FONT_STACKS: { label: string; value: string }[] = [
  {
    label: 'System monospace',
    value: 'ui-monospace, SFMono-Regular, "DejaVu Sans Mono", Menlo, Consolas, monospace',
  },
  { label: 'DejaVu Sans Mono', value: '"DejaVu Sans Mono", ui-monospace, monospace' },
  { label: 'Liberation Mono', value: '"Liberation Mono", ui-monospace, monospace' },
  { label: 'Noto Sans Mono', value: '"Noto Sans Mono", ui-monospace, monospace' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
];

export const DEFAULT_SETTINGS: TerminalSettings = {
  theme: 'matrix',
  custom: {
    background: '#0A0A0B',
    foreground: '#D7DAE0',
    cursor: '#22C55E',
    selection: '#264F78',
    accent: '#00FF41',
  },
  fontFamily: FONT_STACKS[0].value,
  fontSize: 13,
  lineHeight: 1.2,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: true,
  middleClickPaste: true,
  prefixHistory: true,
  commandDecorations: true,
  contextMenu: true,
  shortcuts: {},
};

const KEY = 'omniterm_settings_v1';

function read(): TerminalSettings {
  const base: TerminalSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      ...base,
      ...parsed,
      custom: { ...base.custom, ...(parsed.custom || {}) },
      shortcuts: { ...(parsed.shortcuts || {}) },
    };
  } catch {
    return base;
  }
}

let current: TerminalSettings = read();
const listeners = new Set<() => void>();

export function getSettings(): TerminalSettings {
  return current;
}

export function updateSettings(patch: Partial<TerminalSettings>): void {
  current = {
    ...current,
    ...patch,
    custom: { ...current.custom, ...(patch.custom || {}) },
    shortcuts: { ...current.shortcuts, ...(patch.shortcuts || {}) },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage full or blocked — the session still works, it just will not persist */
  }
  listeners.forEach((l) => l());
}

export function resetSettings(): void {
  current = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): [TerminalSettings, (patch: Partial<TerminalSettings>) => void] {
  const snapshot = useSyncExternalStore(subscribe, getSettings, getSettings);
  return [snapshot, updateSettings];
}
