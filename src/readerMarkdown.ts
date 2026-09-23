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
  | {
      kind: 'list';
      ordered: boolean;
      start: number;
      items: InlineToken[][];
      /** Nesting level per item (0 = top level). */
      depths?: number[];
      /** Per-item ordered flag, for sub-lists of another kind. */
      orderedItems?: boolean[];
    }
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
        .replace(/^\s*[⠁-⣿✻✢✳✶✽·∙○◐◓◑◒⣾⣽]\s+/, '')
        // Claude Code marks both replies and tool calls with ⏺/●. A reply keeps its
        // text; a tool call (`⏺ Bash(ls)`) keeps the glyph so the noise filter sees it.
        .replace(/^(\s*)[⏺●]\s+(?!\w[\w-]*\s*\()/, '$1')
        .replace(/\s+$/, ''),
    )
    .join('\n');
}

/** A Claude Code tool call line: `⏺ Bash(ls)`, `● Read(file)`. */
const TOOL_CALL = /^[⏺●◉⏵⏸]\s*\w[\w-]*\s*\(/;

const HEADING = /^\s{0,3}(#{1,6})\s+(.*\S)\s*$/;
const LIST_ITEM = /^(\s*)([-*•‣◦▪·]|(\d{1,2})[.)]|\((\d{1,2})\))\s+(.*\S)\s*$/;
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
  // Empty cells are valid Markdown (for example `| alpha | |`). The separator
  // validator remains strict, so accepting them here cannot turn arbitrary pipes
  // into a table.
  return cells.length >= 2 ? cells : null;
}

function isTableSeparator(line: string, columns: number): boolean {
  const cells = tableCells(line);
  return !!cells && cells.length === columns && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/** Classify cleaned terminal text into blocks suitable for reader rendering. */
export function parseReaderText(raw: string, options: ReaderFilterOptions = {}): ReaderBlock[] {
  const source = options.answerOnly
    ? extractAnswer(raw || '').text
    : options.lastReply
      ? lastReplyOnly(raw || '').text
      : raw || '';
  const cleaned = stripTerminalFurniture(stripAnsi(ansiToEmphasis(source)));
  const withoutNoise = options.hideNoise ? stripNoiseLines(cleaned) : cleaned;
  const blocks: ReaderBlock[] = [];
  const lines = withoutNoise.split('\n');
  let code: { lang: string; lines: string[] } | null = null;
  let pending: string[] = [];
  const flush = () => {
    // The terminal owns physical line wrapping; the document owns prose wrapping.
    // Blank lines are flushed separately, so non-blank rows here belong to one
    // paragraph. Preserve Markdown's explicit two-space line break only.
    const text = pending
      .reduce((paragraph, line) => {
        if (!paragraph) return line.trim();
        const hardBreak = /\s{2}$/.test(paragraph);
        return `${paragraph.replace(/\s+$/, '')}${hardBreak ? '\n' : ' '}${line.trim()}`;
      }, '')
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
    if (line.trim() === '$$') {
      const closing = lines.findIndex((candidate, candidateIndex) => {
        return candidateIndex > index && candidate.trim() === '$$';
      });
      if (closing > index + 1) {
        const value = lines
          .slice(index + 1, closing)
          .join('\n')
          .trim();
        if (texSignal(value)) {
          flush();
          blocks.push({ kind: 'math', value, display: true });
          index = closing;
          continue;
        }
      }
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
      if (/^(important|warning|caution|note|tip|attention):?$/i.test(inner)) {
        blocks.push({ kind: 'paragraph', content: parseInlineText(line.trim()) });
        continue;
      }
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
    if (isPlainHeading(lines, index, pending.length)) {
      flush();
      const text = line.trim().replace(/:$/, '');
      blocks.push({ kind: 'heading', level: 3, content: parseInlineText(text) });
      continue;
    }
    const listItem = LIST_ITEM.exec(line);
    if (listItem) {
      flush();
      const ordered = Boolean(listItem[3] || listItem[4]);
      const start = ordered ? Number(listItem[3] || listItem[4]) : 1;
      // A wrapped bullet is still one bullet: agents wrap long items, and a continuation
      // line is indented past the marker without starting a new one.
      const readItem = (text: string, indent: number) => {
        const parts = [text];
        while (index + 1 < lines.length) {
          const next = lines[index + 1];
          if (!next.trim()) break;
          const nextItem = LIST_ITEM.exec(next);
          if (nextItem) break;
          const nextIndent = next.length - next.trimStart().length;
          if (nextIndent <= indent) break;
          parts.push(next.trim());
          index += 1;
        }
        return parseInlineText(parts.join(' '));
      };
      const baseIndent = listItem[1].length;
      const indents: number[] = [baseIndent];
      const orderedItems: boolean[] = [ordered];
      const items: InlineToken[][] = [readItem(listItem[5], baseIndent)];
      while (index + 1 < lines.length) {
        let lookahead = index + 1;
        // One blank line between items does not end a loose list.
        if (!lines[lookahead].trim() && lookahead + 1 < lines.length) lookahead += 1;
        const next = LIST_ITEM.exec(lines[lookahead]);
        if (!next) break;
        const nextOrdered = Boolean(next[3] || next[4]);
        const nextIndent = next[1].length;
        // A top-level item of another kind ends the list; deeper items of either kind
        // are sub-items.
        if (nextIndent <= baseIndent && nextOrdered !== ordered) break;
        index = lookahead;
        indents.push(Math.max(nextIndent, baseIndent));
        orderedItems.push(nextOrdered);
        items.push(readItem(next[5], nextIndent));
      }
      const levels = [...new Set(indents)].sort((a, b) => a - b);
      const depths = indents.map((indent) => levels.indexOf(indent));
      blocks.push(
        depths.some((depth) => depth > 0)
          ? { kind: 'list', ordered, start, items, depths, orderedItems }
          : { kind: 'list', ordered, start, items },
      );
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

/**
 * A heading written as plain text, the way agents render markdown in a terminal:
 * the `#` is gone, leaving a short standalone line followed by content. Conservative:
 * the line must start a block, be short, and not end like a sentence.
 */
function isPlainHeading(lines: string[], index: number, pendingCount: number): boolean {
  if (pendingCount > 0) return false;
  const value = lines[index].trim();
  if (value.length < 2 || value.length > 60 || value.split(/\s+/).length > 8) return false;
  if (!/^[A-Z0-9]/.test(value) || LIST_ITEM.test(lines[index])) return false;
  if (/[.,;!?)\]`|]$/.test(value) || /[`$|{}<>=]/.test(value)) return false;
  if (index > 0 && lines[index - 1].trim()) return false;
  const next = lines[index + 1];
  if (next === undefined) return false;
  // Directly followed by a list: "Next steps:" / "Summary".
  if (next.trim()) return LIST_ITEM.test(next);
  const after = lines[index + 2];
  if (!after || !after.trim() || FENCE.test(after) || after.trim() === '$$') return false;
  // Standing alone, it must look like a title: "Next steps:" or Title Case words.
  if (value.endsWith(':') || LIST_ITEM.test(after)) return true;
  const words = value.split(/\s+/).filter((word) => word.length > 3);
  return words.length >= 2 && words.every((word) => /^[A-Z0-9]/.test(word));
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

/**
 * Lines that are terminal furniture rather than content.
 *
 * A coding agent's screen is mostly status: spinners, elapsed times, token counts,
 * progress bars, "esc to interrupt", tool-call chatter. Reading a reply means not
 * reading those, which is the whole reason the reader exists.
 *
 * Deliberately conservative: it drops a line only when the whole line is noise, so a
 * sentence that happens to mention tokens or a file path survives.
 */
export function isNoiseLine(line: string): boolean {
  const value = line.trim();
  if (!value) return false;

  // A rule or separator on its own.
  if (/^[\s\u2500\u2501\u2550_=~*\-.]{4,}$/.test(value)) return true;

  // Status wording. The spinner glyph itself has already been removed by
  // stripTerminalFurniture, so this matches the words, not the glyph - and only on a
  // short line, so a sentence that happens to say "token" or "took 21s" survives.
  const bare = value.replace(
    /^[\u2801-\u28ff\u273b\u2722\u2733\u2736\u273d\u00b7\u2219\u25cb\u25cf\u25d0-\u25d3]+\s*/,
    '',
  );
  if (bare.length <= 70) {
    if (
      /^(?:working|thinking|running|reading|searching|writing|editing|analyzing|computing|planning|waiting)\b/i.test(
        bare,
      )
    ) {
      return true;
    }
    if (/\besc\b.*\b(interrupt|cancel)\b/i.test(bare)) return true;
    if (/\u2026\s*$/.test(bare)) return true;
    if (/\(\s*\d+m?\s*\d*s\b.*(?:token|context)/i.test(bare)) return true;
  }

  // Progress and context meters.
  // A percentage followed by a bar or block character - not a sentence that happens to
  // start with a number, which is why the next character must not be a word character.
  if (/^\d{1,3}%\s*[^\w\s]/.test(value) && value.length < 40) return true;
  if (/[\u2588\u2591\u2592\u2593]{4,}/.test(value) && !/[a-z]{4,}/i.test(value)) return true;
  if (/^\s*(?:token usage|context left|remaining)\b.*\d/i.test(value)) return true;

  // Tool activity: either the agent's own tool glyph, or call syntax like `Read( ... )`.
  // A bulleted sentence ("- Read the file first") must not match, which is why the
  // plain bullet case requires the parenthesis.
  // A reply carries the same record glyph as a tool call, so only call syntax counts.
  if (TOOL_CALL.test(value) || /^[\u25c9\u23f5\u276f]\s*\S/.test(value)) return true;
  // Codex prefixes activity summaries with an ordinary bullet. Match only its action
  // vocabulary so a real answer bullet such as "• Review the result" remains content.
  if (
    /^\u2022\s*(?:ran|explored|searched|called|read|edited|wrote|waited|working|thinking)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  // Claude's indented tool-result branch marker.
  if (/^\u23bf\s+\S/.test(value)) return true;
  if (
    /^[-*>$]\s*(?:read|write|edit|bash|grep|glob|ls|sed|cat|npm|git|search|fetch|webfetch|tool)\s*\(/i.test(
      value,
    )
  ) {
    return true;
  }
  return false;
}

/** Drop noise lines, keeping the surrounding blank-line structure intact. */
export function stripNoiseLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !isNoiseLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// A prompt ends with a marker character; `user@host:~/project$` has no space
// before the `$`, which is why the marker itself is the only anchor.
// A prompt is a short line ending in a marker, optionally preceded by a host/path-ish
// prefix: `user@host:~/project$`, `project ❯`, or the marker on its own. The prefix
// matters - matching a bare trailing `$` swallowed text like `Malformed: $\frac{$`,
// which the reader must show.
const PROMPT_LINE = /^[\w.@:~/-]{0,60}\s*(?:\u276f|\u276e|\u203a|\u00bb|\u279c|>|\$|#)\s*$/;
// Claude Code and Codex are full-screen programs, so their user prompt contains the
// request instead of ending at a shell marker. These are deliberately limited to the
// prompt glyphs those programs use; `$ command` remains command output, not a boundary.
const CONVERSATION_PROMPT = /^(?:>|\u203a|\u276f)\s+\S/;

export function lastReplyOnly(raw: string): { text: string; found: boolean } {
  const lines = (raw || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    // Prompts are commonly coloured. Match their visible text but slice the original
    // buffer so formatting escapes in the answer remain available to the parser.
    const line = stripAnsi(lines[i]).trim();
    if (
      line.length > 0 &&
      line.length <= 200 &&
      (PROMPT_LINE.test(line) || CONVERSATION_PROMPT.test(line))
    ) {
      const after = lines.slice(i + 1);
      // A full-screen agent (Claude Code, also inside Herdr) keeps an empty input box
      // and a footer under its answer. A prompt with nothing readable after it is that
      // box, not the end of the conversation, so keep looking further up.
      if (!after.some(hasContent)) continue;
      return { text: trimInputBox(after).join('\n'), found: true };
    }
  }
  return { text: raw || '', found: false };
}

/** A line that carries reading material rather than prompt, footer or border. */
function hasContent(line: string): boolean {
  const visible = stripTerminalFurniture(stripAnsi(line)).trim();
  return /\w/.test(visible) && !isNoiseLine(visible) && !isAgentFooter(visible);
}

/** Claude Code's status footer under the input box. */
function isAgentFooter(value: string): boolean {
  return (
    /^\?\s+for shortcuts/i.test(value) ||
    /\b(?:shift\+tab|ctrl\+[a-z]) to\b/i.test(value) ||
    /^(?:auto-accept|plan mode|bypass permissions)\b/i.test(value)
  );
}

/** Drop the empty input box and footer that sit under a full-screen agent's answer. */
function trimInputBox(lines: string[]): string[] {
  let end = lines.length;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (hasContent(lines[i])) break;
    const visible = stripTerminalFurniture(stripAnsi(lines[i])).trim();
    if (/^(?:>|❯|›)$/.test(visible)) end = i;
  }
  return lines.slice(0, end);
}

export interface ReaderFilterOptions {
  /** Drop status/tool chatter. Off by default so the parser stays predictable. */
  hideNoise?: boolean;
  /** Keep only what follows the last prompt. */
  lastReply?: boolean;
  /** Keep only the assistant's answer: no run history, no tool output. Implies lastReply. */
  answerOnly?: boolean;
}

/**
 * Tool output that is not part of the answer.
 *
 * An agent's screen mixes the reply with the evidence for it: command invocations,
 * diffs, file dumps, test logs. The reader is for the reply, so those blocks are
 * dropped - which is what "leave the run history out" means in practice.
 */
export function isToolOutputBlock(block: string): boolean {
  const lines = block.split('\n').filter((line) => line.trim());
  if (!lines.length) return false;
  // A unified diff or patch. It always carries its headers, which is what separates a
  // patch from a bulleted list: "- alpha" is a bullet, "--- a/file" is a patch.
  if (lines.some((line) => /^\s*(?:@@|\+\+\+|diff --git|index [0-9a-f]{7})/.test(line))) {
    return true;
  }
  // A command and the output it produced.
  const first = lines[0].trim();
  if (/^(?:\$|>|\u276f)\s+\S/.test(first) && lines.length > 1) return true;
  // A tool call with its result.
  // A reply carries the same glyph, so only call syntax or a result branch counts.
  if (TOOL_CALL.test(first) || /^\u23bf\s/.test(first)) return true;
  if (
    /^(?:read|write|edit|bash|shell|grep|glob|search|fetch|webfetch)\b/i.test(first) &&
    /[({:]/.test(first)
  ) {
    return true;
  }
  // A file dump: a path header followed by uniformly indented or numbered source.
  if (/^\/\S+\s*$/.test(lines[0]) && lines.length > 3) return true;
  if (
    lines.length > 4 &&
    lines.filter((line) => /^\s*\d+\s{1,2}\S/.test(line)).length >= lines.length - 1
  ) {
    return true;
  }
  return false;
}

/**
 * The assistant's answer, without the terminal history around it.
 *
 * Cuts at the last prompt when one is present (lastReplyOnly), then drops trailing tool
 * output so the answer is the last thing the reader shows. When the pane has no prompt
 * marker - a multiplexer or a full-screen agent owns the screen - the tool blocks are
 * still dropped, and the trailing run of prose is what remains.
 */
export function extractAnswer(raw: string): { text: string; cut: boolean } {
  const { text: afterPrompt, found } = lastReplyOnly(raw || '');
  const blocks = afterPrompt.split(/\n{2,}/);
  let lastTool = -1;
  blocks.forEach((block, i) => {
    if (isToolOutputBlock(block)) lastTool = i;
  });
  if (lastTool === -1) return { text: afterPrompt, cut: found };
  // Anything before the final tool block is run history (plans, commentary and older
  // output). The assistant's final answer is the structured content that follows it.
  const kept = blocks.slice(lastTool + 1).filter((block) => !isToolOutputBlock(block));
  return { text: kept.join('\n\n'), cut: true };
}
