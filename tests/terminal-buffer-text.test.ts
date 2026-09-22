import { describe, expect, it } from 'vitest';
import { terminalBufferToText } from '../src/terminalBufferText';

function buffer(...lines: Array<{ text: string; wrapped?: boolean }>) {
  return {
    length: lines.length,
    getLine(index: number) {
      const line = lines[index];
      if (!line) return undefined;
      return {
        isWrapped: Boolean(line.wrapped),
        translateToString: () => line.text,
      };
    },
  };
}

describe('terminalBufferToText', () => {
  it('joins xterm soft-wrapped rows without inventing paragraph breaks', () => {
    expect(
      terminalBufferToText(
        buffer(
          { text: 'This is a long paragraph that' },
          { text: ' wrapped at the terminal edge.', wrapped: true },
          { text: '' },
          { text: '- first list item' },
        ),
      ),
    ).toBe('This is a long paragraph that wrapped at the terminal edge.\n\n- first list item');
  });

  it('keeps intentional rows separate and tolerates missing buffer lines', () => {
    const value = buffer({ text: '# Heading' }, { text: 'Body' });
    value.length = 3;
    expect(terminalBufferToText(value)).toBe('# Heading\nBody\n');
  });
});
