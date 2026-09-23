interface TerminalBufferLine {
  isWrapped: boolean;
  translateToString(trimRight?: boolean): string;
}

interface TerminalBuffer {
  length: number;
  getLine(index: number): TerminalBufferLine | undefined;
}

/** Reconstruct logical text lines from xterm's physical screen rows. */
export function terminalBufferToText(buffer: TerminalBuffer): string {
  let text = '';
  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index);
    const value = line?.translateToString(true) ?? '';
    if (index > 0 && !line?.isWrapped) text += '\n';
    text += value;
  }
  return text;
}

interface CellLine {
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
  getCell(x: number): { getChars(): string } | undefined;
}

interface ScreenBuffer {
  length: number;
  viewportY: number;
  cursorX: number;
  getLine(index: number): CellLine | undefined;
}

/** Characters multiplexers draw between side-by-side panes. */
const VERTICAL_BORDER = /^[│┃║|▏▕┆┊╎]$/;

/**
 * The text of the pane the user is working in, when a multiplexer owns the screen.
 *
 * tmux, zellij, screen, herdr and similar tools draw several programs side by side on
 * one screen, so reading every row mixes the panes column by column. Any column that is
 * a vertical border on most rows is a divider; the pane is the span of columns between
 * dividers that holds the cursor, which is where the user is typing. With no dividers the
 * whole screen is returned, so a single full-screen program reads as before.
 */
export function focusedPaneText(buffer: ScreenBuffer, cols: number, rows: number): string {
  const top = buffer.viewportY;
  const lines: CellLine[] = [];
  for (let y = 0; y < rows; y += 1) {
    const line = buffer.getLine(top + y);
    if (line) lines.push(line);
  }
  if (!lines.length || cols <= 0) return '';

  const dividers: number[] = [];
  for (let x = 0; x < cols; x += 1) {
    let hits = 0;
    for (const line of lines) {
      if (VERTICAL_BORDER.test(line.getCell(x)?.getChars() || '')) hits += 1;
    }
    if (hits >= Math.max(3, lines.length * 0.6)) dividers.push(x);
  }

  let start = 0;
  let end = cols;
  const cursor = Math.min(Math.max(buffer.cursorX, 0), cols - 1);
  for (const x of dividers) {
    if (x < cursor) start = x + 1;
    else if (x > cursor) {
      end = x;
      break;
    }
  }
  // A cursor parked on a border, or a sliver of a pane, is not worth reading on its own.
  if (end - start < 10) {
    start = 0;
    end = cols;
  }
  return lines.map((line) => line.translateToString(true, start, end)).join('\n');
}

/** Do two captures of a pane end with the same visible content? */
export function sameTail(candidate: string, screen: string): boolean {
  const tail = (text: string) =>
    text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length >= 8)
      .slice(-3);
  const expected = tail(screen);
  if (!expected.length) return false;
  const lines = new Set(candidate.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()));
  return expected.every((line) => lines.has(line));
}
