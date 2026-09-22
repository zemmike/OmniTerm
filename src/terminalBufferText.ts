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
