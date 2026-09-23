import { describe, expect, it } from 'vitest';
import { focusedPaneText, sameTail } from '../src/terminalBufferText';

function screen(rows: string[], cursorX: number) {
  const cells = rows.map((row) => Array.from(row));
  return {
    length: rows.length,
    viewportY: 0,
    cursorX,
    getLine: (y: number) =>
      cells[y] && {
        getCell: (x: number) => ({ getChars: () => cells[y][x] ?? '' }),
        translateToString: (trim?: boolean, start = 0, end = cells[y].length) => {
          const text = cells[y].slice(start, end).join('');
          return trim ? text.replace(/\s+$/, '') : text;
        },
      },
  };
}

const pad = (text: string, width: number) => text.padEnd(width).slice(0, width);
const row = (a: string, b: string, c: string) => `${pad(a, 10)}│${pad(b, 30)}│${pad(c, 20)}`;

describe('focusedPaneText', () => {
  const rows = [
    row('sessions', 'The answer is here.', 'htop 12%'),
    row('> claude', '', 'cpu 3%'),
    row('  shell', '- first point', 'mem 40%'),
    row('', '- second point', ''),
    row('', '> ', ''),
  ];

  it('reads only the pane with the cursor, whatever the multiplexer', () => {
    const text = focusedPaneText(screen(rows, 13), 61, rows.length);
    expect(text).toContain('The answer is here.');
    expect(text).toContain('- second point');
    expect(text).not.toContain('sessions');
    expect(text).not.toContain('htop');
  });

  it('returns the whole screen when there are no dividers', () => {
    const plain = ['one full-screen program', 'second line'];
    expect(focusedPaneText(screen(plain, 0), 30, 2)).toBe(plain.join('\n'));
  });
});

describe('sameTail', () => {
  it('matches a longer capture of the same pane only', () => {
    const shown = 'The answer is here.\n- first point\n- second point';
    expect(sameTail(`older history\n${shown}`, shown)).toBe(true);
    expect(sameTail('another pane entirely\nwith other text', shown)).toBe(false);
  });
});
