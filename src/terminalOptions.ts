import type { TerminalSettings } from './settings';
import { terminalTheme, type XtermTheme } from './themes';

export interface LiveTerminalOptions {
  theme?: XtermTheme;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
  scrollback?: number;
}

export function applyTerminalSettings(
  options: LiveTerminalOptions,
  settings: TerminalSettings,
  refit: () => void,
): void {
  options.theme = terminalTheme(settings);
  options.fontFamily = settings.fontFamily;
  options.fontSize = settings.fontSize;
  options.lineHeight = settings.lineHeight;
  options.cursorStyle = settings.cursorStyle;
  options.cursorBlink = settings.cursorBlink;
  options.scrollback = settings.scrollback;
  refit();
}

export function applyTerminalSettingsWhenVisible(
  options: LiveTerminalOptions,
  update: {
    settings: TerminalSettings;
    visible: boolean;
    fontChanged: boolean;
    refit: () => void;
    refresh: () => void;
  },
): boolean {
  if (!update.visible) return false;
  applyTerminalSettings(options, update.settings, () => {
    if (update.fontChanged) update.refit();
  });
  update.refresh();
  return true;
}
