/**
 * OmniTerm real PTY backend.
 *
 * One pseudo-terminal per terminal tab, spawned with the user's own login shell
 * so the app behaves exactly like a normal terminal: the user's prompt, PATH
 * from /etc/profile and ~/.profile, their aliases and functions from ~/.bashrc,
 * job control, colours, and full-screen programs (vim, top, less, ssh).
 *
 * Shell integration (bash, zsh, fish) emits two OSC sequences we parse here:
 *   133;D;<exit>;<b64 command>   last command, its exit code
 *   7;file://<host><cwd>         the shell's current directory
 * Both are stripped from the stream sent to the renderer and turned into audit
 * records, so the audit trail keeps working with a real interactive shell.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// ---------------------------------------------------------------- native lib
let ptyLib: any = null;
let ptyLoadError: string | null = null;

function loadPty(): any {
  if (ptyLib || ptyLoadError) return ptyLib;
  try {
    // node-pty is a native module that is loaded lazily: a missing/incompatible
    // build must degrade to "unavailable" rather than throw at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ptyLib = require('node-pty');
  } catch (err: any) {
    ptyLoadError = err?.message || String(err);
  }
  return ptyLib;
}

export function ptyStatus() {
  loadPty();
  const shell = process.env.SHELL || '/bin/bash';
  return {
    available: !!ptyLib,
    error: ptyLoadError,
    shell,
    integration: buildShellLaunch(shell).integration,
  };
}

// ---------------------------------------------------------------- integration
const DATA_DIR =
  process.env.OMNITERM_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'omniterm');

/** Bash rc that loads the user's real config and adds OmniTerm's OSC hooks. */
function bashIntegrationRc(): string {
  const rcPath = path.join(DATA_DIR, 'shell-integration.bash');
  const rc = `# OmniTerm shell integration — generated file, safe to delete.
[ -f /etc/profile ] && . /etc/profile
[ -f "$HOME/.bash_profile" ] && . "$HOME/.bash_profile"
[ -f "$HOME/.profile" ] && . "$HOME/.profile"
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"

__omniterm_osc() {
  local __ot_code=$?
  local __ot_cmd __ot_b64
  __ot_cmd=$(HISTTIMEFORMAT= history 1 2>/dev/null | sed -e 's/^ *[0-9]* *//' | tr -d '\\000-\\010\\013\\014\\016-\\037' | head -c 400)
  __ot_b64=$(printf '%s' "$__ot_cmd" | base64 -w0 2>/dev/null)
  printf '\\033]133;D;%s;%s\\007' "$__ot_code" "$__ot_b64"
  printf '\\033]7;file://%s%s\\007' "\${HOSTNAME:-localhost}" "$PWD"
}
# PS0 is printed after a command is read and before it runs: the start marker.
PS0='\\033]133;C\\007'
PROMPT_COMMAND="__omniterm_osc\${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(rcPath, rc, { mode: 0o600 });
    return rcPath;
  } catch {
    return '';
  }
}

export type ShellKind = 'bash' | 'zsh' | 'fish' | 'plain';

export function shellKind(shell: string): ShellKind {
  const base = path.basename(shell || '').toLowerCase();
  if (base.startsWith('bash')) return 'bash';
  if (base.startsWith('zsh')) return 'zsh';
  if (base.startsWith('fish')) return 'fish';
  return 'plain';
}

/** Hook appended to the generated zsh rc files. */
const ZSH_HOOKS = `
__omniterm_precmd() {
  local __ot_code=$?
  local __ot_cmd __ot_b64
  __ot_cmd=$(fc -ln -1 2>/dev/null | sed -e 's/^[[:space:]]*//' | head -c 400)
  case "$__ot_cmd" in __omniterm_precmd*|fc\\ -ln*) __ot_cmd='' ;; esac
  __ot_b64=$(printf '%s' "$__ot_cmd" | base64 -w0 2>/dev/null)
  printf '\\033]133;D;%s;%s\\007' "$__ot_code" "$__ot_b64"
  printf '\\033]7;file://%s%s\\007' "\${HOST:-\${HOSTNAME:-localhost}}" "$PWD"
}
__omniterm_preexec() {
  printf '\\033]133;C\\007'
}
autoload -Uz add-zsh-hook 2>/dev/null
if command -v add-zsh-hook >/dev/null 2>&1; then
  add-zsh-hook precmd __omniterm_precmd
  add-zsh-hook preexec __omniterm_preexec
else
  precmd_functions+=(__omniterm_precmd)
  preexec_functions+=(__omniterm_preexec)
fi
`;

/**
 * zsh ignores --rcfile but honours $ZDOTDIR, so we generate a dotdir whose four
 * startup files each source the user's originals (from $OMNITERM_USER_ZDOTDIR)
 * and then register the OSC hooks. The user's own config still runs, unchanged.
 */
function zshIntegrationDir(): string {
  const dir = path.join(DATA_DIR, 'zdotdir');
  const sourceUser = (name: string) =>
    `__ot_dir="\${OMNITERM_USER_ZDOTDIR:-$HOME}"\n` +
    `if [ -f "$__ot_dir/${name}" ]; then ZDOTDIR="$__ot_dir" . "$__ot_dir/${name}"; fi\n` +
    `unset __ot_dir\n`;
  const banner = '# OmniTerm shell integration — generated file, safe to delete.\n';
  // Debian/Ubuntu ship a global /etc/zsh/zshrc that runs `compinit`. When it
  // decides an fpath directory is insecure (apt-installed dirs, a temp HOME, a
  // container) it asks a question on the terminal — and the shell sits there
  // waiting for an answer nobody can give. ZSH_DISABLE_COMPFIX makes compinit
  // skip that check silently; completions still work.
  const compfix =
    'export ZSH_DISABLE_COMPFIX=true\n' +
    // Debian/Ubuntu /etc/zsh/zshrc runs `compinit` for interactive shells. When
    // it finds an insecure directory (a temp HOME, apt-installed dirs, a
    // container) it asks a question on the terminal and the shell stops there —
    // in a terminal emulator nobody can answer it. Its own comment documents
    // this variable; we initialise completions ourselves, silently, in .zshrc.
    'skip_global_compinit=1\n';
  // Only initialise completions if the user's own config did not, and always
  // with -i so an insecure directory is ignored rather than queried.
  const compinitFallback =
    'if ! (( $+functions[compdef] )); then\n' + '  autoload -Uz compinit && compinit -i\n' + 'fi\n';
  const files: Record<string, string> = {
    '.zshenv': banner + compfix + sourceUser('.zshenv'),
    '.zprofile': banner + sourceUser('.zprofile'),
    '.zlogin': banner + sourceUser('.zlogin'),
    '.zshrc': banner + sourceUser('.zshrc') + compinitFallback + ZSH_HOOKS,
  };
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content, { mode: 0o600 });
    }
    return dir;
  } catch {
    return '';
  }
}

/** fish takes its hooks on the command line; they run before the user's config. */
const FISH_INIT = [
  'function __omniterm_prompt --on-event fish_prompt',
  '  set -l __ot_code $status',
  '  set -l __ot_host (hostname 2>/dev/null; or echo localhost)',
  '  set -l __ot_cmd (history --max=1 2>/dev/null | head -c 400)',
  '  set -l __ot_b64 (printf "%s" "$__ot_cmd" | base64 -w0 2>/dev/null)',
  '  printf \'\\033]133;D;%s;%s\\007\' $__ot_code "$__ot_b64"',
  '  printf \'\\033]7;file://%s%s\\007\' $__ot_host "$PWD"',
  'end',
  'function __omniterm_preexec --on-event fish_preexec',
  "  printf '\\033]133;C\\007'",
  'end',
].join('\n');

let fishInitOk: boolean | null = null;

/** --init-command exists since fish 3.1; probe once instead of guessing. */
function fishSupportsInit(shell: string): boolean {
  if (fishInitOk !== null) return fishInitOk;
  try {
    execFileSync(shell, ['--init-command=true', '-c', 'exit 0'], {
      stdio: 'ignore',
      timeout: 5000,
    });
    fishInitOk = true;
  } catch {
    fishInitOk = false;
  }
  return fishInitOk;
}

export interface ShellLaunch {
  kind: ShellKind;
  args: string[];
  env: Record<string, string>;
  /** Describes how (or whether) this session reports commands and exit codes. */
  integration: string;
}

export function buildShellLaunch(shell: string): ShellLaunch {
  const kind = shellKind(shell);
  if (kind === 'bash') {
    const rc = bashIntegrationRc();
    if (rc) return { kind, args: ['--rcfile', rc, '-i'], env: {}, integration: 'bash osc133' };
  } else if (kind === 'zsh') {
    const dir = zshIntegrationDir();
    if (dir) {
      return {
        kind,
        args: ['-l', '-i'],
        env: {
          ZDOTDIR: dir,
          OMNITERM_USER_ZDOTDIR: process.env.ZDOTDIR || os.homedir(),
          // Belt and braces with the .zshenv line above: the global zshrc runs
          // compinit, and this keeps it from prompting inside the terminal.
          ZSH_DISABLE_COMPFIX: 'true',
        },
        integration: 'zsh osc133',
      };
    }
  } else if (kind === 'fish') {
    if (fishSupportsInit(shell)) {
      return {
        kind,
        args: ['-l', '-i', `--init-command=${FISH_INIT}`],
        env: {},
        integration: 'fish osc133',
      };
    }
  }
  // POSIX sh (dash, ash, busybox) has no -l flag, so it gets a plain
  // interactive shell; it has no prompt hooks either way.
  const base = path.basename(shell || '').toLowerCase();
  const posixBasic = /^(dash|ash|busybox|sh)$/.test(base);
  return { kind: 'plain', args: posixBasic ? ['-i'] : ['-l', '-i'], env: {}, integration: 'none' };
}

// ------------------------------------------------------------------ sessions
export interface PtyCommandEvent {
  sessionId: string;
  command: string;
  exitCode: number | null;
  cwd: string;
  at: string;
  /** Milliseconds between the 133;C and 133;D markers, when the shell reports both. */
  durationMs?: number | null;
}

interface Session {
  id: string;
  proc: any;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  createdAt: string;
  clients: Set<WebSocket>;
  carry: string;
  typed: string;
  lastExit: number | null;
  /** 'bash osc133' | 'zsh osc133' | 'fish osc133' | 'none'. */
  integration: string;
  /** True once the shell has emitted at least one 133;D marker. */
  integrationSeen: boolean;
  /** When the current command started (OSC 133;C), for its duration. */
  startedAt: number | null;
  /** Commands run in this session, most recent last (max 500). */
  history: string[];
  /** Replayed to a client that attaches after the shell already spoke. */
  backlog: string;
}

const BACKLOG_LIMIT = 200_000;

const sessions = new Map<string, Session>();
let commandListener: ((e: PtyCommandEvent) => void) | null = null;

export function onPtyCommand(cb: (e: PtyCommandEvent) => void) {
  commandListener = cb;
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    cwd: s.cwd,
    shell: s.shell,
    cols: s.cols,
    rows: s.rows,
    createdAt: s.createdAt,
    integration: s.integration,
    attached: s.clients.size,
    pid: s.proc?.pid ?? null,
  }));
}

export function killSession(id: string) {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    s.proc.kill();
  } catch {
    /* already gone */
  }
  sessions.delete(id);
  return true;
}

export function killAllSessions() {
  for (const id of [...sessions.keys()]) killSession(id);
}

const OSC_RE = /\u001b\](\d+);([^\u0007\u001b]*)(?:\u0007|\u001b\\)/g;

function handleChunk(s: Session, chunk: string) {
  let out = s.carry + chunk;
  s.carry = '';

  // Hold back a possibly-truncated OSC sequence until the next chunk arrives.
  const lastOsc = out.lastIndexOf('\u001b]');
  if (lastOsc !== -1) {
    const tail = out.slice(lastOsc);
    if (!/[\u0007]|\u001b\\/.test(tail)) {
      s.carry = tail;
      out = out.slice(0, lastOsc);
    }
  }

  out = out.replace(OSC_RE, (_m, code: string, payload: string) => {
    if (code === '133' && payload.startsWith('C')) {
      s.startedAt = Date.now();
    } else if (code === '133' && payload.startsWith('D;')) {
      const rest = payload.slice(2);
      const semi = rest.indexOf(';');
      const exitRaw = semi === -1 ? rest : rest.slice(0, semi);
      const b64 = semi === -1 ? '' : rest.slice(semi + 1);
      let command = '';
      if (b64) {
        try {
          command = Buffer.from(b64, 'base64').toString('utf8');
        } catch {
          command = '';
        }
      }
      if (!command) command = s.typed.trim();
      s.integrationSeen = true;
      s.lastExit = Number.isFinite(Number(exitRaw)) ? Number(exitRaw) : null;
      s.typed = '';
      const durationMs = s.startedAt ? Date.now() - s.startedAt : null;
      s.startedAt = null;
      if (command.trim()) {
        const trimmed = command.trim();
        if (s.history[s.history.length - 1] !== trimmed) s.history.push(trimmed);
        if (s.history.length > 500) s.history.shift();
        commandListener?.({
          sessionId: s.id,
          command: trimmed,
          exitCode: s.lastExit,
          cwd: s.cwd,
          at: new Date().toISOString(),
          durationMs,
        });
        broadcast(s, {
          type: 'command',
          command: trimmed,
          exitCode: s.lastExit,
          durationMs,
          cwd: s.cwd,
        });
      }
    } else if (code === '7') {
      const m = payload.match(/file:\/\/[^/]*(\/.*)$/);
      if (m) s.cwd = decodeURIComponent(m[1]);
    }
    return '';
  });

  for (const client of s.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'data', data: out }));
    }
  }
  s.backlog += out;
  if (s.backlog.length > BACKLOG_LIMIT) s.backlog = s.backlog.slice(-BACKLOG_LIMIT);
}

/** Send an event to every client watching this session. */
function broadcast(s: Session, payload: unknown) {
  const text = JSON.stringify(payload);
  for (const client of s.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  }
}

/**
 * The shell's own history file, newest first, filtered by prefix. This is how
 * Up/Down can offer `git ...` commands from before the app was even started.
 * Formats differ per shell: bash writes one command per line, zsh prefixes
 * ': <start>:<duration>;', fish writes '- cmd: <command>'.
 */
export function shellHistory(prefix: string, limit: number): string[] {
  const shell = path.basename(process.env.SHELL || 'bash');
  const candidates = shell.startsWith('zsh')
    ? [
        path.join(os.homedir(), '.zsh_history'),
        path.join(process.env.ZDOTDIR || os.homedir(), '.zsh_history'),
      ]
    : shell.startsWith('fish')
      ? [path.join(os.homedir(), '.local', 'share', 'fish', 'fish_history')]
      : [path.join(os.homedir(), '.bash_history')];

  const out: string[] = [];
  for (const file of candidates) {
    let text = '';
    try {
      const size = fs.statSync(file).size;
      const fd = fs.openSync(file, 'r');
      const start = Math.max(0, size - 512 * 1024);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      text = buf.toString('utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let cmd = lines[i];
      if (!cmd) continue;
      if (shell.startsWith('fish')) {
        const m = cmd.match(/^- cmd:\s?(.*)$/);
        if (!m) continue;
        cmd = m[1].replace(/\\n/g, ' ').trim();
      } else if (shell.startsWith('zsh')) {
        const m = cmd.match(/^: \d+:\d+;(.*)$/);
        cmd = m ? m[1] : cmd;
      }
      cmd = cmd.trim();
      if (!cmd || cmd.startsWith('#')) continue;
      if (prefix && !cmd.startsWith(prefix)) continue;
      if (!out.includes(cmd)) out.push(cmd);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function trackInput(s: Session, data: string) {
  for (const ch of data) {
    if (ch === '\r' || ch === '\n') {
      // Shells we cannot hook (dash, ash, unknown) still get an audit entry for
      // what was typed. Without shell cooperation the exit code is unknowable,
      // and we do not invent one: it stays null.
      if (!s.integrationSeen && s.typed.trim()) {
        commandListener?.({
          sessionId: s.id,
          command: s.typed.trim(),
          exitCode: null,
          cwd: s.cwd,
          at: new Date().toISOString(),
        });
        s.typed = '';
      }
      continue;
    }
    if (ch === '\u007f' || ch === '\b') {
      s.typed = s.typed.slice(0, -1);
    } else if (ch === '\u0003' || ch === '\u0015') {
      s.typed = ''; // Ctrl+C / Ctrl+U
    } else if (ch >= ' ' && ch !== '\u007f') {
      if (s.typed.length < 2000) s.typed += ch;
    }
  }
}

function spawnSession(
  opts: { id: string; cwd?: string; cols?: number; rows?: number; env?: Record<string, string> },
  attach?: WebSocket,
) {
  const pty = loadPty();
  if (!pty) throw new Error(`node-pty unavailable: ${ptyLoadError}`);

  const shell = process.env.SHELL || '/bin/bash';
  const launch = buildShellLaunch(shell);
  const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : os.homedir();
  const cols = Math.max(20, Math.min(500, opts.cols || 100));
  const rows = Math.max(5, Math.min(300, opts.rows || 30));

  // Register the session (and the requesting client) *before* the shell starts
  // talking, otherwise the first prompt is written before anyone is listening.
  const session: Session = {
    id: opts.id,
    proc: null,
    cwd,
    shell,
    cols,
    rows,
    createdAt: new Date().toISOString(),
    clients: new Set(),
    carry: '',
    typed: '',
    lastExit: null,
    integration: launch.integration,
    integrationSeen: false,
    startedAt: null,
    history: [],
    backlog: '',
  };
  sessions.set(opts.id, session);
  if (attach) session.clients.add(attach);

  try {
    const proc = pty.spawn(shell, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        ...(opts.env || {}),
        ...launch.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        OMNITERM_SESSION: opts.id,
        OMNITERM: '1',
        // LANG/LC_ALL are inherited on purpose: the user's locale is theirs.
      },
    });
    session.proc = proc;

    proc.onData((d: string) => handleChunk(session, d));
    proc.onExit(({ exitCode }: { exitCode: number }) => {
      for (const client of session.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'exit', exitCode }));
        }
      }
      sessions.delete(opts.id);
    });
  } catch (err) {
    sessions.delete(opts.id);
    throw err;
  }

  return session;
}

// -------------------------------------------------------------- websocket API
export function attachTerminalSocket(server: Server, opts: { token: string }) {
  const wss = new WebSocketServer({ server, path: '/term' });

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '/term', 'http://127.0.0.1');
    const token = url.searchParams.get('token') || '';
    const remote = req.socket.remoteAddress || '';
    const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';

    if (!opts.token || token !== opts.token || !isLoopback) {
      ws.send(JSON.stringify({ type: 'error', message: 'unauthorized' }));
      ws.close();
      return;
    }

    let session: Session | null = null;

    ws.on('message', (raw: Buffer) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }

      if (msg.type === 'start') {
        const id: string = String(msg.sessionId || '').slice(0, 64) || `s-${Date.now()}`;
        const existing = sessions.get(id);
        if (existing) {
          session = existing;
          session.clients.add(ws);
          if (session.backlog) {
            ws.send(JSON.stringify({ type: 'data', data: session.backlog }));
          }
        } else {
          try {
            session = spawnSession(
              { id, cwd: msg.cwd, cols: msg.cols, rows: msg.rows, env: msg.env },
              ws,
            );
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', message: err?.message || String(err) }));
            return;
          }
        }
        ws.send(
          JSON.stringify({
            type: 'ready',
            sessionId: session.id,
            shell: session.shell,
            cwd: session.cwd,
            pid: session.proc?.pid ?? null,
            created: session.createdAt,
            integration: session.integration,
          }),
        );
        return;
      }

      if (!session) return;

      if (msg.type === 'history') {
        const prefix = String(msg.prefix || '').trim();
        const limit = Math.max(1, Math.min(1000, Number(msg.limit) || 200));
        const fromSession = [...session.history]
          .reverse()
          .filter((c) => !prefix || c.startsWith(prefix));
        const fromFile = shellHistory(prefix, limit).filter((c) => !fromSession.includes(c));
        ws.send(
          JSON.stringify({
            type: 'history-result',
            requestId: msg.requestId || '',
            prefix,
            items: [...fromSession, ...fromFile].slice(0, limit),
          }),
        );
        return;
      }

      if (msg.type === 'input') {
        const data = String(msg.data ?? '');
        trackInput(session, data);
        session.proc.write(data);
      } else if (msg.type === 'resize') {
        const cols = Math.max(20, Math.min(500, Number(msg.cols) || session.cols));
        const rows = Math.max(5, Math.min(300, Number(msg.rows) || session.rows));
        session.cols = cols;
        session.rows = rows;
        try {
          session.proc.resize(cols, rows);
        } catch {
          /* race with exit */
        }
      } else if (msg.type === 'kill') {
        killSession(session.id);
        session = null;
      }
    });

    ws.on('close', () => {
      // Detach only: the shell keeps running so switching tabs or reloading the
      // renderer does not throw away the user's session. It dies with the app.
      if (session) session.clients.delete(ws);
    });

    ws.on('error', () => {
      if (session) session.clients.delete(ws);
    });
  });

  return wss;
}
