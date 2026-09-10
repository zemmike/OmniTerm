/**
 * Vitest global setup: make sure the bundled server exists before the API
 * tests run. `dist/server.cjs` is the real artifact the tests exercise — if it
 * is missing we build it once (`npm run build:server`). If the build fails the
 * tests are skipped by the suite guard in api.test.ts, not silently passed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..');
const SERVER_ENTRY = path.join(REPO_ROOT, 'dist', 'server.cjs');

export default function globalSetup(): void {
  if (existsSync(SERVER_ENTRY)) {
    console.log(`[omniterm-tests] using prebuilt server: ${SERVER_ENTRY}`);
    return;
  }

  console.log('[omniterm-tests] dist/server.cjs missing — running `npm run build:server` once...');
  const result = spawnSync('npm', ['run', 'build:server'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    timeout: 300_000,
  });

  if (result.status !== 0 || !existsSync(SERVER_ENTRY)) {
    console.warn(
      '[omniterm-tests] could not build dist/server.cjs — the HTTP API tests will be skipped. ' +
        'Run `npm run build:server` manually and re-run vitest.',
    );
  }
}
