import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  herdrConfigPath,
  readHerdrThemeKeys,
  setHerdrThemeKeys,
  type HerdrThemeKeys,
} from './herdrConfig';

/**
 * Herdr integration, phase 1: matching Herdr's own interface to the OmniTerm theme.
 *
 * Everything here goes through the installed `herdr` binary with an argument array - never a
 * shell string - and every call is bounded by a timeout and an output cap. The only file it
 * writes is Herdr's config, only the three theme keys inside it, and only after keeping one
 * backup.
 */
const TIMEOUT_MS = 8000;
const MAX_OUTPUT = 512 * 1024;
const BACKUP_SUFFIX = '.omniterm-backup';

export interface HerdrStatus {
  installed: boolean;
  binary: string | null;
  version: string | null;
  protocol: number | null;
  serverRunning: boolean;
  compatible: boolean;
  configPath: string;
  configExists: boolean;
  theme: Partial<HerdrThemeKeys>;
  backupPath: string;
  backupExists: boolean;
}

export interface HerdrWriteResult {
  ok: boolean;
  error?: string;
  configPath: string;
  backupPath: string;
  wrote?: HerdrThemeKeys;
  /** True when a failed validation was undone by restoring the backup. */
  rolledBack?: boolean;
  validated?: boolean;
  reloaded?: boolean;
  note?: string;
}

export function backupPathFor(configPath: string): string {
  return `${configPath}${BACKUP_SUFFIX}`;
}

/**
 * Locate the Herdr executable without a shell.
 *
 * PATH first, then the two places a per-user install lands. The binary is executed by
 * absolute path so a modified PATH cannot redirect it mid-session.
 */
export function findHerdrBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const exe = process.platform === 'win32' ? 'herdr.exe' : 'herdr';
  const dirs = [
    ...(env.PATH || '').split(path.delimiter).filter(Boolean),
    path.join(os.homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
  ];
  for (const dir of dirs) {
    const candidate = path.join(dir, exe);
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) continue;
      if (process.platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* not here; keep looking */
    }
  }
  return null;
}

function runHerdr(
  binary: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, windowsHide: true },
      (error: (Error & { code?: number }) | null, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') });
      },
    );
  });
}

/**
 * The config file Herdr actually reads.
 *
 * `herdr status --json` reports its own socket, and the config sits beside it. Asking Herdr
 * is better than assuming the documented rule: if the two ever disagree, this writes the file
 * Herdr reads instead of a second file at the path we guessed.
 */
export async function resolveHerdrConfigPath(binary: string | null): Promise<string> {
  const fallback = herdrConfigPath();
  if (!binary) return fallback;
  const status = await runHerdr(binary, ['status', '--json']);
  if (status.code !== 0) return fallback;
  try {
    const socket = (JSON.parse(status.stdout) as { server?: { socket?: string } })?.server?.socket;
    if (!socket) return fallback;
    return path.join(path.dirname(socket), 'config.toml');
  } catch {
    return fallback;
  }
}

function readConfig(configPath: string): string {
  try {
    return fs.readFileSync(configPath, 'utf8');
  } catch {
    return '';
  }
}

/** Capability probe and current state, in one call the UI can render directly. */
export async function readHerdrStatus(): Promise<HerdrStatus> {
  const binary = findHerdrBinary();
  const configPath = await resolveHerdrConfigPath(binary);
  const backupPath = backupPathFor(configPath);
  const configText = readConfig(configPath);
  const base: HerdrStatus = {
    installed: Boolean(binary),
    binary,
    version: null,
    protocol: null,
    serverRunning: false,
    compatible: false,
    configPath,
    configExists: fs.existsSync(configPath),
    theme: readHerdrThemeKeys(configText),
    backupPath,
    backupExists: fs.existsSync(backupPath),
  };
  if (!binary) return base;

  // `herdr status --json` reports version, protocol and compatibility as data, which is
  // exactly what "which Herdr am I talking to?" needs to answer.
  const status = await runHerdr(binary, ['status', '--json']);
  if (status.code !== 0) {
    // Installed but not answering: report what we know rather than inventing a version.
    return base;
  }
  try {
    const parsed = JSON.parse(status.stdout) as {
      client?: { version?: string; protocol?: number };
      server?: {
        status?: string;
        running?: boolean;
        protocol?: number;
        compatible?: boolean;
        endpoint_compatible?: boolean;
      };
    };
    return {
      ...base,
      version: parsed.client?.version || null,
      protocol: parsed.server?.protocol ?? parsed.client?.protocol ?? null,
      serverRunning: Boolean(parsed.server?.running) || parsed.server?.status === 'running',
      compatible: Boolean(parsed.server?.compatible && parsed.server?.endpoint_compatible),
    };
  } catch {
    return { ...base, version: null };
  }
}

/**
 * Write the theme keys, keeping one backup and undoing the change if Herdr rejects it.
 *
 * The order matters: back up, write, let Herdr validate the file, and only then reload. A
 * config Herdr refuses is a config the user did not ask for, so it is rolled back rather
 * than left for them to discover.
 */
export async function applyHerdrTheme(keys: HerdrThemeKeys): Promise<HerdrWriteResult> {
  const binary = findHerdrBinary();
  const configPath = await resolveHerdrConfigPath(binary);
  const backupPath = backupPathFor(configPath);
  if (!binary) {
    return {
      ok: false,
      error: 'Herdr is not installed, so there is no config to match.',
      configPath,
      backupPath,
    };
  }

  const before = readConfig(configPath);
  const after = setHerdrThemeKeys(before, keys);

  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    if (!fs.existsSync(backupPath)) {
      // One backup, taken once, before the first change. Later runs must not overwrite it:
      // it is the way back to the file the user actually wrote.
      fs.writeFileSync(backupPath, before, { mode: 0o600 });
    }
    fs.writeFileSync(configPath, after, { mode: 0o600 });
  } catch (error) {
    return {
      ok: false,
      error: `Could not write ${configPath}: ${String((error as Error).message || error)}`,
      configPath,
      backupPath,
    };
  }

  const check = await runHerdr(binary, ['config', 'check']);
  if (check.code !== 0) {
    let rolledBack = false;
    try {
      fs.writeFileSync(configPath, before, { mode: 0o600 });
      rolledBack = true;
    } catch {
      rolledBack = false;
    }
    return {
      ok: false,
      error: (check.stderr || check.stdout || 'Herdr rejected the config.').trim().slice(0, 500),
      configPath,
      backupPath,
      rolledBack,
    };
  }

  const status = await readHerdrStatus();
  if (!status.serverRunning) {
    return {
      ok: true,
      configPath,
      backupPath,
      wrote: keys,
      validated: true,
      reloaded: false,
      note: 'Herdr is not running, so the change applies the next time it starts.',
    };
  }

  const reload = await runHerdr(binary, ['server', 'reload-config']);
  return {
    ok: true,
    configPath,
    backupPath,
    wrote: keys,
    validated: true,
    reloaded: reload.code === 0,
    note:
      reload.code === 0
        ? 'Herdr reloaded its config.'
        : `Herdr could not reload: ${(reload.stderr || reload.stdout).trim().slice(0, 300)}`,
  };
}

/** Put back the file that was there before the first change. */
export async function revertHerdrTheme(): Promise<HerdrWriteResult> {
  const binary = findHerdrBinary();
  const configPath = await resolveHerdrConfigPath(binary);
  const backupPath = backupPathFor(configPath);
  if (!fs.existsSync(backupPath)) {
    return {
      ok: false,
      error: 'There is no OmniTerm backup of your Herdr config to restore.',
      configPath,
      backupPath,
    };
  }
  try {
    const original = fs.readFileSync(backupPath, 'utf8');
    // An empty backup means there was no config before OmniTerm wrote one, so restoring it
    // means removing the file, not leaving an empty one behind.
    if (!original) fs.rmSync(configPath, { force: true });
    else fs.writeFileSync(configPath, original, { mode: 0o600 });
  } catch (error) {
    return {
      ok: false,
      error: `Could not restore ${configPath}: ${String((error as Error).message || error)}`,
      configPath,
      backupPath,
    };
  }
  if (!binary) {
    return {
      ok: true,
      configPath,
      backupPath,
      validated: false,
      reloaded: false,
      note: 'Restored. Herdr is not installed on this machine any more.',
    };
  }
  await runHerdr(binary, ['config', 'check']);
  const status = await readHerdrStatus();
  const reload = status.serverRunning
    ? await runHerdr(binary, ['server', 'reload-config'])
    : { code: 1 };
  return {
    ok: true,
    configPath,
    backupPath,
    validated: true,
    reloaded: reload.code === 0,
    note:
      reload.code === 0
        ? 'Your previous Herdr config is back and reloaded.'
        : 'Your previous Herdr config is back; it applies when Herdr next starts.',
  };
}

export interface HerdrReaderText {
  ok: boolean;
  text?: string;
  paneId?: string;
  error?: string;
}

/**
 * The focused Herdr pane's own output, for the AI Reader.
 *
 * With Herdr running, the OmniTerm pane shows Herdr's whole UI: sidebar, borders and
 * split panes side by side, so parsing that screen mixes an agent's answer with
 * everything around it. Herdr can hand over one pane's text directly, with soft-wrapped
 * rows rejoined (`recent-unwrapped`, see docs/herdr/findings.md).
 */
export async function readFocusedHerdrPane(lines = 400): Promise<HerdrReaderText> {
  const binary = findHerdrBinary();
  if (!binary) return { ok: false, error: 'not-installed' };
  const snapshot = await runHerdr(binary, ['api', 'snapshot']);
  if (snapshot.code !== 0) return { ok: false, error: 'not-running' };
  let paneId = '';
  try {
    const parsed = JSON.parse(snapshot.stdout);
    paneId = String(parsed?.result?.snapshot?.focused_pane_id || '');
  } catch {
    return { ok: false, error: 'bad-snapshot' };
  }
  // Pane IDs look like `w1:p2`; anything else never reaches the command line.
  if (!/^[\w-]+:[\w-]+$/.test(paneId)) return { ok: false, error: 'no-focused-pane' };
  const count = String(Math.max(1, Math.min(2000, Math.floor(lines))));
  const read = await runHerdr(binary, [
    'pane',
    'read',
    paneId,
    '--lines',
    count,
    '--source',
    'recent-unwrapped',
    '--format',
    'text',
  ]);
  if (read.code !== 0) return { ok: false, error: 'read-failed', paneId };
  return { ok: true, text: read.stdout, paneId };
}
