import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEARCH_SKIP, searchDirectory } from '../fileSearch';

let root: string;

const make = (relative: string, content = 'x') => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'omniterm-search-'));
  make('app.ts');
  make('readme.md');
  make('src/app.ts');
  make('src/components/AppShell.tsx');
  make('src/components/nested/deep/AppHelper.ts');
  make('docs/APPENDIX.md');
  // Directories that must not be walked into.
  for (const skipped of SEARCH_SKIP) make(`${skipped}/app.ts`);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('searchDirectory', () => {
  it('finds matches in subdirectories, not just the top level', () => {
    const found = searchDirectory(root, 'app');
    const paths = found.results
      .map((hit) => path.relative(root, hit.path).split(path.sep).join('/'))
      .sort();
    expect(paths).toEqual([
      'app.ts',
      'docs/APPENDIX.md',
      'src/app.ts',
      'src/components/AppShell.tsx',
      'src/components/nested/deep/AppHelper.ts',
    ]);
  });

  it('is case-insensitive', () => {
    const lower = searchDirectory(root, 'appshell').results.map((hit) => hit.name);
    const upper = searchDirectory(root, 'APPSHELL').results.map((hit) => hit.name);
    expect(lower).toEqual(['AppShell.tsx']);
    expect(upper).toEqual(lower);
  });

  it('does not walk into node_modules, .git, build output or virtualenvs', () => {
    const found = searchDirectory(root, 'app');
    for (const hit of found.results) {
      const relative = path.relative(root, hit.path);
      const first = relative.split(path.sep)[0];
      expect(SEARCH_SKIP.has(first)).toBe(false);
    }
  });

  it('reports the directory it searched and how much it examined', () => {
    const found = searchDirectory(root, 'app');
    expect(found.root).toBe(root);
    expect(found.query).toBe('app');
    expect(found.visited).toBeGreaterThan(0);
    expect(found.truncated).toBe(false);
    expect(found.limitReached).toBeNull();
  });

  it('says it was truncated instead of implying it finished', () => {
    const found = searchDirectory(root, 'app', { maxResults: 2 });
    expect(found.results).toHaveLength(2);
    expect(found.truncated).toBe(true);
    expect(found.limitReached).toBe('results');
  });

  it('stops on the visited cap when a tree is enormous', () => {
    const found = searchDirectory(root, 'app', { maxVisited: 2 });
    expect(found.truncated).toBe(true);
    expect(found.limitReached).toBe('visited');
  });

  it('stops at the depth cap', () => {
    const found = searchDirectory(root, 'helper', { maxDepth: 1 });
    expect(found.results).toHaveLength(0);
    expect(found.limitReached).toBe('depth');
  });

  it('returns nothing for an empty query without walking', () => {
    const found = searchDirectory(root, '');
    expect(found.results).toEqual([]);
    expect(found.visited).toBe(0);
  });

  it('returns nothing rather than throwing for a missing directory', () => {
    const found = searchDirectory(path.join(root, 'does-not-exist'), 'app');
    expect(found.results).toEqual([]);
    expect(found.truncated).toBe(false);
  });

  it('marks directories so the UI can open them instead of reading them', () => {
    // `src/components` already exists as a real directory, created by the file inside it.
    const found = searchDirectory(root, 'components');
    const dir = found.results.find((hit) => hit.name === 'components');
    expect(dir?.isDirectory).toBe(true);
    expect(dir?.size).toBe(0);
  });
});
