import { describe, expect, it } from 'vitest';
import {
  looksLikePath,
  parseReaderText,
  stripAnsi,
  stripTerminalFurniture,
} from '../src/readerMarkdown';

describe('stripAnsi', () => {
  it('removes colour and cursor sequences', () => {
    expect(stripAnsi('\u001b[31mred\u001b[0m text')).toBe('red text');
    expect(stripAnsi('\u001b[2K\u001b[1Gclean')).toBe('clean');
  });

  it('removes OSC titles and hyperlinks', () => {
    expect(stripAnsi('\u001b]0;Claude Code\u0007hello')).toBe('hello');
  });

  it('leaves ordinary text untouched', () => {
    expect(stripAnsi('## Heading\n- a bullet')).toBe('## Heading\n- a bullet');
  });
});

describe('stripTerminalFurniture', () => {
  it('removes box drawing and the padding it held', () => {
    expect(stripTerminalFurniture('│ content │')).toBe('  content');
    // A border-only line is furniture and nothing else, so it disappears entirely.
    expect(stripTerminalFurniture('┌──────────┐')).toBe('');
    expect(stripTerminalFurniture('╭──────────╮')).toBe('');
  });

  it('removes a leading spinner frame but keeps the message', () => {
    expect(stripTerminalFurniture('⠋ Working for 21s')).toBe('Working for 21s');
    expect(stripTerminalFurniture('✻ Thinking…')).toBe('Thinking…');
  });

  it('trims the padding that only exists to fill the pane', () => {
    expect(stripTerminalFurniture('short line          ')).toBe('short line');
  });
});

describe('parseReaderText', () => {
  const kinds = (text: string) => parseReaderText(text).map((block) => block.kind);

  it('recognises headings by level', () => {
    const blocks = parseReaderText('# One\n## Two\n### Three');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'One' },
      { kind: 'heading', level: 2, text: 'Two' },
      { kind: 'heading', level: 3, text: 'Three' },
    ]);
  });

  it('recognises bullets and numbered steps, keeping the marker', () => {
    expect(parseReaderText('- first\n* second\n1. third\n2) fourth')).toEqual([
      { kind: 'bullet', marker: '-', text: 'first' },
      { kind: 'bullet', marker: '*', text: 'second' },
      { kind: 'bullet', marker: '1.', text: 'third' },
      { kind: 'bullet', marker: '2)', text: 'fourth' },
    ]);
  });

  it('collects fenced code as one block with its language', () => {
    const blocks = parseReaderText('Text before\n```ts\nconst a = 1;\nconst b = 2;\n```\nAfter');
    expect(blocks).toEqual([
      { kind: 'text', text: 'Text before' },
      { kind: 'code', text: 'const a = 1;\nconst b = 2;', lang: 'ts' },
      { kind: 'text', text: 'After' },
    ]);
  });

  it('shows an unterminated fence as code rather than dropping it', () => {
    // What a response that is still streaming looks like.
    const blocks = parseReaderText('```bash\nnpm run build');
    expect(blocks).toEqual([{ kind: 'code', text: 'npm run build', lang: 'bash' }]);
  });

  it('keeps quotes separate from paragraphs', () => {
    expect(parseReaderText('> note this\nplain')).toEqual([
      { kind: 'quote', text: 'note this' },
      { kind: 'text', text: 'plain' },
    ]);
  });

  it('joins wrapped lines into one paragraph but honours blank lines', () => {
    const blocks = parseReaderText('one line\nwrapped second\n\nnew paragraph');
    expect(blocks).toEqual([
      { kind: 'text', text: 'one line\nwrapped second' },
      { kind: 'text', text: 'new paragraph' },
    ]);
  });

  it('turns a real agent screen into blocks, not a wall of borders', () => {
    const screen = [
      '╭──────────────────────────────╮',
      '│ \u001b[1m## Plan\u001b[0m                      │',
      '│                              │',
      '│ 1. Read the file             │',
      '│ 2. Change the parser         │',
      '│                              │',
      '│ ```ts                        │',
      '│ export const x = 1;          │',
      '│ ```                          │',
      '╰──────────────────────────────╯',
    ].join('\n');
    const blocks = parseReaderText(screen);
    expect(kinds(screen)).toEqual(['heading', 'bullet', 'bullet', 'code']);
    expect(blocks[0]).toEqual({ kind: 'heading', level: 2, text: 'Plan' });
    expect(blocks[3]).toEqual({ kind: 'code', text: 'export const x = 1;', lang: 'ts' });
  });

  it('handles empty input without inventing blocks', () => {
    expect(parseReaderText('')).toEqual([]);
    expect(parseReaderText('\n\n   \n')).toEqual([]);
    expect(parseReaderText('\u001b[2J\u001b[H')).toEqual([]);
  });
});

describe('looksLikePath', () => {
  it('accepts the shapes agents actually print', () => {
    expect(looksLikePath('/home/michael/app.ts')).toBe(true);
    expect(looksLikePath('./src/index.tsx')).toBe(true);
    expect(looksLikePath('../lib/util.ts')).toBe(true);
    expect(looksLikePath('src/components/TerminalView.tsx')).toBe(true);
    expect(looksLikePath('package.json')).toBe(true);
  });

  it('refuses words and prose that would make bad click targets', () => {
    expect(looksLikePath('README')).toBe(false);
    expect(looksLikePath('and')).toBe(false);
    expect(looksLikePath('e.g.')).toBe(false);
    expect(looksLikePath('')).toBe(false);
  });
});
