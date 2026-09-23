import { describe, expect, it } from 'vitest';
import { isWebLink, toHref } from '../src/links';
import { parseInlineText, looksLikePath } from '../src/readerMarkdown';
import { terminalFileLinks } from '../src/fileLinks';

describe('links vs file paths', () => {
  it.each([
    'https://github.com/zemmike/OmniTerm',
    'http://localhost:3000/api',
    'www.example.com/page',
    'github.com/zemmike/OmniTerm',
    'claude.ai',
  ])('%s is a link', (value) => {
    expect(isWebLink(value)).toBe(true);
    expect(looksLikePath(value)).toBe(false);
  });

  it.each(['src/app.ts', './run.sh', '/etc/hosts', 'README.md', 'docs/herdr/findings.md:12'])(
    '%s is a path',
    (value) => {
      expect(isWebLink(value)).toBe(false);
      expect(looksLikePath(value)).toBe(true);
    },
  );

  it('the reader makes links and paths different tokens', () => {
    const tokens = parseInlineText('See https://github.com/a/b and src/app.ts.');
    expect(tokens.filter((t) => t.kind === 'link').map((t) => t.value)).toEqual([
      'https://github.com/a/b',
    ]);
    expect(tokens.filter((t) => t.kind === 'path').map((t) => t.value)).toEqual(['src/app.ts']);
    expect(toHref('github.com/a')).toBe('https://github.com/a');
  });

  it('the terminal never offers a URL as a file', () => {
    const line = 'open https://github.com/a/b/c or github.com/a/b, then src/app.ts:4';
    expect(terminalFileLinks(line, '/home/u', '/home/u').map((l) => l.text)).toEqual([
      'src/app.ts:4',
    ]);
  });
});
