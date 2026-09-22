import { describe, expect, it } from 'vitest';
import { HERDR_BUILT_IN_THEMES, herdrThemeKeysFor, isHerdrThemeName } from '../src/herdrTheme';

describe('isHerdrThemeName', () => {
  it('accepts the built-ins Herdr documents', () => {
    for (const name of HERDR_BUILT_IN_THEMES) expect(isHerdrThemeName(name)).toBe(true);
  });

  it('rejects anything else, including shell-ish strings', () => {
    // The value ends up inside a TOML file, and the allowlist is what keeps it a theme name.
    for (const name of ['', 'nord ', 'terminal; rm -rf /', '$(whoami)', 'nord"\ndark_name = "x']) {
      expect(isHerdrThemeName(name)).toBe(false);
    }
  });
});

describe('herdrThemeKeysFor', () => {
  it('uses the terminal palette for both schemes, so Herdr matches OmniTerm exactly', () => {
    expect(herdrThemeKeysFor('matrix')).toEqual({
      autoSwitch: true,
      darkName: 'terminal',
      lightName: 'terminal',
    });
    expect(herdrThemeKeysFor('paper')).toEqual({
      autoSwitch: true,
      darkName: 'terminal',
      lightName: 'terminal',
    });
  });

  it('takes an override only when it is a real theme name', () => {
    expect(herdrThemeKeysFor('nord', { darkName: 'nord' }).darkName).toBe('nord');
    expect(herdrThemeKeysFor('nord', { darkName: 'not-a-theme' }).darkName).toBe('terminal');
    expect(herdrThemeKeysFor('nord', { lightName: 'catppuccin-latte' }).lightName).toBe(
      'catppuccin-latte',
    );
  });

  it('always switches automatically, because that is the point', () => {
    expect(herdrThemeKeysFor('gruvbox').autoSwitch).toBe(true);
  });
});
