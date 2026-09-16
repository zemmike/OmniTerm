/**
 * Turn raw terminal output into readable blocks.
 *
 * Terminal output from a coding agent is markdown that has been *rendered* by the
 * agent for a fixed-width screen: headings arrive as plain lines, bullets carry box
 * characters, code is wrapped in fences, and the whole thing is padded with borders
 * and cursor-spinner residue. This module undoes the parts that hurt readability and
 * classifies what is left. It is pure: no DOM, no terminal, no side effects, so the
 * rules can be tested exactly.
 *
 * It deliberately does not try to be a markdown engine. It recognises what coding
 * agents actually emit (headings, bullets, numbered steps, fenced code, quotes) and
 * passes everything else through as text, because guessing wrong is worse than
 * showing a line plainly.
 */

export type ReaderBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bullet'; marker: string; text: string }
  | { kind: 'code'; text: string; lang: string }
  | { kind: 'quote'; text: string }
  | { kind: 'text'; text: string };

/**
 * Remove the indentation a code block shares with its neighbours.
 *
 * Agents print code inside a box or an indented list, so every line arrives with the
 * same extra margin. Dedenting by the common prefix keeps the block's own structure
 * while removing the container's.
 */
export function dedent(text: string): string {
  const lines = text.split('\n');
  const widths = lines
    .filter((line) => line.trim())
    .map((line) => (line.match(/^[ \t]*/) || [''])[0].length);
  if (widths.length === 0) return text.trim();
  const common = Math.min(...widths);
  if (common === 0) return text.trim();
  return lines
    .map((line) => line.slice(common))
    .join('\n')
    .trim();
}

/** Cursor movement, colours, OSC titles: anything that is not content. */
export function stripAnsi(text: string): string {
  return (
    text
      // CSI sequences, including the bracketed-paste markers
      .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
      // OSC sequences (window title, hyperlinks) terminated by BEL or ST
      .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, '')
      // other escapes and stray control bytes
      .replace(/\u001b[@-Z\\-_]/g, '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  );
}

/**
 * Remove the fixed-width furniture: box borders, spinner frames, trailing padding.
 * Kept separate from stripAnsi because these are printable characters, and a reader
 * that shows a wall of `│` is not more readable than the terminal it came from.
 */
export function stripTerminalFurniture(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        // box drawing and block characters anywhere in the line
        .replace(/[│┃║┌┐└┘╭╮╰╯├┤┬┴┼─━═╔╗╚╝╠╣╦╩╬╱╲▏▕]/g, ' ')
        // a leading spinner frame (⠋ or ⠿ or ✻ ...) and its padding
        .replace(/^\s*[⠁-⣿✻✢✳✶✽·∙○●◐◓◑◒⣾⣽]\s+/, '')
        // trailing spaces that only exist to fill the pane
        .replace(/\s+$/, ''),
    )
    .join('\n');
}

const HEADING = /^\s{0,3}#{1,6}\s+(.*\S)\s*$/;
const BULLET = /^\s*([-*•‣◦]|\d{1,2}[.)])\s+(.*\S)\s*$/;
const QUOTE = /^\s*>\s?(.*\S)\s*$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;

/**
 * Classify cleaned text into blocks. Blank lines separate blocks; consecutive
 * bullets stay separate blocks so the list keeps its markers without the caller
 * having to reconstruct anything.
 */
export function parseReaderText(raw: string): ReaderBlock[] {
  const cleaned = stripTerminalFurniture(stripAnsi(raw || ''));
  const blocks: ReaderBlock[] = [];
  const lines = cleaned.split('\n');

  let code: { lang: string; lines: string[] } | null = null;
  let pending: string[] = [];

  const flush = () => {
    // Collapse the paragraph, but keep intentional internal line breaks (the agent
    // often wraps a sentence across lines for its own column width).
    const text = pending
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text) blocks.push({ kind: 'text', text });
    pending = [];
  };

  for (const line of lines) {
    const fence = FENCE.exec(line);
    if (code) {
      if (fence) {
        blocks.push({
          kind: 'code',
          text: dedent(code.lines.join('\n')).replace(/\s+$/, ''),
          lang: code.lang,
        });
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }
    if (fence) {
      flush();
      code = { lang: fence[1] || '', lines: [] };
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(6, (line.match(/#/g) || []).length);
      blocks.push({ kind: 'heading', level, text: heading[1] });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', marker: bullet[1], text: bullet[2] });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      blocks.push({ kind: 'quote', text: quote[1] });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }
    pending.push(line);
  }

  // An unterminated fence is what a response that is still streaming looks like:
  // show it as code rather than dropping the user's text.
  if (code) {
    blocks.push({
      kind: 'code',
      text: dedent(code.lines.join('\n')).replace(/\s+$/, ''),
      lang: code.lang,
    });
  }
  flush();
  return blocks;
}

/**
 * Does this token look like a path worth making clickable?
 *
 * Absolute paths, ./ and ../ relative paths, and names that carry a known file
 * extension. Deliberately conservative, because a wrong click target is worse than a
 * missing one: prose that merely contains a slash (`and/or`, `24/7`, `TCP/IP`,
 * `was/were`) is not a path, and neither is `README` (far more often a word).
 *
 * The cost of that caution is that an extensionless two-segment path (`src/utils`)
 * is not clickable; three segments (`src/components/TerminalPane.tsx`) and anything
 * with an extension is.
 */
const FILE_EXTENSION =
  /\.(ts|tsx|js|jsx|json|md|py|rs|go|java|rb|sh|bash|zsh|fish|yml|yaml|toml|ini|conf|cfg|css|html|sql|txt|log|env|lock|png|jpg|svg)$/i;

export function looksLikePath(candidate: string): boolean {
  if (!candidate || candidate.length > 300) return false;
  // Paths printed by agents do not contain spaces, so prose that does is not a path.
  if (/\s/.test(candidate)) return false;
  // An explicit relative prefix, or a rooted path holding a real name, is enough.
  if (/^\.{1,2}\//.test(candidate)) return true;
  if (/^\//.test(candidate) && /\w/.test(candidate)) return true;

  const segments = candidate.split('/');
  if (segments.length === 1) return FILE_EXTENSION.test(candidate);
  // Two segments only count when the last one is a file (`src/index.ts`) or the token
  // reaches deeper (`src/components/TerminalView.tsx`). Two bare words are prose.
  return FILE_EXTENSION.test(segments[segments.length - 1]) || segments.length >= 3;
}
