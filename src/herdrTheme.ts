/**
 * OmniTerm theme -> Herdr theme names.
 *
 * Herdr's `[theme] auto_switch` follows the host terminal's light/dark appearance, and its
 * built-in `terminal` theme takes the terminal's own palette. That combination is a better
 * match than any name-to-name mapping: Herdr ends up using the colours OmniTerm is actually
 * drawing with, instead of an approximation of them.
 */
import type { HerdrThemeKeys } from '../herdrConfig';

export const HERDR_BUILT_IN_THEMES = [
  'catppuccin',
  'catppuccin-latte',
  'terminal',
  'tokyo-night',
  'dracula',
  'nord',
  'gruvbox',
  'one-dark',
  'solarized',
  'kanagawa',
  'rose-pine',
  'vesper',
] as const;

const BUILT_IN = new Set<string>(HERDR_BUILT_IN_THEMES);

/** Herdr refuses an unknown theme name at load time; this refuses it earlier. */
export function isHerdrThemeName(name: string): boolean {
  return BUILT_IN.has(name);
}

/**
 * The keys OmniTerm writes for a given theme.
 *
 * Both names are `terminal`: Herdr then paints itself with the palette OmniTerm is using,
 * and follows it when the light/dark scheme flips. `themeId` is accepted so a future
 * name-to-name mapping can be added without changing the call sites.
 */
export function herdrThemeKeysFor(
  _themeId: string,
  overrides: { darkName?: string; lightName?: string } = {},
): HerdrThemeKeys {
  const darkName =
    overrides.darkName && isHerdrThemeName(overrides.darkName) ? overrides.darkName : 'terminal';
  const lightName =
    overrides.lightName && isHerdrThemeName(overrides.lightName) ? overrides.lightName : 'terminal';
  return { autoSwitch: true, darkName, lightName };
}
