/**
 * Boots the real, bundled OmniTerm server (`node dist/server.cjs`) as a child
 * process for integration tests.
 *
 * Everything is hermetic by construction:
 *   - a free ephemeral port is allocated per run
 *   - OMNITERM_TOKEN is pinned to a known value
 *   - OMNITERM_DATA_DIR, OMNITERM_BACKUP_DIR and HOME all point inside a fresh
 *     temp root, so the real audit log and backups are never touched
 *   - background/server env vars from the host (OMNITERM_*, OPENAI_API_KEY, ...)
 *     are stripped so the tests cannot depend on this machine's setup
 *
 * The temp root is deleted on stop().
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, '..', '..');
export const SERVER_ENTRY = path.join(REPO_ROOT, 'dist', 'server.cjs');
export const TOKEN = 'test-token';
export const TOKEN_HEADER = 'x-omniterm-token';

/** True when the built server exists; api.test.ts skips cleanly when false. */
export const serverBuilt = existsSync(SERVER_ENTRY);

export interface TestServer {
  /** e.g. http://127.0.0.1:54321 */
  baseUrl: string;
  port: number;
  token: string;
  /** Temp root that holds everything the server writes. */
  root: string;
  /** $OMNITERM_DATA_DIR (audit log and backups live here). */
  dataDir: string;
  /** Temp $HOME. */
  homeDir: string;
  /** Scratch directory for test fixtures. */
  workDir: string;
  /** Path of the persistent command audit trail. */
  auditFile: string;
  proc: ChildProcess;
  logs: () => string;
  stop: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (!address || typeof address === 'string') {
        srv.close(() => reject(new Error('could not allocate a free port')));
        return;
      }
      const { port } = address;
      srv.close(() => resolve(port));
    });
  });
}

function buildChildEnv(input: {
  dataDir: string;
  homeDir: string;
  port: number;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Never leak the host's OmniTerm configuration into the test server.
  for (const key of Object.keys(env)) {
    if (key.startsWith('OMNITERM_')) delete env[key];
  }
  for (const key of [
    'PORT',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GENAI_API_KEY',
    'MISTRAL_API_KEY',
    'GROQ_API_KEY',
    'TOGETHER_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENROUTER_API_KEY',
  ]) {
    delete env[key];
  }

  return {
    ...env,
    NODE_ENV: 'production',
    OMNITERM_HOST: '127.0.0.1',
    OMNITERM_TOKEN: TOKEN,
    OMNITERM_DATA_DIR: input.dataDir,
    PORT: String(input.port),
    HOME: input.homeDir,
    // Deterministic shell: the server runs `$SHELL -lc <command>`.
    SHELL: '/bin/bash',
  };
}

/**
 * Spawn the built server and wait until GET /api/health answers 200.
 * Throws with the captured server output if it never becomes healthy.
 */
export async function startServer(): Promise<TestServer> {
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(
      `Built server not found at ${SERVER_ENTRY}. Run \`npm run build:server\` and re-run the tests.`,
    );
  }

  const root = mkdtempSync(path.join(os.tmpdir(), 'omniterm-test-'));
  const dataDir = path.join(root, 'data');
  const homeDir = path.join(root, 'home');
  const workDir = path.join(root, 'work');

  // The server creates dataDir/homeDir/workDir as needed; create them up front
  // so HOME always resolves to a real directory.
  const { mkdirSync } = await import('node:fs');
  for (const dir of [dataDir, homeDir, workDir]) mkdirSync(dir, { recursive: true });

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const auditFile = path.join(dataDir, 'activity.jsonl');

  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: buildChildEnv({ dataDir, homeDir, port }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  proc.stdout?.on('data', (c: Buffer) => {
    output += c.toString();
  });
  proc.stderr?.on('data', (c: Buffer) => {
    output += c.toString();
  });
  proc.on('error', (err) => {
    output += `\n[spawn error] ${err.message}`;
  });

  const stop = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill('SIGTERM');
      await Promise.race([once(proc, 'exit'), sleep(5000)]);
    }
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill('SIGKILL');
      await Promise.race([once(proc, 'exit'), sleep(2000)]);
    }
    rmSync(root, { recursive: true, force: true });
  };

  const server: TestServer = {
    baseUrl,
    port,
    token: TOKEN,
    root,
    dataDir,
    homeDir,
    workDir,
    auditFile,
    proc,
    logs: () => output,
    stop,
  };

  // ---- wait for /api/health ----
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      await stop();
      throw new Error(`server exited before becoming healthy.\n${output}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: { [TOKEN_HEADER]: TOKEN },
        signal: AbortSignal.timeout(2000),
      });
      if (res.status === 200) return server;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }

  await stop();
  throw new Error(`server did not answer /api/health within 30s.\n${output}`);
}

/** Minimal fetch wrapper that always sends the test token. */
export async function api(
  server: TestServer,
  route: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<Response> {
  const { token = TOKEN, headers, ...rest } = init;
  const merged = new Headers(headers);
  if (token) merged.set(TOKEN_HEADER, token);
  if (rest.body && !merged.has('content-type')) merged.set('content-type', 'application/json');
  return fetch(`${server.baseUrl}${route}`, { ...rest, headers: merged });
}

/** convenience: POST JSON */
export function postJson(
  server: TestServer,
  route: string,
  body: unknown,
  init: RequestInit & { token?: string | null } = {},
): Promise<Response> {
  return api(server, route, { method: 'POST', body: JSON.stringify(body), ...init });
}
