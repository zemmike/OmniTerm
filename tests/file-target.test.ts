import { describe, expect, it } from 'vitest';
import {
  basenameOf,
  clampListWidth,
  dirnameOf,
  LIST_PANEL_DEFAULT,
  LIST_PANEL_MAX,
  LIST_PANEL_MIN,
  normalizeTargetPath,
  expandTilde,
  resolveTargetPath,
  stripLineSuffix,
} from '../src/fileTarget';

describe('normalizeTargetPath', () => {
  it('leaves a clean absolute path alone', () => {
    expect(normalizeTargetPath('/home/michael/conductor.config.js')).toBe(
      '/home/michael/conductor.config.js',
    );
  });

  it('strips the punctuation that follows a path in a sentence', () => {
    // This is how a path arrives from terminal output: "see /etc/hosts, then ...".
    expect(normalizeTargetPath('/etc/hosts,')).toBe('/etc/hosts');
    expect(normalizeTargetPath('/var/log/syslog.')).toBe('/var/log/syslog');
    expect(normalizeTargetPath('/etc/hosts;')).toBe('/etc/hosts');
    expect(normalizeTargetPath("'/home/michael/app.ts'")).toBe('/home/michael/app.ts');
    expect(normalizeTargetPath('`package.json`')).toBe('package.json');
    expect(normalizeTargetPath('/tmp/(copy)')).toBe('/tmp/(copy');
  });

  it('keeps dots that are part of the file name', () => {
    expect(normalizeTargetPath('conductor.config.js')).toBe('conductor.config.js');
    expect(normalizeTargetPath('/home/michael/.env.local')).toBe('/home/michael/.env.local');
  });

  it('collapses duplicate slashes but not a URL scheme', () => {
    expect(normalizeTargetPath('/home//michael///file.ts')).toBe('/home/michael/file.ts');
    expect(normalizeTargetPath('https://example.com/a')).toBe('https://example.com/a');
  });

  it('tolerates empty input', () => {
    expect(normalizeTargetPath('')).toBe('');
    expect(normalizeTargetPath('   ')).toBe('');
  });
});

describe('basenameOf / dirnameOf', () => {
  it('splits files and folders apart', () => {
    expect(basenameOf('/home/michael/conductor.config.js')).toBe('conductor.config.js');
    expect(dirnameOf('/home/michael/conductor.config.js')).toBe('/home/michael');
    expect(basenameOf('README')).toBe('README');
    expect(dirnameOf('/README')).toBe('/');
    expect(basenameOf('/a/b/')).toBe('b');
  });
});

describe('clampListWidth', () => {
  it('holds the panel inside its range', () => {
    expect(clampListWidth(10)).toBe(LIST_PANEL_MIN);
    expect(clampListWidth(5000)).toBe(LIST_PANEL_MAX);
    expect(clampListWidth(420)).toBe(420);
    expect(clampListWidth(Number.NaN)).toBe(LIST_PANEL_DEFAULT);
  });
});

describe('stripLineSuffix', () => {
  it('removes line and column numbers', () => {
    expect(stripLineSuffix('src/app.ts:42')).toBe('src/app.ts');
    expect(stripLineSuffix('src/app.ts:42:7')).toBe('src/app.ts');
    expect(stripLineSuffix('src/app.ts(42,7)')).toBe('src/app.ts');
  });

  it('leaves a plain filename alone', () => {
    expect(stripLineSuffix('src/app.ts')).toBe('src/app.ts');
    expect(stripLineSuffix('/home/michael/notes.md')).toBe('/home/michael/notes.md');
  });

  it('accepts the trade-off: a filename genuinely ending in :digits is misread', () => {
    // `file:42` from an agent is overwhelmingly a line number, so stripping is the
    // right default. A real file named `2024:01` loses its suffix - rare, and the
    // reasonable price for making every `file:line` click work. Asserted so the
    // choice is visible rather than accidental.
    expect(stripLineSuffix('/var/log/2024:01')).toBe('/var/log/2024');
  });
});

describe('expandTilde', () => {
  it('expands a leading tilde with the home directory', () => {
    expect(expandTilde('~/notes.md', '/home/michael')).toBe('/home/michael/notes.md');
    expect(expandTilde('~', '/home/michael')).toBe('/home/michael');
  });

  it('does nothing without a home directory to expand into', () => {
    expect(expandTilde('~/notes.md')).toBe('~/notes.md');
    expect(expandTilde('~other/notes.md', '/home/michael')).toBe('~other/notes.md');
  });
});

describe('resolveTargetPath', () => {
  it('resolves a relative path against the pane directory', () => {
    // The bug this exists for: agents print relative paths, and the API only takes
    // absolute ones, so every such click failed with "Path not found".
    expect(resolveTargetPath('src/app.ts', { base: '/home/michael/project' })).toBe(
      '/home/michael/project/src/app.ts',
    );
    expect(resolveTargetPath('./src/app.ts', { base: '/home/michael/project/' })).toBe(
      '/home/michael/project/src/app.ts',
    );
  });

  it('handles the combination that failed most often', () => {
    expect(
      resolveTargetPath('src/components/App.tsx:42:7,', {
        base: '/home/michael/project',
        home: '/home/michael',
      }),
    ).toBe('/home/michael/project/src/components/App.tsx');
  });

  it('expands a tilde path and leaves it absolute', () => {
    expect(resolveTargetPath('~/notes.md', { base: '/tmp', home: '/home/michael' })).toBe(
      '/home/michael/notes.md',
    );
  });

  it('does not touch an absolute path', () => {
    expect(resolveTargetPath('/etc/hosts', { base: '/tmp' })).toBe('/etc/hosts');
  });

  it('returns the relative path when there is no base to resolve against', () => {
    expect(resolveTargetPath('src/app.ts', {})).toBe('src/app.ts');
  });

  it('does nothing at all for empty input', () => {
    expect(resolveTargetPath('', { base: '/tmp' })).toBe('');
    expect(resolveTargetPath('   ', { base: '/tmp' })).toBe('');
  });
});
