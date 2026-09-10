import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';
import {
  aiChat,
  aiEffective,
  aiListModels,
  aiSettingsForUi,
  aiTest,
  loadAiConfig,
  normaliseConfig,
  saveAiConfig,
  ollamaAvailable,
} from './ai-provider';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// Real interactive terminal backend (node-pty + WebSocket).
import { attachTerminalSocket, onPtyCommand, ptyStatus, listSessions, killSession, killAllSessions } from './pty';

const HOST = process.env.OMNITERM_HOST || '127.0.0.1';
// Fail closed. A server that executes shell commands must never expose an
// unauthenticated API, not even when someone starts it by hand without a token:
// a random one is generated and printed once, so standalone runs still work
// while every request keeps needing the secret.
const ENV_TOKEN = (process.env.OMNITERM_TOKEN || '').trim();
const APP_TOKEN = ENV_TOKEN || crypto.randomBytes(24).toString('hex');
const APP_TOKEN_GENERATED = !ENV_TOKEN;
const EXEC_TIMEOUT_MS = Number(process.env.OMNITERM_EXEC_TIMEOUT_MS) || 60_000;
// Refuse mutating commands on the one-shot API when set. Server-side, opt-in.
const READ_ONLY = /^(1|true|yes|on)$/i.test((process.env.OMNITERM_READONLY || '').trim());
const MAX_OUTPUT_BYTES = 400_000;

app.use(express.json({ limit: '4mb' }));

// ---------------------------------------------------------------------------
// Local API guard.
// This server executes real shell commands, so a page served from the internet
// must never be able to POST to it. Every /api call needs the per-launch token
// that the desktop shell hands to the renderer (see preload.cjs).
// ---------------------------------------------------------------------------
// Hosts a browser may reach this API through. Anything else is a DNS-rebinding
// attempt: a page on evil.com whose name resolves to 127.0.0.1 would otherwise
// talk to a shell as if it were local.
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function hostAllowed(value: string | undefined): boolean {
  if (!value) return false;
  const bare = value.includes('[') ? value.slice(0, value.indexOf(']') + 1) : value.split(':')[0];
  return ALLOWED_HOSTS.has(bare.toLowerCase());
}

app.use('/api', (req, res, next) => {
  if (!hostAllowed(req.get('host'))) {
    return res.status(403).json({ error: 'Forbidden: unexpected Host header.' });
  }
  const origin = req.get('origin');
  if (origin && origin !== 'null') {
    let originHost = '';
    try {
      originHost = new URL(origin).hostname;
    } catch {
      return res.status(403).json({ error: 'Forbidden: malformed Origin header.' });
    }
    if (!hostAllowed(originHost)) {
      return res.status(403).json({ error: `Forbidden: origin ${originHost} is not allowed.` });
    }
  }
  // Constant time compare so the token cannot be narrowed down bit by bit.
  const provided = Buffer.from(String(req.get('x-omniterm-token') || req.query.token || ''));
  const expected = Buffer.from(APP_TOKEN);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid OmniTerm session token.' });
  }
  next();
});

// Security headers. Everything the renderer needs is same-origin; inline styles
// are required by xterm and by Tailwind's runtime classes.
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:*",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ------------------- PERSISTENT COMMAND AUDIT TRAIL ------------------- //
// Every command OmniTerm runs is appended to a JSONL file, so the log tab and
// the /audit export describe what really happened on this machine.
const AUDIT_DIR = process.env.OMNITERM_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'omniterm');
const AUDIT_FILE = path.join(AUDIT_DIR, 'activity.jsonl');

type AuditEntry = {
  id: string;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  details: string;
  ip: string;
  severity: 'info' | 'warning' | 'error' | 'security_alert';
  cwd?: string;
  exitCode?: number | null;
  durationMs?: number;
  command?: string;
};

function loadAuditLog(limit = 300): AuditEntry[] {
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as AuditEntry[];
  } catch {
    return [];
  }
}

const AUDIT_MAX_BYTES = Number(process.env.OMNITERM_AUDIT_MAX_BYTES) || 8 * 1024 * 1024;

function appendAuditLog(entry: AuditEntry) {
  activityLogs.unshift(entry);
  if (activityLogs.length > 500) activityLogs.length = 500;
  try {
    fs.mkdirSync(AUDIT_DIR, { recursive: true, mode: 0o700 });
    // Rotate before writing: one generation (activity.jsonl.1) is plenty for a
    // local log, and it stops the file growing without bound on a long-running
    // machine.
    try {
      if (fs.statSync(AUDIT_FILE).size > AUDIT_MAX_BYTES) {
        fs.renameSync(AUDIT_FILE, `${AUDIT_FILE}.1`);
      }
    } catch {
      /* no log yet, or it disappeared under us */
    }
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch {
    /* auditing must never break command execution */
  }
}

const activityLogs: AuditEntry[] = loadAuditLog(200);

const systemAlerts: Array<{
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'cpu_high' | 'disk_warning' | 'security_denied' | 'backup_failed' | 'network_spike';
  read: boolean;
}> = [];

function pushAlert(title: string, message: string, type: 'cpu_high' | 'disk_warning' | 'security_denied' | 'backup_failed' | 'network_spike') {
  systemAlerts.unshift({ id: `alt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toISOString(), title, message, type, read: false });
  if (systemAlerts.length > 50) systemAlerts.length = 50;
}

// ------------------- REAL FILESYSTEM HELPERS ------------------- //

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg']);
const ARCHIVE_EXT = new Set(['.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.deb', '.rpm']);
const MAX_READ_BYTES = 2_000_000;

function permissionsString(mode: number): string {
  const bits = ['-', '-', '-', '-', '-', '-', '-', '-', '-'];
  const letters = ['r', 'w', 'x'];
  for (let i = 0; i < 9; i += 1) {
    if (mode & (1 << (8 - i))) bits[i + 1] = letters[i % 3];
  }
  return bits.join('');
}

function languageOf(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.json': 'json', '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.py': 'python',
    '.md': 'markdown', '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'toml', '.css': 'css',
    '.html': 'html', '.sql': 'sql', '.rs': 'rust', '.go': 'go', '.c': 'c', '.cpp': 'cpp',
    '.conf': 'nginx', '.service': 'ini', '.env': 'ini', '.log': 'text',
  };
  if (map[ext]) return map[ext];
  if (IMAGE_EXT.has(ext)) return 'image';
  return ARCHIVE_EXT.has(ext) ? 'archive' : 'text';
}

function describeEntry(dir: string, name: string) {
  const full = path.join(dir, name);
  const st = fs.lstatSync(full);
  const isDir = st.isDirectory();
  let isLink = st.isSymbolicLink();
  let target: string | null = null;
  if (isLink) {
    try {
      target = fs.readlinkSync(full);
    } catch {
      target = null;
    }
  }
  return {
    id: full,
    path: full,
    name,
    type: (isDir ? 'directory' : 'file') as 'directory' | 'file',
    size: isDir ? st.size : st.size,
    modified: new Date(st.mtimeMs).toISOString().replace('T', ' ').slice(0, 16),
    owner: String(st.uid),
    permissions: `${isLink ? 'l' : isDir ? 'd' : '-'}${permissionsString(st.mode).slice(1)}`,
    language: isDir ? 'folder' : languageOf(name),
    isLink,
    target,
  };
}

function listDirectory(target: string) {
  const dir = path.resolve(target.replace(/^~(?=$|\/)/, os.homedir()));
  if (!fs.existsSync(dir)) throw new Error(`No such directory: ${dir}`);
  if (!fs.statSync(dir).isDirectory()) throw new Error(`Not a directory: ${dir}`);

  const entries = fs
    .readdirSync(dir)
    .map((name) => {
      try {
        return describeEntry(dir, name);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    path: dir,
    parent: path.dirname(dir) === dir ? null : path.dirname(dir),
    entries,
  };
}

// ------------------- REAL GIT / DOCKER / TOOLCHAIN HELPERS ------------------- //

function runQuick(cmd: string, args: string[], cwd?: string) {
  try {
    const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 6000 });
    return { ok: res.status === 0, out: (res.stdout || '').trim(), err: (res.stderr || '').trim(), status: res.status };
  } catch (err: any) {
    return { ok: false, out: '', err: err.message, status: -1 };
  }
}

function repoStatus(dir?: string) {
  const cwd = resolveCwd(dir);
  const inside = runQuick('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], cwd);
  if (!inside.ok || inside.out !== 'true') {
    return { isRepo: false, cwd, branch: null, changed: 0, untracked: 0, ahead: 0, behind: 0, toplevel: null, lastCommit: null };
  }

  const toplevel = runQuick('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], cwd).out || cwd;
  const status = runQuick('git', ['-C', toplevel, 'status', '--porcelain=v1', '--branch'], toplevel);
  const lines = status.out.split('\n').filter(Boolean);
  const header = lines.find((l) => l.startsWith('##')) || '';
  const files = lines.filter((l) => !l.startsWith('##'));

  let branch = header.replace('##', '').trim().split('...')[0].split(' ')[0] || 'HEAD';
  const ahead = Number((header.match(/ahead (\d+)/) || [])[1] || 0);
  const behind = Number((header.match(/behind (\d+)/) || [])[1] || 0);
  if (branch === 'HEAD (no branch)') branch = 'detached';

  const last = runQuick('git', ['-C', toplevel, 'log', '-1', '--pretty=%h %s'], toplevel).out;

  return {
    isRepo: true,
    cwd,
    toplevel,
    branch,
    changed: files.filter((l) => !l.startsWith('??')).length,
    untracked: files.filter((l) => l.startsWith('??')).length,
    ahead,
    behind,
    lastCommit: last || null,
  };
}

function dockerStatus() {
  const ping = runQuick('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (!ping.ok) {
    return { available: false, serverVersion: null, running: 0, total: 0, containers: [] as any[] };
  }
  const ps = runQuick('docker', ['ps', '-a', '--format', '{{.Names}}|{{.Status}}|{{.Image}}|{{.Ports}}']);
  const containers = ps.out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, status, image, ports] = line.split('|');
      return { name, status, image, ports, running: /^Up/.test(status || '') };
    });
  return {
    available: true,
    serverVersion: ping.out,
    running: containers.filter((c) => c.running).length,
    total: containers.length,
    containers,
  };
}

function toolchainStatus() {
  const tools = ['git', 'node', 'npm', 'python3', 'docker', 'ollama', 'kubectl', 'cargo', 'go', 'rg', 'fd', 'jq', 'tmux'];
  return tools.map((tool) => {
    const found = runQuick('bash', ['-lc', `command -v ${tool}`]);
    if (!found.ok) return { name: tool, installed: false, version: null, path: null };
    const flag = tool === 'go' ? 'version' : '--version';
    const version = runQuick('bash', ['-lc', `${tool} ${flag} 2>&1 | head -1`]).out;
    return { name: tool, installed: true, version: version || 'installed', path: found.out };
  });
}

// ------------------- REAL SYSTEM SECURITY POSTURE ------------------- //

function securityPosture() {
  // Loopback, link-local and local daemons are not reachable from the network.
  const isLoopback = (addr, proc) =>
    addr.startsWith('127.') ||
    addr.startsWith('[::1]') ||
    addr === '::1' ||
    addr.startsWith('169.254.') ||
    proc.includes('systemd-network') ||
    proc.includes('systemd-resolve') ||
    proc.includes('chronyd');

  const listening = runQuick('bash', ['-lc', "ss -tulpnH 2>/dev/null | awk '{print $1, $5, $7}' | head -40"]).out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const addr = parts[1] || '';
      const idx = addr.lastIndexOf(':');
      const process = (parts.slice(2).join(' ') || '-').replace(/users:\(\(|\)\)/g, '').split(',')[0] || '-';
      return {
        proto: (parts[0] || '').toLowerCase(),
        address: idx > 0 ? addr.slice(0, idx) : addr,
        port: idx > 0 ? addr.slice(idx + 1) : '',
        process,
        exposed: !isLoopback(addr, process),
      };
    });

  const ufw = runQuick('bash', ['-lc', 'command -v ufw >/dev/null && ufw status 2>/dev/null | head -1 || echo "ufw not installed"']);
  const apparmor = runQuick('bash', ['-lc', 'command -v aa-status >/dev/null && aa-status --enabled 2>/dev/null && echo enabled || echo unknown']);
  const sudoers = runQuick('bash', ['-lc', "getent group sudo wheel 2>/dev/null | cut -d: -f1,4"]).out;
  const sshKeys = runQuick('bash', ['-lc', 'find ~/.ssh -maxdepth 1 -name "id_*" ! -name "*.pub" 2>/dev/null | wc -l']);
  const authorized = runQuick('bash', ['-lc', 'test -f ~/.ssh/authorized_keys && wc -l < ~/.ssh/authorized_keys || echo 0']);
  const sshd = runQuick('bash', ['-lc', "systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || echo inactive"]);
  const worldWritable = runQuick('bash', ['-lc', "find /etc -maxdepth 2 -type f -perm -o+w 2>/dev/null | wc -l"]);

  return {
    firewall: ufw.out.split('\n')[0] || 'unknown',
    apparmor: apparmor.out.trim() || 'unknown',
    sudoGroups: sudoers.trim() || '-',
    sshKeys: Number(sshKeys.out) || 0,
    authorizedKeys: Number(authorized.out) || 0,
    sshService: sshd.out.trim() || 'inactive',
    worldWritableEtcFiles: Number(worldWritable.out) || 0,
    listening: listening,
    exposedPorts: listening.filter((l) => l.exposed).length,
    auditFile: AUDIT_FILE,
    auditEntries: activityLogs.length,
  };
}


/**
 * Copilot used by the `ai` terminal command and the /api/ai/copilot endpoint.
 * Which provider answers is entirely up to the user's settings; this helper
 * only decides what to ask and how to report a failure.
 */
async function askCopilot(prompt: string, cwd: string): Promise<string> {
  const config = loadAiConfig();
  try {
    const reply = await aiChat(config.systemPrompt, `Working directory: ${cwd}\nRequest: ${prompt}`);
    return `${reply.text}\n\n[${reply.source} \u00b7 ${reply.latencyMs}ms]`;
  } catch (err: any) {
    return (
      `[AI] ${err.message}\n` +
      'Set up a provider in the AI Settings tab (any OpenAI-compatible API, Anthropic, Gemini, or a local Ollama).'
    );
  }
}

// ------------------- REAL EXECUTION ENGINE ------------------- //

const SHELL =
  process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/bash';

// Commands that need a real TTY (full-screen / prompt driven). We run one
// command per request over pipes, so these would just hang until the timeout.
const INTERACTIVE_ONLY = new Set([
  'vi', 'vim', 'nvim', 'nano', 'emacs', 'pico', 'less', 'more', 'most',
  'top', 'htop', 'btop', 'watch', 'man', 'passwd', 'ssh', 'telnet', 'sftp',
  'ftp', 'tmux', 'screen', 'ncdu', 'irssi', 'w3m', 'lynx', 'gdb',
]);

export const DEFAULT_CWD =
  process.env.OMNITERM_CWD && fs.existsSync(process.env.OMNITERM_CWD)
    ? process.env.OMNITERM_CWD
    : os.homedir();

function resolveCwd(candidate?: string): string {
  try {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_CWD;
}

function detectSyntax(command: string, output: string): string {
  const bin = command.trim().split(/\s+/)[0];
  if (['git', 'npm', 'docker', 'ls', 'ps', 'df', 'free', 'systemctl'].includes(bin)) return 'bash';
  if (bin === 'node') return 'node';
  if (bin.startsWith('python')) return 'python';
  if (/^\s*[[{]/.test(output)) return 'json';
  return 'text';
}

function runShellCommand(command: string, cwd: string) {
  return new Promise<{
    output: string;
    status: 'success' | 'error';
    cwd: string;
    exitCode: number | null;
  }>((resolve) => {
    const child = spawn(SHELL, ['-lc', command], {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', OMNITERM: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, EXEC_TIMEOUT_MS);

    const append = (chunk: Buffer) => {
      if (output.length + chunk.length > MAX_OUTPUT_BYTES) {
        truncated = true;
        return;
      }
      output += chunk.toString('utf8');
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      let finalOutput = output.replace(/\s+$/, '');
      if (truncated) {
        finalOutput += `\n\n[OmniTerm] Output truncated at ${MAX_OUTPUT_BYTES} bytes.`;
      }
      if (timedOut) {
        finalOutput += `\n\n[OmniTerm] Command exceeded the ${EXEC_TIMEOUT_MS / 1000}s timeout and was killed.`;
      } else if (signal) {
        finalOutput += `\n\n[OmniTerm] Command terminated by signal ${signal}.`;
      }
      if (!finalOutput) {
        finalOutput = code === 0 ? '(no output)' : `(exited with code ${code})`;
      }

      resolve({
        output: finalOutput,
        status: code === 0 && !timedOut ? 'success' : 'error',
        cwd,
        exitCode: code,
      });
    };

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ output: `[OmniTerm] Failed to run command: ${err.message}`, status: 'error', cwd, exitCode: null });
    });
    child.on('close', finish);
  });
}

// ------------------- API ENDPOINTS ------------------- //

// ------------------- REAL SYSTEM METRICS HELPERS ------------------- //
function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.idle + t.user + t.nice + t.sys + t.irq;
  }
  return { idle, total };
}

let prevNet: { rx: number; tx: number; at: number } | null = null;
function networkRates() {
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    let rx = 0;
    let tx = 0;
    let busiest = '';
    let busiestBytes = -1;
    for (const line of lines) {
      const [ifaceRaw, rest] = line.split(':');
      const iface = (ifaceRaw || '').trim();
      if (!rest || iface === 'lo') continue;
      const cols = rest.trim().split(/\s+/);
      const ifaceRx = Number(cols[0]) || 0;
      const ifaceTx = Number(cols[8]) || 0;
      rx += ifaceRx;
      tx += ifaceTx;
      // Report the interface actually carrying the traffic, not a guess.
      if (ifaceRx + ifaceTx > busiestBytes) {
        busiestBytes = ifaceRx + ifaceTx;
        busiest = iface;
      }
    }
    const now = Date.now();
    const prev = prevNet;
    prevNet = { rx, tx, at: now };
    if (!prev || now === prev.at) return { rxKbps: 0, txKbps: 0, interface: busiest };
    const seconds = (now - prev.at) / 1000;
    return {
      rxKbps: Math.max(0, Math.round(((rx - prev.rx) * 8) / 1000 / seconds)),
      txKbps: Math.max(0, Math.round(((tx - prev.tx) * 8) / 1000 / seconds)),
      interface: busiest,
    };
  } catch {
    return { rxKbps: 0, txKbps: 0, interface: '' };
  }
}

function memAvailableMb(): number | null {
  try {
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const m = info.match(/^MemAvailable:\s+(\d+) kB/m);
    return m ? Math.round(Number(m[1]) / 1024) : null;
  } catch {
    return null;
  }
}

function diskUsage() {
  try {
    const st: any = (fs as any).statfsSync ? (fs as any).statfsSync(os.homedir()) : null;
    if (st) {
      const total = (st.blocks * st.bsize) / 1073741824;
      const free = (st.bavail * st.bsize) / 1073741824;
      const used = total - free;
      return {
        usedGb: Number(used.toFixed(1)),
        totalGb: Number(total.toFixed(1)),
        percent: Number(((used / total) * 100).toFixed(1)),
        // The path the figures were measured on, so the UI can label it truthfully.
        path: os.homedir(),
      };
    }
  } catch {
    /* fall through */
  }
  return { usedGb: 0, totalGb: 0, percent: 0, path: os.homedir() };
}

function activeConnectionCount() {
  let count = 0;
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
      for (const line of lines.slice(1)) {
        // Fields: 0 sl, 1 local, 2 remote, 3 state … so the state is index 3,
        // and 01 means ESTABLISHED. (Reading index 6 counted the wrong column.)
        const cols = line.trim().split(/\s+/);
        if (cols[3] === '01') count += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return count;
}

function processCount() {
  try {
    return fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).length;
  } catch {
    return 0;
  }
}

function topProcesses() {
  try {
    const out = spawnSync('ps', ['-eo', 'pid,comm,%cpu,%mem,user', '--sort=-%cpu'], {
      encoding: 'utf8',
      timeout: 4000,
    }).stdout || '';
    return out
      .trim()
      .split('\n')
      .slice(1)
      // The sampler itself is always near the top of its own snapshot (ps can
      // briefly show high CPU), and that is not a fact about the machine.
      .filter((row) => !/^\s*\d+\s+(ps|awk|sort|head|cut|tr|sed)\s/.test(row))
      .slice(0, 5)
      .map((row) => {
        // `comm` can contain spaces ("npm run build"), which shifts a
        // positional parse and puts a number in the user column. Parse the
        // fixed columns from the left and the numeric ones from the right.
        const cols = row.trim().split(/\s+/);
        if (cols.length < 5) return { pid: 0, name: 'unknown', cpu: 0, memory: 0, user: 'unknown' };
        const pid = Number(cols[0]) || 0;
        const user = cols[cols.length - 1] || 'unknown';
        const mem = Number(cols[cols.length - 2]) || 0;
        const cpu = Number(cols[cols.length - 3]) || 0;
        return {
          pid,
          name: cols.slice(1, cols.length - 3).join(' ') || 'unknown',
          cpu,
          memory: Number(((mem / 100) * (os.totalmem() / 1048576)).toFixed(1)),
          user,
        };
      })
      .filter((proc) => proc.pid > 0);
  } catch {
    return [];
  }
}

// ------------------- DEEP RESOURCE BREAKDOWN HELPERS ------------------- //
// Everything below reads the raw kernel counters directly (/proc, ps, statfs).
// When a source cannot be read we return null / an empty list — never a
// plausible-looking number, because a made-up figure is worse than a blank.

/** Raw /proc/meminfo as a name -> kB map (keys keep the trailing "(...)" form). */
function readMeminfo(): Record<string, number> | null {
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const out: Record<string, number> = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Za-z()_]+):\s+(\d+)\s*kB/);
      if (m) out[m[1]] = Number(m[2]);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Full memory picture in MB. Note the distinction the UI must keep straight:
 * `available` (MemAvailable) is what free/top mean by free — it already counts
 * reclaimable page cache — while `usedPercent` is computed from it so the
 * headline number is not skewed by cache on a long-running box.
 */
function memoryBreakdown() {
  const info = readMeminfo();
  if (!info) return null;
  const mb = (key: string) => Number(((info[key] ?? 0) / 1024).toFixed(1));
  const total = mb('MemTotal');
  const available = typeof info.MemAvailable === 'number' ? mb('MemAvailable') : mb('MemFree');
  const swapTotal = mb('SwapTotal');
  const swapFree = mb('SwapFree');
  return {
    total,
    free: mb('MemFree'),
    available,
    buffers: mb('Buffers'),
    cached: mb('Cached'),
    shared: mb('Shmem'),
    slab: mb('Slab'),
    dirty: mb('Dirty'),
    swapTotal,
    swapFree,
    usedPercent: total > 0 ? Number((((total - available) / total) * 100).toFixed(1)) : 0,
    swapPercent: swapTotal > 0 ? Number((((swapTotal - swapFree) / swapTotal) * 100).toFixed(1)) : 0,
  };
}

type PsMemRow = { pid: number; name: string; rssKb: number; percent: number; cpu: number; user: string };

/**
 * Every process, sorted by resident set size. Parsed from both ends of the row
 * (pid first, owner last) so a `comm` value containing spaces cannot shift the
 * numeric columns. The sampler itself is dropped, exactly like topProcesses:
 * ps briefly shows high CPU/RSS for its own snapshot and that is not a fact
 * about the machine.
 */
function psMemoryRows(): PsMemRow[] {
  try {
    const out =
      spawnSync('ps', ['-eo', 'pid,comm,rss,%mem,%cpu,user', '--sort=-rss'], {
        encoding: 'utf8',
        timeout: 4000,
      }).stdout || '';
    return out
      .trim()
      .split('\n')
      .slice(1)
      .filter((row) => !/^\s*\d+\s+(ps|awk|sort|head|cut|tr|sed)\s/.test(row))
      .map((row) => {
        const cols = row.trim().split(/\s+/);
        if (cols.length < 6) return null;
        const pid = Number(cols[0]) || 0;
        const user = cols[cols.length - 1];
        const cpu = Number(cols[cols.length - 2]) || 0;
        const percent = Number(cols[cols.length - 3]) || 0;
        const rssKb = Number(cols[cols.length - 4]) || 0;
        const name = cols.slice(1, cols.length - 4).join(' ') || 'unknown';
        return { pid, name, rssKb, percent, cpu, user };
      })
      .filter((p): p is PsMemRow => !!p && p.pid > 0);
  } catch {
    return [];
  }
}

function topMemoryProcesses(rows: PsMemRow[]) {
  return rows.slice(0, 8).map((r) => {
    const rssMb = Number((r.rssKb / 1024).toFixed(1));
    return { pid: r.pid, name: r.name, cpu: r.cpu, memory: rssMb, user: r.user, rssMb, percent: r.percent };
  });
}

/** Why 79% is used when no single process looks big: 20 chrome processes. */
function memoryByGroup(rows: PsMemRow[], totalRamMb: number) {
  const groups = new Map<string, { processes: number; rssKb: number }>();
  for (const r of rows) {
    const g = groups.get(r.name) || { processes: 0, rssKb: 0 };
    g.processes += 1;
    g.rssKb += r.rssKb;
    groups.set(r.name, g);
  }
  return [...groups.entries()]
    .map(([name, g]) => {
      const rssMb = Number((g.rssKb / 1024).toFixed(1));
      return {
        name,
        processes: g.processes,
        rssMb,
        percentOfRam: totalRamMb > 0 ? Number(((rssMb / totalRamMb) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.rssMb - a.rssMb)
    .slice(0, 10);
}

function swapUsage() {
  const info = readMeminfo();
  if (!info) return null;
  const totalMb = Number(((info.SwapTotal ?? 0) / 1024).toFixed(1));
  const freeMb = Number(((info.SwapFree ?? 0) / 1024).toFixed(1));
  const usedMb = Number((totalMb - freeMb).toFixed(1));
  return { totalMb, freeMb, usedMb, percent: totalMb > 0 ? Number(((usedMb / totalMb) * 100).toFixed(1)) : 0 };
}

// Physical, device-backed filesystems only. Pseudo-filesystems, container
// overlays and snap squashfs loops say nothing about disk headroom, and
// listing them would just bury the rows that matter.
const MOUNT_FS_ALLOW = /^(ext[234]|xfs|btrfs|zfs|vfat|exfat|f2fs|nfs\d?|nfs4)$/;

function mountedFilesystems() {
  try {
    const lines = fs.readFileSync('/proc/mounts', 'utf8').split('\n').filter(Boolean);
    const seen = new Set<string>();
    const mounts: Array<{ path: string; device: string; fs: string; usedGb: number; totalGb: number; percent: number }> = [];
    for (const line of lines) {
      const parts = line.split(' ');
      const device = parts[0] || '';
      const mp = (parts[1] || '').replace(/\\040/g, ' ');
      const fsType = parts[2] || '';
      if (!device || !mp || !fsType || !MOUNT_FS_ALLOW.test(fsType)) continue;
      if (seen.has(device)) continue;
      try {
        const st: any = (fs as any).statfsSync(mp);
        if (!st || !st.bsize || !st.blocks) continue;
        const totalGb = (st.blocks * st.bsize) / 1073741824;
        const freeGb = (st.bavail * st.bsize) / 1073741824;
        const usedGb = totalGb - freeGb;
        seen.add(device);
        mounts.push({
          path: mp,
          device,
          fs: fsType,
          usedGb: Number(usedGb.toFixed(2)),
          totalGb: Number(totalGb.toFixed(2)),
          percent: totalGb > 0 ? Number(((usedGb / totalGb) * 100).toFixed(1)) : 0,
        });
      } catch {
        /* mount point vanished or is not statfs-able — skip it, do not guess */
      }
    }
    return mounts.sort((a, b) => b.totalGb - a.totalGb);
  } catch {
    return [];
  }
}

// Whole block devices only (vda, sda, nvme0n1, mmcblk0) — never their
// partitions, whose counters are already summed into the parent.
const DISK_WHOLE_RE = /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/;

function diskstatsPerDevice(): Record<string, { read: number; write: number }> {
  try {
    const lines = fs.readFileSync('/proc/diskstats', 'utf8').split('\n').filter(Boolean);
    const per: Record<string, { read: number; write: number }> = {};
    for (const line of lines) {
      const c = line.trim().split(/\s+/);
      const name = c[2];
      if (!name || !DISK_WHOLE_RE.test(name)) continue;
      // Fields: 5 = sectors read, 9 = sectors written (0-based after the name).
      per[name] = { read: (Number(c[5]) || 0) * 512, write: (Number(c[9]) || 0) * 512 };
    }
    return per;
  } catch {
    return {};
  }
}

let prevDisk: { per: Record<string, { read: number; write: number }>; at: number } | null = null;
function diskIORates() {
  const per = diskstatsPerDevice();
  const now = Date.now();
  const prev = prevDisk;
  const prevPer = prev?.per || {};
  let readBytes = 0;
  let writeBytes = 0;
  let busiest = '';
  let busiestDelta = -1;
  let busiestCumulative = '';
  let busiestCumulativeBytes = -1;
  for (const [name, s] of Object.entries(per)) {
    const p = prevPer[name] || { read: s.read, write: s.write };
    const dr = Math.max(0, s.read - p.read);
    const dw = Math.max(0, s.write - p.write);
    readBytes += dr;
    writeBytes += dw;
    if (dr + dw > busiestDelta) {
      busiestDelta = dr + dw;
      busiest = name;
    }
    if (s.read + s.write > busiestCumulativeBytes) {
      busiestCumulativeBytes = s.read + s.write;
      busiestCumulative = name;
    }
  }
  prevDisk = { per, at: now };
  // Before the second sample there are no deltas, so fall back to the busiest
  // disk overall rather than claiming an arbitrary device.
  const device = busiestDelta > 0 ? busiest : busiestCumulative;
  if (!prev || !prev.at) return { readKbps: 0, writeKbps: 0, device };
  const seconds = (now - prev.at) / 1000;
  if (!seconds) return { readKbps: 0, writeKbps: 0, device };
  return {
    readKbps: Math.max(0, Math.round(readBytes / 1024 / seconds)),
    writeKbps: Math.max(0, Math.round(writeBytes / 1024 / seconds)),
    device,
  };
}

/** Two /proc/stat readouts; the handler reuses its existing 150 ms window. */
function procStatCpu() {
  const aggregate = { idle: 0, total: 0 };
  const cores: Array<{ core: number; idle: number; total: number }> = [];
  try {
    for (const line of fs.readFileSync('/proc/stat', 'utf8').split('\n')) {
      const m = line.match(/^cpu(\d*)\s+(.*)$/);
      if (!m) break;
      const f = m[2].trim().split(/\s+/).map(Number);
      const idle = (f[3] || 0) + (f[4] || 0); // idle + iowait
      const total = f.slice(0, 8).reduce((a, b) => a + (b || 0), 0);
      if (m[1] === '') {
        aggregate.idle = idle;
        aggregate.total = total;
      } else {
        cores.push({ core: Number(m[1]), idle, total });
      }
    }
  } catch {
    /* leave the arrays empty; the caller reports no data */
  }
  return { aggregate, cores };
}

function perCoreUsage(before: ReturnType<typeof procStatCpu>, after: ReturnType<typeof procStatCpu>) {
  return after.cores
    .map((c) => {
      const b = before.cores.find((x) => x.core === c.core);
      if (!b) return null;
      const idleDelta = c.idle - b.idle;
      const totalDelta = c.total - b.total || 1;
      return { core: c.core, usage: Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100))) };
    })
    .filter((c): c is { core: number; usage: number } => !!c)
    .sort((a, b) => a.core - b.core);
}

/**
 * First readable thermal zone, in Celsius. Reports null when the machine has no
 * thermal subsystem or the value is outside a plausible range — the UI then
 * hides the reading instead of printing a nonsense temperature.
 */
function cpuTemperature(): number | null {
  try {
    const zones = fs.readdirSync('/sys/class/thermal').filter((d) => d.startsWith('thermal_zone'));
    for (const zone of zones) {
      try {
        const raw = fs.readFileSync(`/sys/class/thermal/${zone}/temp`, 'utf8').trim();
        const milli = Number(raw);
        if (!Number.isFinite(milli)) continue;
        const celsius = milli / 1000;
        if (celsius > 0 && celsius < 150) return Number(celsius.toFixed(1));
      } catch {
        /* unreadable zone — try the next one */
      }
    }
  } catch {
    /* no /sys/class/thermal on this machine */
  }
  return null;
}

// 1. Server Health Metrics Endpoint (real host metrics)
app.get('/api/health', async (req, res) => {
  const before = cpuSnapshot();
  const statBefore = procStatCpu();
  await new Promise((r) => setTimeout(r, 150));
  const after = cpuSnapshot();
  const statAfter = procStatCpu();

  const idleDelta = after.idle - before.idle;
  const totalDelta = after.total - before.total || 1;
  const cpuUsage = Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));

  const totalMb = Math.round(os.totalmem() / 1048576);
  const freeMb = Math.round(os.freemem() / 1048576);
  // os.freemem() is MemFree only: it ignores reclaimable page cache and so
  // overstates "used" on any long-running Linux box. MemAvailable is the figure
  // free/top mean, so that is what we report.
  const availableMb = memAvailableMb() ?? freeMb;
  const usedMb = totalMb - availableMb;
  const load = os.loadavg();

  // One ps pass feeds both the per-process table and the by-program rollup.
  const memRows = psMemoryRows();

  res.json({
    status: cpuUsage > 92 ? 'degraded' : 'healthy',
    cpuUsage,
    cpuCores: os.cpus().length,
    loadAverage: { one: Number(load[0].toFixed(2)), five: Number(load[1].toFixed(2)), fifteen: Number(load[2].toFixed(2)) },
    memoryUsage: {
      usedMb,
      totalMb,
      freeMb,
      availableMb,
      percent: Math.round((usedMb / totalMb) * 100),
    },
    diskUsage: diskUsage(),
    networkIO: networkRates(),
    uptimeSeconds: Math.floor(os.uptime()),
    processCount: processCount(),
    activeConnections: activeConnectionCount(),
    topProcesses: topProcesses(),
    // ---- Deep resource breakdown (all read from /proc, ps and statfs) ----
    memoryBreakdown: memoryBreakdown(),
    topMemoryProcesses: topMemoryProcesses(memRows),
    memoryByGroup: memoryByGroup(memRows, totalMb),
    swapUsage: swapUsage(),
    mounts: mountedFilesystems(),
    diskIO: diskIORates(),
    perCoreCpu: perCoreUsage(statBefore, statAfter),
    cpuTemperature: cpuTemperature(),
    cpuModel: (os.cpus()[0]?.model || '').trim(),
    systemInfo: {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      hostname: os.hostname(),
      kernel: os.release(),
      nodeVersion: process.version,
      distro: process.env.OMNITERM_DISTRO || '',
    },
  });
});

// 1b. Real environment info (drives the initial working directory / preset)
app.get('/api/env', async (req, res) => {
  res.json({
    platform: process.platform,
    home: os.homedir(),
    cwd: DEFAULT_CWD,
    user: (() => {
      try {
        return os.userInfo().username;
      } catch {
        return process.env.USER || 'user';
      }
    })(),
    hostname: os.hostname(),
    shell: SHELL,
    version: process.env.OMNITERM_VERSION || '1.0.0',
    aiEnabled: (await aiEffective()).config.provider !== 'none',
  });
});

// 2. Terminal Command Execution API
app.post('/api/terminal/execute', async (req, res) => {
  const { command, cwd = DEFAULT_CWD } = req.body;
  const startTime = Date.now();

  if (!command || !command.trim()) {
    return res.json({
      output: '',
      status: 'success',
      executionTimeMs: 0,
      cwd,
    });
  }

  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();

  // Opt-in read-only mode for this one-shot API. The role this used to check
  // came from the request body, so any caller could simply send "admin" - it was
  // theatre. This is server-side state that a request cannot change.
  // (The interactive Terminal tab is deliberately not restricted: it is a real
  // terminal, and the OS user's own permissions are the control there.)
  if (READ_ONLY) {
    const mutating =
      /^(sudo|su|doas|rm|rmdir|mv|cp|dd|mkfs\.?\w*|chmod|chown|chattr|truncate|tee|shred|kill|pkill|killall|shutdown|reboot|poweroff|systemctl|service|apt|apt-get|dpkg|dnf|yum|pacman|snap|pip|pip3|npm|yarn|pnpm|mount|umount|useradd|usermod|passwd)\b/.test(trimmed) ||
      /(^|[^>])>{1,2}\s*\S/.test(trimmed);
    if (mutating) {
      appendAuditLog({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        username: os.userInfo().username,
        role: 'read-only',
        action: 'COMMAND_BLOCKED',
        details: `Blocked '${trimmed}' (OMNITERM_READONLY=1)`,
        ip: '127.0.0.1',
        severity: 'warning',
        cwd,
      });
      return res.status(403).json({
        error: 'Refused: this API is in read-only mode (OMNITERM_READONLY=1).',
        output: '',
        status: 'blocked',
        cwd,
      });
    }
  }


  // ---- OmniTerm built-ins (handled by the app, not the shell) ----
  const parts = trimmed.split(/\s+/);
  const bin = (parts[0] || '').toLowerCase();
  let output = '';
  let status: 'success' | 'error' | 'denied' = 'success';
  let syntaxType: any = 'text';
  let nextCwd = resolveCwd(cwd);
  let exitCode: number | null = 0;
  let handledByApp = true;

  if (lower === 'clear' || lower === 'cls') {
    output = '__CLEAR__';
  } else if (bin === 'cd') {
    const raw = parts.slice(1).join(' ').trim() || os.homedir();
    const target = raw.replace(/^~(?=$|\/)/, os.homedir());
    const resolved = path.resolve(nextCwd, target);
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        nextCwd = fs.realpathSync(resolved);
        output = nextCwd;
      } else {
        output = `cd: ${raw}: No such file or directory`;
        status = 'error';
      }
    } catch (err: any) {
      output = `cd: ${err.message}`;
      status = 'error';
    }
  } else if (lower === 'pwd') {
    output = nextCwd;
  } else if (bin === 'welcome') {
    output =
      `OmniTerm v${process.env.OMNITERM_VERSION || '1.0.0'} — real shell engine (${SHELL})\n` +
      `User: ${os.userInfo().username}@${os.hostname()}  |  Platform: ${os.type()} ${os.arch()}\n` +
      `Working directory: ${nextCwd}\n` +
      `Type 'help' for OmniTerm built-ins. Everything else is executed by your real shell.`;
  } else if (lower === 'history') {
    const recentLogs = activityLogs.slice(0, 25).reverse();
    output =
      recentLogs
        .map((l, i) => `  ${(i + 1).toString().padStart(4, ' ')}  ${l.details.replace('Executed: ', '')}`)
        .join('\n') || '  1  welcome\n  2  help';
    syntaxType = 'bash';
  } else if (lower === 'help') {
    output =
      `OmniTerm ${process.env.OMNITERM_VERSION || '1.0.0'} — built-in commands:\n` +
      `  cd <dir>            - Change the session working directory\n` +
      `  pwd                 - Print the session working directory\n` +
      `  clear               - Clear the terminal viewport (Ctrl+L)\n` +
      `  history             - Show commands run in this session\n` +
      `  backup [run]        - Snapshot the current directory to ${BACKUP_DIR}\n` +
      `  ai <prompt>         - Ask your configured AI provider (OMNITERM_AI_* env vars, see README)\n` +
      `  help                - This list\n\n` +
      `Everything else (ls, git, docker, npm, python3, ...) runs in your real shell (${SHELL}) with ` +
      `your real environment. In the Terminal tab every program works, including full-screen ones ` +
      `(vim, top, ssh); this one-shot API runs commands without a TTY.`;
    syntaxType = 'bash';
  } else if (bin === 'ai') {
    const prompt = parts.slice(1).join(' ').trim();
    if (!prompt) {
      output = `[OmniTerm AI] Usage: ${bin} <your question about this system or a command>`;
    } else {
      output = await askCopilot(prompt, nextCwd);
      syntaxType = 'bash';
    }
  } else if (bin === 'backup') {
    const destDir = BACKUP_DIR;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archive = path.join(destDir, `snapshot-${stamp}.tar.gz`);
    try {
      fs.mkdirSync(destDir, { recursive: true });
      const result = spawnSync(
        'tar',
        ['-czf', archive, '--exclude=node_modules', '--exclude=.git', '-C', nextCwd, '.'],
        { timeout: 120_000 }
      );
      if (result.status !== 0) {
        output = `[OmniTerm backup] tar failed: ${(result.stderr || '').toString().trim() || `exit ${result.status}`}`;
        status = 'error';
      } else {
        const sizeMb = fs.statSync(archive).size / 1048576;
        output =
          `[OmniTerm backup] Snapshot of ${nextCwd}\n` +
          `Archive: ${archive}\nSize: ${sizeMb.toFixed(2)} MB\n` +
          `Restore with: tar -xzf "${archive}" -C <target-dir>`;
        syntaxType = 'bash';
      }
    } catch (err: any) {
      output = `[OmniTerm backup] ${err.message}`;
      status = 'error';
    }
  } else if (INTERACTIVE_ONLY.has(bin)) {
    output =
      `[OmniTerm] '${bin}' needs an interactive TTY and is not supported in this terminal pane yet.\n` +
      `Use non-interactive equivalents: ps aux (instead of top), cat/head/tail (instead of less), ` +
      `git --no-pager <cmd>.`;
    status = 'error';
  } else {
    handledByApp = false;
  }

  // ---- Everything else runs for real in the user's shell ----
  if (!handledByApp) {
    const result = await runShellCommand(trimmed, nextCwd);
    output = result.output;
    status = result.status;
    nextCwd = result.cwd;
    exitCode = result.exitCode;
    syntaxType = detectSyntax(trimmed, output);
  }

  // Audit trail: recorded after execution so the real exit code and duration
  // are captured. This file is the basis for the /audit export.
  appendAuditLog({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    username: os.userInfo().username,
    role: 'local',
    action: handledByApp ? 'BUILTIN_EXEC' : 'COMMAND_EXEC',
    details: `${trimmed}  →  exit ${exitCode}  (${Date.now() - startTime}ms, cwd ${nextCwd})`,
    ip: '127.0.0.1',
    severity: status === 'success' ? 'info' : 'error',
    cwd: nextCwd,
    exitCode,
    durationMs: Date.now() - startTime,
    command: trimmed,
  });

  res.json({
    output,
    status,
    executionTimeMs: Date.now() - startTime,
    cwd: nextCwd,
    exitCode,
    real: true,
    syntaxType,
  });
});

// 3. AI endpoints — provider-agnostic, see ai-provider.ts
const aiChatHandler = async (req: any, res: any) => {
  const { prompt, mode = 'assistant', contextLogs = '' } = req.body || {};

  const systemInstruction = loadAiConfig().systemPrompt;
  const userPrompt = contextLogs
    ? `Recent terminal context:\n${contextLogs}\n\nRequest: ${prompt}`
    : String(prompt || '');

  try {
    const reply = await aiChat(systemInstruction, userPrompt);
    res.json({ result: reply.text, mode, source: reply.source, latencyMs: reply.latencyMs });
  } catch (err: any) {
    res.status(502).json({ result: `[AI Error] ${err.message || 'provider call failed'}`, mode, source: 'error' });
  }
};

app.post('/api/ai/copilot', aiChatHandler);
// Neutral alias: /api/ai/copilot predates the provider switch.
app.post('/api/ai/chat', aiChatHandler);

// The AI Settings tab: read the current setup, save a new one, prove it works.
app.get('/api/ai/settings', async (_req, res) => {
  try {
    res.json(await aiSettingsForUi());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
    if (body.provider !== undefined) patch.provider = body.provider;
    if (body.baseUrl !== undefined) patch.baseUrl = String(body.baseUrl);
    if (body.model !== undefined) patch.model = String(body.model);
    if (body.apiKey !== undefined) patch.apiKey = String(body.apiKey);
    if (body.temperature !== undefined) patch.temperature = Number(body.temperature);
    if (body.maxTokens !== undefined) patch.maxTokens = Number(body.maxTokens);
    if (body.systemPrompt !== undefined) patch.systemPrompt = String(body.systemPrompt);
    saveAiConfig(patch as any);
    res.json(await aiSettingsForUi());
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Test the provider. With useForm: true the values currently typed in the AI
 * Settings form are tested without saving them (a blank key falls back to the
 * saved one), so the user can check a setup before committing to it.
 */
app.post('/api/ai/test', async (req, res) => {
  const body = req.body || {};
  const override = body.useForm
    ? normaliseConfig({
        enabled: true,
        provider: body.provider,
        baseUrl: body.baseUrl,
        model: body.model,
        apiKey: body.apiKey ? String(body.apiKey) : loadAiConfig().apiKey,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        systemPrompt: loadAiConfig().systemPrompt,
      })
    : undefined;
  res.json(await aiTest(body.prompt, override));
});

app.get('/api/ai/models', async (_req, res) => {
  res.json(await aiListModels());
});

// 4. File Manager Endpoints (real filesystem)
app.get('/api/files', (req, res) => {
  try {
    const dir = String(req.query.path || req.query.dir || DEFAULT_CWD);
    res.json(listDirectory(dir));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/files/read', (req, res) => {
  try {
    const target = path.resolve(String(req.query.path || ''));
    const st = fs.statSync(target);
    if (st.isDirectory()) return res.status(400).json({ error: 'Path is a directory.' });
    if (st.size > MAX_READ_BYTES) {
      return res.json({
        path: target,
        content: `[OmniTerm] File is ${(st.size / 1048576).toFixed(1)} MB — too large to edit here.\nUse the terminal: less "${target}"`,
        size: st.size,
        language: languageOf(target),
        truncated: true,
        readOnly: true,
      });
    }
    const buf = fs.readFileSync(target);
    const binary = buf.subarray(0, 8000).includes(0);
    return res.json({
      path: target,
      content: binary
        ? `[OmniTerm] Binary file (${(st.size / 1024).toFixed(1)} KB). Open it with the right tool from the terminal.`
        : buf.toString('utf8'),
      size: st.size,
      language: languageOf(target),
      owner: String(st.uid),
      permissions: permissionsString(st.mode),
      modified: new Date(st.mtimeMs).toISOString().replace('T', ' ').slice(0, 16),
      truncated: false,
      readOnly: binary,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/files/save', (req, res) => {
  const { path: rawPath, content } = req.body || {};

  if (!rawPath) return res.status(400).json({ error: 'Missing path.' });

  const target = path.resolve(String(rawPath));
  try {
    const existed = fs.existsSync(target);
    if (!existed) {
      const parent = path.dirname(target);
      if (!fs.existsSync(parent)) return res.status(400).json({ error: `Directory does not exist: ${parent}` });
    }
    // Write via a temp file so a crash cannot leave a half-written config behind.
    const tmp = `${target}.omniterm-${process.pid}.tmp`;
    fs.writeFileSync(tmp, String(content ?? ''), { mode: existed ? fs.statSync(target).mode : 0o644 });
    fs.renameSync(tmp, target);

    appendAuditLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      username: os.userInfo().username,
      role: 'local',
      action: existed ? 'FILE_SAVE' : 'FILE_CREATE',
      details: `${existed ? 'Saved' : 'Created'} ${target}`,
      ip: '127.0.0.1',
      severity: 'info',
    });

    res.json({ success: true, path: target, created: !existed, size: fs.statSync(target).size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. Repo / container / toolchain status (drives the real status bar)
app.get('/api/repo/status', (req, res) => {
  res.json(repoStatus(req.query.path ? String(req.query.path) : undefined));
});

app.get('/api/docker/status', (req, res) => {
  res.json(dockerStatus());
});

app.get('/api/toolchain', (req, res) => {
  res.json(toolchainStatus());
});

app.get('/api/security', (req, res) => {
  res.json(securityPosture());
});

app.get('/api/ai/status', async (_req, res) => {
  const { config, source, privacy, warnings } = await aiEffective();
  res.json({
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    configured: config.provider !== 'none',
    source,
    privacy,
    warnings,
    localAvailable: config.provider === 'ollama' ? true : await ollamaAvailable(),
  });
});


// 7. Interactive terminal sessions & path completion
app.get('/api/terminal/status', (req, res) => {
  const state = ptyStatus();
  res.json({ ...state, sessions: listSessions() });
});

app.get('/api/terminal/sessions', (req, res) => {
  res.json({ sessions: listSessions() });
});

app.post('/api/terminal/kill', (req, res) => {
  const id = String(req.body?.sessionId || '');
  res.json({ success: killSession(id) });
});

/**
 * Path completion for the app's own dialogs (new tab directory, snapshot
 * source, file paths). The shell completes paths inside the terminal; this is
 * for the inputs that are not a shell.
 */
app.get('/api/complete', (req, res) => {
  const raw = String(req.query.path ?? '');
  const expanded = raw.startsWith('~') ? path.join(os.homedir(), raw.slice(1)) : raw;
  const dir = expanded.endsWith('/') ? expanded : path.dirname(expanded || '.');
  const base = expanded.endsWith('/') ? '' : path.basename(expanded);
  const showHidden = base.startsWith('.');
  try {
    const entries = fs
      .readdirSync(dir || '.', { withFileTypes: true })
      .filter((e) => (showHidden || !e.name.startsWith('.')) && e.name.startsWith(base))
      .map((e) => {
        const full = path.join(dir || '.', e.name);
        let isDir = e.isDirectory();
        if (e.isSymbolicLink()) {
          try {
            isDir = fs.statSync(full).isDirectory();
          } catch {
            isDir = false;
          }
        }
        const pretty = full.startsWith(os.homedir()) ? `~${full.slice(os.homedir().length)}` : full;
        return { name: e.name, path: pretty + (isDir ? '/' : ''), type: isDir ? 'directory' : 'file' };
      })
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1))
      .slice(0, 40);
    res.json({ input: raw, directory: dir, matches: entries });
  } catch (err: any) {
    res.json({ input: raw, directory: dir, matches: [], error: err?.message || String(err) });
  }
});

// 6. Activity Logs & Alerts Endpoints
app.get('/api/activity-logs', (req, res) => {
  res.json({ entries: activityLogs, auditFile: AUDIT_FILE, total: activityLogs.length });
});

// Evidence export: the raw JSONL trail, timestamps and exit codes included.
app.get('/api/audit/export', (req, res) => {
  try {
    const rows = loadAuditLog(5000);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="omniterm-audit.jsonl"');
    res.send(rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alerts', (req, res) => {
  res.json(systemAlerts);
});

app.post('/api/alerts/mark-read', (req, res) => {
  systemAlerts.forEach((a) => (a.read = true));
  res.json({ success: true });
});

// 6. Backups — real tar.gz snapshots under the OmniTerm data directory
const BACKUP_DIR = process.env.OMNITERM_BACKUP_DIR || path.join(AUDIT_DIR, 'backups');

function listBackups() {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.tar.gz'))
      .map((name) => {
        const full = path.join(BACKUP_DIR, name);
        const st = fs.statSync(full);
        return {
          id: full,
          name,
          path: full,
          source: 'local tar.gz',
          schedule: 'manual',
          lastRun: new Date(st.mtimeMs).toISOString().replace('T', ' ').slice(0, 16),
          nextRun: null,
          targetCloud: 'local',
          status: 'completed' as const,
          sizeMb: Number((st.size / 1048576).toFixed(2)),
        };
      })
      .sort((a, b) => (a.lastRun < b.lastRun ? 1 : -1));
  } catch {
    return [];
  }
}

app.get('/api/backups', (req, res) => {
  res.json({ dir: BACKUP_DIR, backups: listBackups() });
});

app.post('/api/backups/run', (req, res) => {
  const dir = resolveCwd(req.body?.cwd);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archive = path.join(BACKUP_DIR, `snapshot-${stamp}.tar.gz`);
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
    const result = spawnSync('tar', ['-czf', archive, '--exclude=node_modules', '--exclude=.git', '-C', dir, '.'], { timeout: 300_000 });
    if (result.status !== 0) {
      pushAlert('Backup failed', `tar exited ${result.status} for ${dir}`, 'backup_failed');
      return res.status(500).json({ error: (result.stderr || '').toString().trim() || `tar exited ${result.status}` });
    }
    const sizeMb = Number((fs.statSync(archive).size / 1048576).toFixed(2));
    appendAuditLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      username: os.userInfo().username,
      role: 'developer',
      action: 'BACKUP_RUN',
      details: `Snapshot ${archive} (${sizeMb} MB) of ${dir}`,
      ip: '127.0.0.1',
      severity: 'info',
    });
    res.json({ success: true, path: archive, sizeMb, source: dir, restore: `tar -xzf "${archive}" -C <target-dir>` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});



// 8. API Documentation Endpoint
app.get('/api/api-docs', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'OmniTerm local API',
      version: '2.4.0',
      description: 'The API the OmniTerm desktop app calls on this machine: shell execution, file access, host metrics, snapshots and the AI provider.',
    },
    paths: {
      '/api/health': {
        get: { summary: 'Get real-time server health metrics (CPU, Memory, Disk, Network)', responses: { 200: { description: 'Server metrics object' } } },
      },
      '/api/terminal/execute': {
        post: { summary: 'Run one command in your real shell', responses: { 200: { description: 'Execution result' } } },
      },
      '/api/ai/copilot': {
        post: { summary: 'Ask the configured AI provider (any OpenAI-compatible API, Anthropic, Gemini or a local Ollama)', responses: { 200: { description: 'AI generated response' } } },
      },
      '/api/ai/settings': {
        get: { summary: 'Read the AI provider settings (the API key itself is never returned)', responses: { 200: { description: 'Provider, base URL, model, key presence, presets' } } },
        post: { summary: 'Save AI provider settings', responses: { 200: { description: 'Updated settings' } } },
      },
      '/api/ai/test': {
        post: { summary: 'Send a real request to the provider and report the result', responses: { 200: { description: 'ok, latency, reply or error' } } },
      },
      '/api/ai/models': {
        get: { summary: 'List the models the configured provider offers', responses: { 200: { description: 'Model ids' } } },
      },
      '/api/files': {
        get: { summary: 'List a real directory on this machine', responses: { 200: { description: 'Entries with real size, mode and mtime' } } },
      },
      '/api/backups': {
        get: { summary: 'List the snapshots really on disk', responses: { 200: { description: 'Snapshot archives with size and path' } } },
      },
    },
  });
});

// Unknown API route: answer as an API. Without this the SPA fallback below (or
// vite in dev) returns index.html with a 200, so a typo in a client request
// looks like a successful call.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown API route: ${req.method} ${req.originalUrl}` });
});

// ------------------- VITE SETUP & SERVER BINDING ------------------- //
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Dev only: vite is a devDependency, so it is imported lazily to keep the
    // packaged production server free of any vite requirement.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // The bundled server lives next to the built frontend (dist/server.cjs +
    // dist/index.html + dist/assets), so resolve statics from __dirname rather
    // than the process cwd — the desktop shell runs us from the user data dir.
    const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
      ? __dirname
      : path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  process.on('exit', () => killAllSessions());
  process.on('SIGINT', () => { killAllSessions(); process.exit(0); });
  process.on('SIGTERM', () => { killAllSessions(); process.exit(0); });

  // Interactive shell commands land in the same audit trail as one-shot execs.
  onPtyCommand((e) => {
    appendAuditLog({
      id: `pty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: e.at,
      username: os.userInfo().username,
      role: 'developer',
      action: 'SHELL_COMMAND',
      details: `${e.command}  →  exit ${e.exitCode ?? '?'}  (cwd ${e.cwd})`,
      ip: '127.0.0.1',
      severity: e.exitCode === 0 ? 'info' : 'error',
      cwd: e.cwd,
      exitCode: e.exitCode,
      command: e.command,
    } as any);
  });

  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`[OmniTerm] Local API ready on http://${HOST}:${PORT} (shell: ${SHELL})`);
    if (APP_TOKEN_GENERATED) {
      console.log(`[OmniTerm] No OMNITERM_TOKEN was set, so one was generated for this run: ${APP_TOKEN}`);
      console.log('[OmniTerm] Send it as the x-omniterm-token header; the API rejects requests without it.');
    }
    console.log(`[OmniTerm] Working directory: ${DEFAULT_CWD}`);
  });

  attachTerminalSocket(httpServer, { token: APP_TOKEN });
  const ptyState = ptyStatus();
  console.log(
    ptyState.available
      ? '[OmniTerm] Terminal backend: node-pty ready (real interactive shell)'
      : `[OmniTerm] Terminal backend: node-pty UNAVAILABLE — ${ptyState.error}`
  );
}

startServer();
