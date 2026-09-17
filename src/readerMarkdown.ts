/** Turn raw terminal output into typed, readable blocks. */

export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'emphasis'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'path'; value: string }
  | { kind: 'math'; value: string };

export type ReaderBlock =
  | { kind: 'heading'; level: number; content: InlineToken[] }
  | { kind: 'paragraph'; content: InlineToken[] }
  | { kind: 'list'; ordered: boolean; start: number; items: InlineToken[][] }
  | { kind: 'code'; text: string; lang: string }
  | { kind: 'quote'; content: InlineToken[] }
  | { kind: 'table'; headers: InlineToken[][]; rows: InlineToken[][][] }
  | { kind: 'math'; value: string; display: true };

/** Remove the indentation a code block shares with its neighbours. */
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

/** Turn terminal emphasis escapes into markdown markers before stripping escapes. */
export function ansiToEmphasis(text: string): string {
  return text
    .replace(/\u001b\[1m([^\u001b]*)\u001b\[(?:0|22)m/g, '**$1**')
    .replace(/\u001b\[3m([^\u001b]*)\u001b\[(?:0|23)m/g, '*$1*')
    .replace(/\u001b\[4m([^\u001b]*)\u001b\[(?:0|24)m/g, '__$1__');
}

/** Cursor movement, colours, OSC titles: anything that is not content. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** Remove fixed-width borders, spinners, and trailing terminal padding. */
export function stripTerminalFurniture(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[│┃║┌┐└┘╭╮╰╯├┤┬┴┼─━═╔╗╚╝╠╣╦╩╬╱╲▏▕]/g, ' ')
        .replace(/^\s*[⠁-⣿✻✢✳✶✽·∙○●◐◓◑◒⣾⣽]\s+/, '')
        .replace(/\s+$/, ''),
    )
    .join('\n');
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*\S)\s*$/;
const LIST_ITEM = /^\s*([-*•‣◦]|(\d{1,2})[.)])\s+(.*\S)\s*$/;
const QUOTE = /^\s*>\s?(.*\S)\s*$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const DISPLAY_MATH = /^\s*\$\$([\s\S]*?)\$\$\s*$/;
const FILE_EXTENSION =
  /\.(ts|tsx|js|jsx|json|md|py|rs|go|java|rb|sh|bash|zsh|fish|yml|yaml|toml|ini|conf|cfg|css|html|sql|txt|log|env|lock|png|jpg|svg)$/i;
const PATH_SUFFIX = /:\d+(?::\d+)?$/;

function pushText(tokens: InlineToken[], value: string): void {
  if (!value) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.kind === 'text') previous.value += value;
  else tokens.push({ kind: 'text', value });
}

function texSignal(value: string): boolean {
  return /[\\^_{}]/.test(value) || /(?:[A-Za-z0-9][+\-*/=]|[+\-*/=][A-Za-z0-9])/.test(value);
}

function inlineMathAt(text: string, index: number): { end: number; value: string } | null {
  if (text.startsWith('\\(', index)) {
    const end = text.indexOf('\\)', index + 2);
    if (end > index + 2) return { end: end + 2, value: text.slice(index + 2, end) };
  }

  if (text[index] !== '$' || text[index + 1] === '$') return null;
  const end = text.indexOf('$', index + 1);
  if (end > index + 1) {
    const value = text.slice(index + 1, end);
    if (texSignal(value)) return { end: end + 1, value };
  }
  return null;
}

function inlineMarkupAt(
  text: string,
  index: number,
): { end: number; kind: 'strong' | 'emphasis' | 'code'; value: string } | null {
  const marker = text[index];
  if (marker === '`') {
    const end = text.indexOf('`', index + 1);
    if (end > index + 1) return { end: end + 1, kind: 'code', value: text.slice(index + 1, end) };
    return null;
  }
  if ((marker === '*' || marker === '_') && text[index + 1] === marker) {
    const end = text.indexOf(marker.repeat(2), index + 2);
    if (end > index + 2) return { end: end + 2, kind: 'strong', value: text.slice(index + 2, end) };
  }
  if (marker === '*' || marker === '_') {
    const end = text.indexOf(marker, index + 1);
    if (end > index + 1)
      return { end: end + 1, kind: 'emphasis', value: text.slice(index + 1, end) };
  }
  return null;
}

function pathAt(text: string, index: number): { end: number; value: string } | null {
  if (!/[A-Za-z0-9./\\]/.test(text[index])) return null;
  const match = /^\S+/.exec(text.slice(index));
  if (!match) return null;
  const prefix = text.slice(0, index).match(/\S*$/)?.[0] || '';
  const candidate = prefix + match[0];
  for (let offset = 0; offset < candidate.length; offset += 1) {
    if (inlineMathAt(candidate, offset)) return null;
  }
  const value = match[0].replace(/[),.;!?\]]+$/, '').replace(/['"]+$/, '');
  if (!value || !looksLikePath(value)) return null;
  return { end: index + value.length, value };
}

/** Tokenise supported inline markdown, TeX, and file paths. */
export function parseInlineText(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let index = 0;
  while (index < text.length) {
    const math = inlineMathAt(text, index);
    if (math) {
      tokens.push({ kind: 'math', value: math.value });
      index = math.end;
      continue;
    }
    const markup = inlineMarkupAt(text, index);
    if (markup) {
      tokens.push({ kind: markup.kind, value: markup.value });
      index = markup.end;
      continue;
    }
    const path = pathAt(text, index);
    if (path) {
      tokens.push({ kind: 'path', value: path.value });
      index = path.end;
      continue;
    }
    pushText(tokens, text[index]);
    index += 1;
  }
  return tokens;
}

function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  const body = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells = body.split('|').map((cell) => cell.trim());
  return cells.length >= 2 && cells.every((cell) => cell.length > 0) ? cells : null;
}

function isTableSeparator(line: string, columns: number): boolean {
  const cells = tableCells(line);
  return !!cells && cells.length === columns && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/** Classify cleaned terminal text into blocks suitable for reader rendering. */
export function parseReaderText(raw: string): ReaderBlock[] {
  const cleaned = stripTerminalFurniture(stripAnsi(ansiToEmphasis(raw || '')));
  const blocks: ReaderBlock[] = [];
  const lines = cleaned.split('\n');
  let code: { lang: string; lines: string[] } | null = null;
  let pending: string[] = [];
  const flush = () => {
    const text = pending
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text) blocks.push({ kind: 'paragraph', content: parseInlineText(text) });
    pending = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
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
    const displayMath = DISPLAY_MATH.exec(line);
    if (displayMath && texSignal(displayMath[1])) {
      flush();
      blocks.push({ kind: 'math', value: displayMath[1].trim(), display: true });
      continue;
    }
    const boldLine = /^\s*\*\*([^*]{2,80})\*\*\s*:?\s*$/.exec(line);
    if (boldLine) {
      flush();
      const inner = boldLine[1].trim();
      const heading = HEADING.exec(inner);
      blocks.push({
        kind: 'heading',
        level: heading ? heading[1].length : 2,
        content: parseInlineText(heading ? heading[2] : inner.replace(/^#{1,6}\s*/, '')),
      });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        content: parseInlineText(heading[2]),
      });
      continue;
    }
    const listItem = LIST_ITEM.exec(line);
    if (listItem) {
      flush();
      const ordered = !!listItem[2];
      const start = ordered ? Number(listItem[2]) : 1;
      const items: InlineToken[][] = [parseInlineText(listItem[3])];
      while (index + 1 < lines.length) {
        const next = LIST_ITEM.exec(lines[index + 1]);
        if (!next || !!next[2] !== ordered) break;
        items.push(parseInlineText(next[3]));
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, start, items });
      continue;
    }
    const cells = tableCells(line);
    if (cells && isTableSeparator(lines[index + 1] || '', cells.length)) {
      flush();
      const rows: InlineToken[][][] = [];
      index += 2;
      while (index < lines.length) {
        const row = tableCells(lines[index]);
        if (!row || row.length !== cells.length) break;
        rows.push(row.map(parseInlineText));
        index += 1;
      }
      blocks.push({ kind: 'table', headers: cells.map(parseInlineText), rows });
      index -= 1;
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      blocks.push({ kind: 'quote', content: parseInlineText(quote[1]) });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    pending.push(line);
  }

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

/** Does this token look like a path worth making clickable? */
export function looksLikePath(candidate: string): boolean {
  if (!candidate || candidate.length > 300 || /\s/.test(candidate)) return false;
  const path = candidate.replace(PATH_SUFFIX, '');
  if (!path) return false;
  if (/^[A-Za-z]:\\[^\\/:*?"<>|\r\n]+(?:\\[^\\/:*?"<>|\r\n]+)*$/.test(path)) return true;
  if (/^\\\\[^\\/:*?"<>|\r\n]+\\[^\\/:*?"<>|\r\n]+(?:\\[^\\/:*?"<>|\r\n]+)*$/.test(path))
    return true;
  if (/^\.{1,2}\//.test(path)) return true;
  if (/^\//.test(path) && /\w/.test(path)) return true;
  const segments = path.split('/');
  if (segments.length === 1) return FILE_EXTENSION.test(path);
  return FILE_EXTENSION.test(segments[segments.length - 1]) || segments.length >= 3;
}
