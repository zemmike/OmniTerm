/**
 * OmniTerm real PTY backend.
 *
 * One pseudo-terminal per terminal tab, spawned with the user's own login shell
 * so the app behaves exactly like a normal terminal: the user's prompt, PATH
 * from /etc/profile and ~/.profile, their aliases and functions from ~/.bashrc,
 * job control, colours, and full-screen programs (vim, top, less, ssh).
 *
 * Shell integration (bash) emits two OSC sequences that we parse server-side:
 *   133;D;<exit>;<b64 command>   last command, its exit code
 *   7;file://<host><cwd>         the shell's current directory
 * Both are stripped from the stream sent to the renderer and turned into audit
 * records, so the audit trail keeps working with a real interactive shell.
 */
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ptyLib = require('node-pty');
  } catch (err: any) {
    ptyLoadError = err?.message || String(err);
  }
  return ptyLib;
}

export function ptyStatus() {
  loadPty();
  return { available: !!ptyLib, error: ptyLoadError, shell: process.env.SHELL || '/bin/bash' };
}

// ---------------------------------------------------------------- integration
const DATA_DIR = process.env.OMNITERM_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'omniterm');

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

function shellArgs(shell: string): string[] {
  const base = path.basename(shell);
  if (base === 'bash') {
    const rc = bashIntegrationRc();
    // Interactive shell that reads the user's config through our rc wrapper.
    return rc ? ['--rcfile', rc, '-i'] : ['-l', '-i'];
  }
  // zsh/fish/others: a plain interactive login shell with their own config.
  return ['-l', '-i'];
}

// ------------------------------------------------------------------ sessions
export interface PtyCommandEvent {
  sessionId: string;
  command: string;
  exitCode: number | null;
  cwd: string;
  at: string;
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
    if (code === '133' && payload.startsWith('D;')) {
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
      s.lastExit = Number.isFinite(Number(exitRaw)) ? Number(exitRaw) : null;
      s.typed = '';
      if (command.trim()) {
        commandListener?.({
          sessionId: s.id,
          command: command.trim(),
          exitCode: s.lastExit,
          cwd: s.cwd,
          at: new Date().toISOString(),
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

function trackInput(s: Session, data: string) {
  for (const ch of data) {
    if (ch === '\r' || ch === '\n') continue; // command text comes from history
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
  attach?: WebSocket
) {
  const pty = loadPty();
  if (!pty) throw new Error(`node-pty unavailable: ${ptyLoadError}`);

  const shell = process.env.SHELL || '/bin/bash';
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
    backlog: '',
  };
  sessions.set(opts.id, session);
  if (attach) session.clients.add(attach);

  try {
    const proc = pty.spawn(shell, shellArgs(shell), {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        ...(opts.env || {}),
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
              ws
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
          })
        );
        return;
      }

      if (!session) return;

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
