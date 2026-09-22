import os from 'os';
import path from 'path';

export interface HerdrThemeKeys {
  autoSwitch: boolean;
  darkName: string;
  lightName: string;
}

/** The three keys this module is allowed to touch. */
type ThemeKey = 'auto_switch' | 'dark_name' | 'light_name';

/** Where Herdr keeps its config, per platform. The same rule Herdr documents. */
export function herdrConfigPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  if (platform === 'win32') {
    const appData = env.APPDATA || path.win32.join(home, 'AppData', 'Roaming');
    return path.win32.join(appData, 'herdr', 'config.toml');
  }
  const base = env.XDG_CONFIG_HOME || path.posix.join(home, '.config');
  return path.posix.join(base, 'herdr', 'config.toml');
}

/**
 * The extent of the `[theme]` table.
 *
 * It runs from its own header to the next table, except for sub-tables of the theme
 * (`[theme.custom]`, `[theme.custom.light]`), which belong to it. Editing outside that
 * range is the one thing this module must never do: the rest of the file is the user's.
 */
function themeRange(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => /^\s*\[\s*theme\s*\]\s*$/.test(line));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[/.test(lines[i]) && !/^\s*\[\s*theme\s*[.\]]/.test(lines[i])) {
      return { start, end: i };
    }
  }
  return { start, end: lines.length };
}

/** What the theme table currently says, commented-out lines read as unset. */
export function readHerdrThemeKeys(toml: string): Partial<HerdrThemeKeys> {
  const lines = toml.split('\n');
  const range = themeRange(lines);
  if (!range) return {};
  const found: Partial<HerdrThemeKeys> = {};
  for (let i = range.start + 1; i < range.end; i += 1) {
    const match = /^\s*(auto_switch|dark_name|light_name)\s*=\s*(.+?)\s*$/.exec(lines[i]);
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw.replace(/^["']|["']$/g, '');
    if (key === 'auto_switch') found.autoSwitch = value === 'true';
    if (key === 'dark_name') found.darkName = value;
    if (key === 'light_name') found.lightName = value;
  }
  return found;
}

/**
 * Set the three theme keys, and nothing else.
 *
 * Existing lines are replaced in place - including the commented examples Herdr ships,
 * which is what keeps the result readable instead of duplicating a documented default -
 * and the rest of the file is copied through byte for byte.
 */
export function setHerdrThemeKeys(toml: string, keys: HerdrThemeKeys): string {
  const wanted: [string, string][] = [
    ['auto_switch', keys.autoSwitch ? 'true' : 'false'],
    ['dark_name', `"${keys.darkName}"`],
    ['light_name', `"${keys.lightName}"`],
  ];
  const lines = toml.split('\n');
  const range = themeRange(lines);

  if (!range) {
    const base = toml === '' || toml.endsWith('\n') ? toml : `${toml}\n`;
    const block = wanted.map(([key, value]) => `${key} = ${value}`).join('\n');
    return `${base}${base === '' ? '' : '\n'}[theme]\n${block}\n`;
  }

  const kept: string[] = [];
  const written = new Set<string>();
  for (let i = range.start + 1; i < range.end; i += 1) {
    const match = /^\s*#?\s*(auto_switch|dark_name|light_name)\s*=/.exec(lines[i]);
    if (!match) {
      kept.push(lines[i]);
      continue;
    }
    const key = match[1] as ThemeKey;
    const value = wanted.find(([name]) => name === key)?.[1];
    if (value === undefined || written.has(key)) continue;
    kept.push(`${key} = ${value}`);
    written.add(key);
  }

  const missing = wanted
    .filter(([key]) => !written.has(key))
    .map(([key, value]) => `${key} = ${value}`);

  return [...lines.slice(0, range.start + 1), ...missing, ...kept, ...lines.slice(range.end)].join(
    '\n',
  );
}
