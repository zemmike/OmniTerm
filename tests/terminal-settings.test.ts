import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { applyTerminalSettings, applyTerminalSettingsWhenVisible } from '../src/terminalOptions';

describe('applyTerminalSettings', () => {
  it('updates font and all other live xterm options, then refits', () => {
    const options: Record<string, unknown> = {};
    const fit = vi.fn();
    const settings = {
      ...DEFAULT_SETTINGS,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: 17,
      lineHeight: 1.4,
      cursorStyle: 'bar' as const,
      cursorBlink: false,
      scrollback: 22000,
    };

    applyTerminalSettings(options, settings, fit);

    expect(options).toMatchObject({
      fontFamily: settings.fontFamily,
      fontSize: 17,
      lineHeight: 1.4,
      cursorStyle: 'bar',
      cursorBlink: false,
      scrollback: 22000,
    });
    expect(options.theme).toBeTruthy();
    expect(fit).toHaveBeenCalledOnce();
  });
});

describe('applyTerminalSettingsWhenVisible', () => {
  it('defers every renderer mutation while the terminal is hidden', () => {
    const options: Record<string, unknown> = { fontSize: 13 };
    const refit = vi.fn();
    const refresh = vi.fn();

    const applied = applyTerminalSettingsWhenVisible(options, {
      settings: { ...DEFAULT_SETTINGS, theme: 'dracula', fontSize: 17 },
      visible: false,
      fontChanged: true,
      refit,
      refresh,
    });

    expect(applied).toBe(false);
    expect(options).toEqual({ fontSize: 13 });
    expect(refit).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('applies the latest settings and redraws after the terminal becomes visible', () => {
    const options: Record<string, unknown> = { fontSize: 13 };
    const refit = vi.fn();
    const refresh = vi.fn();
    const settings = { ...DEFAULT_SETTINGS, theme: 'dracula', fontSize: 17 };

    const applied = applyTerminalSettingsWhenVisible(options, {
      settings,
      visible: true,
      fontChanged: true,
      refit,
      refresh,
    });

    expect(applied).toBe(true);
    expect(options.fontSize).toBe(17);
    expect(options.theme).toBeTruthy();
    expect(refit).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
