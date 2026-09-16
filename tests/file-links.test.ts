import { describe, expect, it } from 'vitest';
import { resolveTerminalPath, terminalFileLinks } from '../src/fileLinks';

describe('terminal file links', () => {
  it('finds absolute and relative paths with source locations', () => {
    const links = terminalFileLinks(
      'error at src/App.tsx:42:7 and /tmp/build.log:9',
      '/home/michael/project',
      '/home/michael',
    );
    expect(links.map((link) => link.path)).toEqual([
      '/home/michael/project/src/App.tsx',
      '/tmp/build.log',
    ]);
    expect(links[0]).toMatchObject({ line: 42, column: 7 });
    expect(links[1]).toMatchObject({ line: 9 });
  });

  it('resolves home and dot segments', () => {
    expect(resolveTerminalPath('~/notes/todo.md', '/tmp', '/home/me')).toBe(
      '/home/me/notes/todo.md',
    );
    expect(resolveTerminalPath('../README.md', '/home/me/project/src', '/home/me')).toBe(
      '/home/me/project/README.md',
    );
  });

  it('does not turn web URLs into file links', () => {
    expect(terminalFileLinks('see https://example.com/a/b', '/tmp', '/home/me')).toEqual([]);
  });

  it('recognises a bare filename relative to the pane cwd', () => {
    expect(terminalFileLinks('[README.md:12]', '/work/project', '/home/me')[0]).toMatchObject({
      path: '/work/project/README.md',
      line: 12,
    });
  });

  it('recognises common extensionless project files without linking ordinary words', () => {
    const links = terminalFileLinks(
      'Edit Dockerfile and LICENSE, then run the build',
      '/work/project',
      '/home/me',
    );
    expect(links.map((link) => link.path)).toEqual([
      '/work/project/Dockerfile',
      '/work/project/LICENSE',
    ]);
  });
});
