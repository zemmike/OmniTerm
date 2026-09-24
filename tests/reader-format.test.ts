import { describe, expect, it } from 'vitest';
import { parseReaderText } from '../src/readerMarkdown';
import { decodeOsc52 } from '../src/clipboard';

const kinds = (text: string, opts = {}) => parseReaderText(text, opts).map((b) => b.kind);

describe('reader formatting of agent output', () => {
  it('keeps a Claude Code reply marked with the record glyph', () => {
    const raw = '⏺ Bash(npm test)\n  ⎿  ok\n\n⏺ The tests pass. Here is why.';
    const blocks = parseReaderText(raw, { answerOnly: true, hideNoise: true });
    expect(blocks).toHaveLength(1);
    expect(JSON.stringify(blocks[0])).toContain('The tests pass');
  });

  it('drops tool-call lines as noise but not reply lines', () => {
    const blocks = parseReaderText('● Read(src/a.ts)\n\n● Summary of the change.', {
      hideNoise: true,
    });
    expect(JSON.stringify(blocks)).not.toContain('Read(');
    expect(JSON.stringify(blocks)).toContain('Summary of the change');
  });

  it('turns a plain title line before a list into a heading', () => {
    expect(kinds('Next steps:\n- one\n- two')).toEqual(['heading', 'list']);
    expect(kinds('What Changed\n\nThe parser now works.')).toEqual(['heading', 'paragraph']);
  });

  it('does not turn a sentence fragment into a heading', () => {
    expect(kinds('Before\n\nsome text')).toEqual(['paragraph', 'paragraph']);
  });

  it('keeps nested bullets under a numbered item in one list', () => {
    const [list] = parseReaderText('1. First\n   - detail a\n   - detail b\n2. Second');
    expect(list.kind).toBe('list');
    if (list.kind !== 'list') return;
    expect(list.items).toHaveLength(4);
    expect(list.depths).toEqual([0, 1, 1, 0]);
  });
});

describe('OSC 52', () => {
  it('decodes a clipboard write and ignores a read request', () => {
    expect(decodeOsc52('c;' + btoa('hello'))).toBe('hello');
    expect(decodeOsc52('c;?')).toBeNull();
  });
});

describe('Claude Code full screen (as read from a Herdr pane)', () => {
  const screen = [
    '> how do I fix the build?',
    '',
    '⏺ Bash(npm run build)',
    '  ⎿  error TS2304: Cannot find name foo',
    '',
    '⏺ The build fails because `foo` is never imported.',
    '',
    '  Fix',
    '',
    '  1. Import foo in src/app.ts',
    '     - then rebuild',
    '  2. Run the tests again',
    '',
    '─'.repeat(40),
    '> ',
    '─'.repeat(40),
    '  ? for shortcuts',
  ].join('\n');

  it('shows only the formatted answer', () => {
    const blocks = parseReaderText(screen, { answerOnly: true, hideNoise: true });
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'heading', 'list']);
    const json = JSON.stringify(blocks);
    expect(json).not.toContain('npm run build');
    expect(json).not.toContain('shortcuts');
    expect(json).not.toContain('how do I fix');
  });
});

describe('Claude Code welcome screen on Windows (issue screenshot)', () => {
  const screen = [
    'PS C:\\Users\\Mike-work> claude',
    '╭─── Claude Code v2.1.98 ──────────────────────────────────────────────────╮',
    '│                                     │ Tips for getting started           │',
    '│         Welcome back Michael!       │ Run /init to create a CLAUDE.md    │',
    '│                                     │ ────────────────────────────────── │',
    '│              ▐▛███▜▌                │ Recent activity                    │',
    '│             ▝▜█████▛▘               │ No recent activity                 │',
    '│   Opus 4.6 · Claude Pro · Org       │                                    │',
    '│          C:\\Users\\Mike-work        │                                    │',
    '╰──────────────────────────────────────────────────────────────────────────╯',
    '',
    '─'.repeat(60),
    '❯ Try "refactor <filepath>"',
    '─'.repeat(60),
    '  ? for shortcuts',
  ].join('\n');

  it('shows nothing (not a jumble) before Claude has answered', () => {
    expect(parseReaderText(screen, { answerOnly: true, hideNoise: true })).toEqual([]);
  });

  it('shows the answer once there is one, without the banner', () => {
    const answered = screen.replace(
      '❯ Try "refactor <filepath>"',
      [
        '> what is 2+2?',
        '',
        '⏺ The answer is **4**.',
        '',
        '─'.repeat(60),
        '❯ Try "refactor <filepath>"',
      ].join('\n'),
    );
    const blocks = parseReaderText(answered, { answerOnly: true, hideNoise: true });
    const json = JSON.stringify(blocks);
    expect(json).toContain('The answer is');
    expect(json).not.toContain('Welcome back');
    expect(json).not.toContain('refactor');
    expect(json).not.toContain('what is 2+2');
  });
});

describe('OSC 52 tolerance', () => {
  it('accepts wrapped and URL-safe base64', () => {
    expect(decodeOsc52('c;aGVs\nbG8=')).toBe('hello');
    expect(decodeOsc52('c;' + btoa('a?>b').replace(/\+/g, '-').replace(/\//g, '_'))).toBe('a?>b');
  });
});
