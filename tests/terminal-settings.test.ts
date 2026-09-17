import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { applyTerminalSettings } from '../src/terminalOptions';

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
