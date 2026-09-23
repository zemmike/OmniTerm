import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Herdr integration: reading the focused Herdr pane for the AI Reader.
 *
 * Everything here goes through the installed `herdr` binary with an argument array - never a
 * shell string - and every call is bounded by a timeout and an output cap. Nothing is written.
 */
const TIMEOUT_MS = 8000;
const MAX_OUTPUT = 512 * 1024;

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
