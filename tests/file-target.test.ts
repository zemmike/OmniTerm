import { describe, expect, it } from 'vitest';
import {
  basenameOf,
  clampListWidth,
  dirnameOf,
  LIST_PANEL_DEFAULT,
  LIST_PANEL_MAX,
  LIST_PANEL_MIN,
  normalizeTargetPath,
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
