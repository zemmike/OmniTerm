import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { herdrConfigPath, readHerdrThemeKeys, setHerdrThemeKeys } from '../herdrConfig';

const fixture = fs.readFileSync(
  path.resolve(import.meta.dirname, '../docs/herdr/fixtures/default-config.toml'),
  'utf8',
);
const keys = { autoSwitch: true, darkName: 'terminal', lightName: 'terminal' };

describe('herdrConfigPath', () => {
  it('follows the platform rule Herdr documents', () => {
    expect(herdrConfigPath('linux', {}, '/home/m')).toBe('/home/m/.config/herdr/config.toml');
    expect(herdrConfigPath('darwin', {}, '/Users/m')).toBe('/Users/m/.config/herdr/config.toml');
    expect(
      herdrConfigPath('win32', { APPDATA: 'C:\\Users\\m\\AppData\\Roaming' }, 'C:\\Users\\m'),
    ).toBe('C:\\Users\\m\\AppData\\Roaming\\herdr\\config.toml');
  });

  it('honours XDG_CONFIG_HOME', () => {
    expect(herdrConfigPath('linux', { XDG_CONFIG_HOME: '/custom/cfg' }, '/home/m')).toBe(
      '/custom/cfg/herdr/config.toml',
    );
  });
});

describe('readHerdrThemeKeys', () => {
  it('reads nothing from a config whose theme keys are all commented out', () => {
    // The fixture is Herdr's real default: every theme key is a commented example.
    expect(readHerdrThemeKeys(fixture)).toEqual({});
  });

  it('reads active values', () => {
    const text =
      '[theme]\nauto_switch = true\ndark_name = "nord"\nlight_name = "catppuccin-latte"\n';
    expect(readHerdrThemeKeys(text)).toEqual({
      autoSwitch: true,
      darkName: 'nord',
      lightName: 'catppuccin-latte',
    });
  });

  it('returns nothing when there is no theme table', () => {
    expect(readHerdrThemeKeys('[terminal]\nshell = "bash"\n')).toEqual({});
  });
});

describe('setHerdrThemeKeys', () => {
  const after = setHerdrThemeKeys(fixture, keys);

  it('writes all three keys, exactly once', () => {
    for (const key of ['auto_switch = true', 'dark_name = "terminal"', 'light_name = "terminal"']) {
      expect(after.split(key).length - 1).toBe(1);
    }
  });

  it("leaves every other line of the user's config alone", () => {
    // The default config ships a large commented body; the sections after [theme] must be
    // untouched, and the file must not grow a second copy of anything.
    for (const landmark of ['[terminal]', '[keys]', '[ui]', '[update]']) {
      expect(fixture).toContain(landmark);
      expect(after.split(landmark).length - 1).toBe(fixture.split(landmark).length - 1);
    }
    // The commented example on its own line survives; `dark_name = "catppuccin"` is replaced,
    // and a substring match on `name = "catppuccin"` would count it by mistake.
    expect(after).toContain('\n# name = "catppuccin"');
    // Only the three key lines change length; nothing is added or removed.
    expect(after.split('\n').length).toBe(fixture.split('\n').length);
  });

  it('keeps theme sub-table colour overrides', () => {
    const custom =
      '[theme]\nname = "nord"\n\n[theme.custom]\nsidebar_bg = "#181825"\n\n[terminal]\nshell = "bash"\n';
    const written = setHerdrThemeKeys(custom, keys);
    expect(written).toContain('sidebar_bg = "#181825"');
    expect(written).toContain('name = "nord"');
    expect(written).toContain('[terminal]');
    expect(written).toContain('dark_name = "terminal"');
  });

  it('is idempotent', () => {
    expect(setHerdrThemeKeys(after, keys)).toBe(after);
  });

  it('appends a theme table when there is none', () => {
    const written = setHerdrThemeKeys('[terminal]\nshell = "bash"\n', keys);
    expect(written).toContain('[theme]');
    expect(written).toContain('auto_switch = true');
    expect(written.indexOf('[theme]')).toBeGreaterThan(written.indexOf('[terminal]'));
    expect(readHerdrThemeKeys(written)).toEqual({
      autoSwitch: true,
      darkName: 'terminal',
      lightName: 'terminal',
    });
  });

  it('creates a file from nothing', () => {
    const written = setHerdrThemeKeys('', keys);
    expect(readHerdrThemeKeys(written)).toEqual({
      autoSwitch: true,
      darkName: 'terminal',
      lightName: 'terminal',
    });
  });
});
