import { describe, expect, it } from 'vitest';
import {
  ansiToEmphasis,
  isNoiseLine,
  lastReplyOnly,
  stripNoiseLines,
  looksLikePath,
  parseInlineText,
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
      { kind: 'heading', level: 1, content: [{ kind: 'text', value: 'One' }] },
      { kind: 'heading', level: 2, content: [{ kind: 'text', value: 'Two' }] },
      { kind: 'heading', level: 3, content: [{ kind: 'text', value: 'Three' }] },
    ]);
  });

  it('groups unordered and ordered list items', () => {
    expect(parseReaderText('- first\n* second\n1. third\n2) fourth')).toEqual([
      {
        kind: 'list',
        ordered: false,
        start: 1,
        items: [[{ kind: 'text', value: 'first' }], [{ kind: 'text', value: 'second' }]],
      },
      {
        kind: 'list',
        ordered: true,
        start: 1,
        items: [[{ kind: 'text', value: 'third' }], [{ kind: 'text', value: 'fourth' }]],
      },
    ]);
  });

  it('collects fenced code as one block with its language', () => {
    const blocks = parseReaderText('Text before\n```ts\nconst a = 1;\nconst b = 2;\n```\nAfter');
    expect(blocks).toEqual([
      { kind: 'paragraph', content: [{ kind: 'text', value: 'Text before' }] },
      { kind: 'code', text: 'const a = 1;\nconst b = 2;', lang: 'ts' },
      { kind: 'paragraph', content: [{ kind: 'text', value: 'After' }] },
    ]);
  });

  it('shows an unterminated fence as code rather than dropping it', () => {
    // What a response that is still streaming looks like.
    const blocks = parseReaderText('```bash\nnpm run build');
    expect(blocks).toEqual([{ kind: 'code', text: 'npm run build', lang: 'bash' }]);
  });

  it('keeps quotes separate from paragraphs', () => {
    expect(parseReaderText('> note this\nplain')).toEqual([
      { kind: 'quote', content: [{ kind: 'text', value: 'note this' }] },
      { kind: 'paragraph', content: [{ kind: 'text', value: 'plain' }] },
    ]);
  });

  it('joins wrapped lines into one paragraph but honours blank lines', () => {
    const blocks = parseReaderText('one line\nwrapped second\n\nnew paragraph');
    expect(blocks).toEqual([
      { kind: 'paragraph', content: [{ kind: 'text', value: 'one line\nwrapped second' }] },
      { kind: 'paragraph', content: [{ kind: 'text', value: 'new paragraph' }] },
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
    expect(kinds(screen)).toEqual(['heading', 'list', 'code']);
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 2,
      content: [{ kind: 'text', value: 'Plan' }],
    });
    expect(blocks[2]).toEqual({ kind: 'code', text: 'export const x = 1;', lang: 'ts' });
  });

  it('handles empty input without inventing blocks', () => {
    expect(parseReaderText('')).toEqual([]);
    expect(parseReaderText('\n\n   \n')).toEqual([]);
    expect(parseReaderText('\u001b[2J\u001b[H')).toEqual([]);
  });
});

describe('reader TeX parsing', () => {
  it('parses inline TeX delimited by dollars', () => {
    expect(parseReaderText('Euler: $e^{i\\pi}+1=0$.')).toEqual([
      {
        kind: 'paragraph',
        content: [
          { kind: 'text', value: 'Euler: ' },
          { kind: 'math', value: 'e^{i\\pi}+1=0' },
          { kind: 'text', value: '.' },
        ],
      },
    ]);
  });

  it('parses whole-line display TeX', () => {
    expect(parseReaderText('$$\\int_0^1 x^2 dx$$')).toEqual([
      { kind: 'math', value: '\\int_0^1 x^2 dx', display: true },
    ]);
  });

  it('requires a TeX signal in display math', () => {
    for (const source of ['$$hello$$', '$$20$$', '$$$$']) {
      expect(parseReaderText(source)).toEqual([
        { kind: 'paragraph', content: [{ kind: 'text', value: source }] },
      ]);
    }
  });

  it('keeps currency and unmatched display delimiters as paragraph text', () => {
    expect(parseReaderText('Price is $20 and tax is $2.')).toMatchObject([{ kind: 'paragraph' }]);
    expect(parseReaderText('$$\\frac{1}{2}')).toMatchObject([{ kind: 'paragraph' }]);
  });

  it('parses parenthesized inline TeX', () => {
    expect(parseInlineText('Radius \\(r^2\\)')).toEqual([
      { kind: 'text', value: 'Radius ' },
      { kind: 'math', value: 'r^2' },
    ]);
  });

  it('recognises inline TeX before path-like text', () => {
    expect(parseInlineText('docs/$x^2$/notes.md')).toEqual([
      { kind: 'text', value: 'docs/' },
      { kind: 'math', value: 'x^2' },
      { kind: 'text', value: '/notes.md' },
    ]);
  });
});

describe('reader structural parsing', () => {
  it('groups consecutive unordered list items', () => {
    expect(parseReaderText('- one\n- two')).toMatchObject([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', value: 'one' }], [{ kind: 'text', value: 'two' }]],
      },
    ]);
  });

  it('recognises a pipe table only with a separator row', () => {
    expect(parseReaderText('| Name | Value |\n| --- | ---: |\n| CPU | 42% |')[0].kind).toBe(
      'table',
    );
  });
});

describe('cross-platform reader paths', () => {
  it('accepts Windows drive and UNC paths', () => {
    expect(looksLikePath('C:\\work\\src\\App.tsx')).toBe(true);
    expect(looksLikePath('\\\\server\\share\\notes.md')).toBe(true);
    expect(looksLikePath('src/App.tsx:14:3')).toBe(true);
    expect(parseInlineText('See src/App.tsx:14:3')).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'path', value: 'src/App.tsx:14:3' },
    ]);
  });

  it('refuses backslash prose', () => {
    expect(looksLikePath('yes\\no')).toBe(false);
  });

  it('tokenises paths after ordinary punctuation', () => {
    expect(parseInlineText('(docs/readme.md)')).toEqual([
      { kind: 'text', value: '(' },
      { kind: 'path', value: 'docs/readme.md' },
      { kind: 'text', value: ')' },
    ]);
    expect(parseInlineText('"src/App.tsx"')).toEqual([
      { kind: 'text', value: '"' },
      { kind: 'path', value: 'src/App.tsx' },
      { kind: 'text', value: '"' },
    ]);
    expect(parseInlineText('see:src/App.tsx')).toEqual([
      { kind: 'path', value: 'see:src/App.tsx' },
    ]);
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

  // Prose is full of `x/y` shapes. Every one of these used to become a clickable
  // "path" that opened the Files tab.
  it('refuses a slash in ordinary prose', () => {
    expect(looksLikePath('and/or')).toBe(false);
    expect(looksLikePath('24/7')).toBe(false);
    expect(looksLikePath('TCP/IP')).toBe(false);
    expect(looksLikePath('read/write')).toBe(false);
    expect(looksLikePath('client/server')).toBe(false);
    expect(looksLikePath('was/were')).toBe(false);
    expect(looksLikePath('5/10')).toBe(false);
    expect(looksLikePath('N/A')).toBe(false);
  });

  it('still accepts two segments when the last one is a file', () => {
    expect(looksLikePath('src/index.ts')).toBe(true);
    expect(looksLikePath('tests/helpers')).toBe(false); // extensionless dir: too risky
    expect(looksLikePath('src/components/TerminalPane.tsx')).toBe(true);
  });

  it('refuses a token containing a space', () => {
    expect(looksLikePath('/home/my folder/app.ts')).toBe(false);
  });
});

describe('ansiToEmphasis', () => {
  it('keeps bold, italic and underline as markers', () => {
    // Agents style their headings with SGR rather than markdown. Stripping the
    // escapes first is what made the reader look exactly like the terminal.
    expect(ansiToEmphasis('\u001b[1mHeading\u001b[0m')).toBe('**Heading**');
    expect(ansiToEmphasis('\u001b[3mshrug\u001b[23m')).toBe('*shrug*');
    expect(ansiToEmphasis('\u001b[4mlink\u001b[24m')).toBe('__link__');
  });

  it('leaves colour and ordinary text alone', () => {
    expect(ansiToEmphasis('\u001b[31mred\u001b[0m')).toBe('\u001b[31mred\u001b[0m');
    expect(ansiToEmphasis('plain text')).toBe('plain text');
  });
});

describe('headings written as bold only', () => {
  it('promotes a whole-line bold line to a heading', () => {
    // There is no `##` in agent output; the bold line is the heading.
    expect(parseReaderText('\u001b[1mFile-link parsing is fixed\u001b[0m')).toEqual([
      {
        kind: 'heading',
        level: 2,
        content: [{ kind: 'text', value: 'File-link parsing is fixed' }],
      },
    ]);
  });

  it('keeps the level when the bold text itself carries hashes', () => {
    expect(parseReaderText('\u001b[1m### Details\u001b[0m')).toEqual([
      { kind: 'heading', level: 3, content: [{ kind: 'text', value: 'Details' }] },
    ]);
  });

  it('does not promote bold inside a sentence', () => {
    const blocks = parseReaderText('This changed \u001b[1mthe parser\u001b[0m today');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      content: [
        { kind: 'text', value: 'This changed ' },
        { kind: 'strong', value: 'the parser' },
        { kind: 'text', value: ' today' },
      ],
    });
  });
});

describe('isNoiseLine', () => {
  it('drops the status lines a coding agent fills the screen with', () => {
    expect(isNoiseLine('✻ Thinking… (1m 20s · ↑ 3.1k tokens)')).toBe(true);
    expect(isNoiseLine('⠋ Working for 21s')).toBe(true);
    expect(isNoiseLine('esc to interrupt')).toBe(true);
    expect(isNoiseLine('45% ███░░░')).toBe(true);
    expect(isNoiseLine('────────────')).toBe(true);
  });

  it('drops tool-call chatter', () => {
    expect(isNoiseLine('⏺ Read(src/app.ts)')).toBe(true);
    expect(isNoiseLine('◉ Bash(npm test)')).toBe(true);
    expect(isNoiseLine('> Read(src/app.ts)')).toBe(true);
  });

  it('keeps real prose, even when it mentions the same words', () => {
    // The filter must not eat a sentence just because it sounds like status.
    expect(isNoiseLine('The run took 21s because the token budget was exceeded.')).toBe(false);
    expect(isNoiseLine('## Plan')).toBe(false);
    // A bulleted sentence that starts with a tool name is still a sentence.
    expect(isNoiseLine('- Read the file first')).toBe(false);
  });

  it('treats a blank line as structure, not noise', () => {
    expect(isNoiseLine('')).toBe(false);
    expect(isNoiseLine('   ')).toBe(false);
  });
});

describe('lastReplyOnly', () => {
  const screen = [
    'user@host:~/project$ claude',
    'Thinking… (3s)',
    'Earlier answer that should be dropped',
    'user@host:~/project$ ',
    '## The actual last reply',
    'This is what matters.',
  ].join('\n');

  it('keeps only the text after the last prompt', () => {
    const { text, found } = lastReplyOnly(screen);
    expect(found).toBe(true);
    expect(text).toContain('The actual last reply');
    expect(text).not.toContain('Earlier answer');
  });

  it('says so when there is no prompt marker to cut at', () => {
    const { text, found } = lastReplyOnly('Just agent output\nwith no prompt');
    expect(found).toBe(false);
    expect(text).toBe('Just agent output\nwith no prompt');
  });

  it('does not mistake a normal sentence ending in a period for a prompt', () => {
    expect(lastReplyOnly('Line one\nLine two.').found).toBe(false);
  });
});

describe('parseReaderText filters', () => {
  const screen = [
    '✻ Working for 12s',
    '## Heading',
    'Body text.',
    'esc to interrupt',
    '',
    'user@host:~$ ',
    'Only this should survive both filters.',
  ].join('\n');

  it('hides noise when asked, and keeps it by default', () => {
    expect(
      parseReaderText(screen)
        .map((b) => JSON.stringify(b))
        .join(' '),
    ).toContain('Working for 12s');
    const filtered = parseReaderText(screen, { hideNoise: true });
    const rendered = filtered.map((b) => JSON.stringify(b)).join(' ');
    expect(rendered).not.toContain('Working for 12s');
    expect(rendered).not.toContain('esc to interrupt');
    expect(rendered).toContain('Only this should survive');
  });

  it('keeps only the last reply when asked', () => {
    const filtered = parseReaderText(screen, { lastReply: true, hideNoise: true });
    const rendered = filtered.map((b) => JSON.stringify(b)).join(' ');
    expect(rendered).toContain('Only this should survive');
    expect(rendered).not.toContain('Heading');
  });
});
