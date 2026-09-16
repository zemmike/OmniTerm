export interface TerminalFileLink {
  /** One-based inclusive columns, matching xterm's link-provider API. */
  start: number;
  end: number;
  text: string;
  path: string;
  line?: number;
  column?: number;
}

const PATH_TOKEN =
  /(?:^|[\s("'`[])((?:~\/|\.{1,2}\/|\/)[^\s"'`<>|),;\]]+|(?:[A-Za-z0-9_.@+-]+\/)+[A-Za-z0-9_.@+-]+(?::\d+(?::\d+)?)?|[A-Za-z0-9_.@+-]+\.[A-Za-z][A-Za-z0-9]{0,9}(?::\d+(?::\d+)?)?)(?=$|[\s)"'`,;\]])/g;

function normalizeAbsolutePath(value: string): string {
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

export function resolveTerminalPath(raw: string, cwd: string, home: string): string {
  if (raw === '~') return home;
  if (raw.startsWith('~/')) return normalizeAbsolutePath(`${home}/${raw.slice(2)}`);
  if (raw.startsWith('/')) return normalizeAbsolutePath(raw);
  return normalizeAbsolutePath(`${cwd || home}/${raw}`);
}

/** Find Linux paths in one rendered terminal line without treating URLs as files. */
export function terminalFileLinks(line: string, cwd: string, home: string): TerminalFileLink[] {
  const links: TerminalFileLink[] = [];
  PATH_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_TOKEN.exec(line))) {
    const token = match[1];
    if (!token || /^https?:\/\//i.test(token)) continue;
    const location = token.match(/:(\d+)(?::(\d+))?$/);
    const pathText = location ? token.slice(0, -location[0].length) : token;
    if (!pathText) continue;
    const offset = match.index + match[0].indexOf(token);
    links.push({
      start: offset + 1,
      end: offset + token.length,
      text: token,
      path: resolveTerminalPath(pathText, cwd, home),
      line: location ? Number(location[1]) : undefined,
      column: location?.[2] ? Number(location[2]) : undefined,
    });
  }
  return links;
}
