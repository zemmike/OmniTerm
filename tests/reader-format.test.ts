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
