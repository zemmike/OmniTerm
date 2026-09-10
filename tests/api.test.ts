/**
 * Integration tests for the OmniTerm HTTP API.
 *
 * These tests boot the real bundled server (`node dist/server.cjs`) on a free
 * port with a fixed token and temp HOME/data dirs (see tests/helpers/server.ts),
 * then hit it over HTTP and assert on the real status codes and response bodies.
 * Nothing here mocks the server.
 */
import { existsSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  postJson,
  serverBuilt,
  startServer,
  TOKEN,
  TOKEN_HEADER,
  type TestServer,
} from './helpers/server';

// The suite is skipped (with an explicit reason) when the build artifact is
// absent — global setup already tried to build it once.
describe.skipIf(!serverBuilt)(
  serverBuilt
    ? 'OmniTerm HTTP API (live server)'
    : 'OmniTerm HTTP API — SKIPPED: dist/server.cjs not built (run `npm run build:server`)',
  () => {
    let srv: TestServer;
    let fixtureDir: string;
    const ALPHA = 'hello-content\n';
    const BETA = 'beta-log-line\n';

    beforeAll(async () => {
      srv = await startServer();

      // Real fixtures on disk that the API should report verbatim.
      fixtureDir = path.join(srv.workDir, 'fixtures');
      mkdirSync(path.join(fixtureDir, 'alps'), { recursive: true });
      writeFileSync(path.join(fixtureDir, 'alpha.txt'), ALPHA);
      writeFileSync(path.join(fixtureDir, 'beta.log'), BETA);
      writeFileSync(path.join(fixtureDir, 'gamma.json'), '{"k":1}\n');
    });

    afterAll(async () => {
      await srv?.stop();
    });

    // ---------------------------------------------------------------- auth --
    describe('auth guard', () => {
      it('GET /api/health without a token -> 401 with an error body', async () => {
        const res = await api(srv, '/api/health', { token: null });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toMatchObject({ error: expect.any(String) });
        expect(body.error).toMatch(/unauthorized/i);
      });

      it('GET /api/health with a wrong token -> 401', async () => {
        const res = await api(srv, '/api/health', { token: 'definitely-wrong' });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toEqual(expect.any(String));
      });

      it('GET /api/health with the right token -> 200 + real metrics', async () => {
        const res = await api(srv, '/api/health');
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(typeof body.cpuUsage).toBe('number');
        expect(body.cpuUsage).toBeGreaterThanOrEqual(0);
        expect(body.cpuUsage).toBeLessThanOrEqual(100);

        expect(body.memoryUsage).toMatchObject({
          usedMb: expect.any(Number),
          totalMb: expect.any(Number),
          freeMb: expect.any(Number),
          percent: expect.any(Number),
        });
        expect(body.memoryUsage.totalMb).toBeGreaterThan(0);

        expect(body.diskUsage).toBeDefined();
        expect(typeof body.uptimeSeconds).toBe('number');
        expect(body.uptimeSeconds).toBeGreaterThan(0);
      });
    });

    // ----------------------------------------------------------------- env --
    describe('GET /api/env', () => {
      it('returns real platform/home/cwd/user strings and honours the temp HOME', async () => {
        const res = await api(srv, '/api/env');
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(typeof body.platform).toBe('string');
        expect(body.platform.length).toBeGreaterThan(0);
        expect(typeof body.home).toBe('string');
        expect(typeof body.cwd).toBe('string');
        expect(typeof body.user).toBe('string');
        expect(body.user.length).toBeGreaterThan(0);

        // Hermeticity: the server must see the temp HOME, not the real one.
        expect(body.home).toBe(srv.homeDir);
        expect(body.cwd).toBe(srv.homeDir);
      });
    });

    // --------------------------------------------------------------- files --
    describe('GET /api/files', () => {
      it('lists the real entries of a directory with type and size', async () => {
        const res = await api(srv, `/api/files?path=${encodeURIComponent(fixtureDir)}`);
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.path).toBe(fixtureDir);
        expect(Array.isArray(body.entries)).toBe(true);

        const names = body.entries.map((e: any) => e.name).sort();
        expect(names).toEqual(['alpha.txt', 'alps', 'beta.log', 'gamma.json']);

        const alpha = body.entries.find((e: any) => e.name === 'alpha.txt');
        expect(alpha).toMatchObject({
          type: 'file',
          size: Buffer.byteLength(ALPHA),
          path: path.join(fixtureDir, 'alpha.txt'),
          language: 'text',
        });

        const alps = body.entries.find((e: any) => e.name === 'alps');
        expect(alps.type).toBe('directory');

        expect(body.entries.find((e: any) => e.name === 'beta.log').size).toBe(
          Buffer.byteLength(BETA),
        );
      });

      it('returns 400 for a directory that does not exist', async () => {
        const res = await api(srv, '/api/files?path=/no/such/dir-omniterm-test');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toEqual(expect.any(String));
      });
    });

    describe('GET /api/files/read', () => {
      it('returns the exact content of a fixture file', async () => {
        const res = await api(
          srv,
          `/api/files/read?path=${encodeURIComponent(path.join(fixtureDir, 'alpha.txt'))}`,
        );
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.content).toBe(ALPHA);
        expect(body.size).toBe(Buffer.byteLength(ALPHA));
        expect(body.language).toBe('text');
        expect(body.truncated).toBe(false);
        expect(body.path).toBe(path.join(fixtureDir, 'alpha.txt'));
      });

      it('returns 400 when the path is a directory', async () => {
        const res = await api(srv, `/api/files/read?path=${encodeURIComponent(fixtureDir)}`);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toEqual(expect.any(String));
      });
    });

    // ------------------------------------------------------------ complete --
    describe('GET /api/complete', () => {
      it('returns matches for an existing path prefix', async () => {
        const partial = path.join(fixtureDir, 'al');
        const res = await api(srv, `/api/complete?path=${encodeURIComponent(partial)}`);
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.directory).toBe(fixtureDir);
        expect(Array.isArray(body.matches)).toBe(true);

        const byName = new Map<string, any>(body.matches.map((m: any) => [m.name, m]));
        expect([...byName.keys()].sort()).toEqual(['alpha.txt', 'alps']);

        expect(byName.get('alpha.txt')).toMatchObject({ type: 'file' });
        const dir = byName.get('alps');
        expect(dir.type).toBe('directory');
        expect(dir.path.endsWith('/')).toBe(true);
      });
    });

    // ------------------------------------------------------- repo / docker --
    describe('GET /api/repo/status and /api/docker/status', () => {
      it('repo status returns the documented keys and does not throw', async () => {
        const res = await api(srv, `/api/repo/status?path=${encodeURIComponent(fixtureDir)}`);
        expect(res.status).toBe(200);
        const body = await res.json();

        for (const key of [
          'isRepo',
          'cwd',
          'branch',
          'changed',
          'untracked',
          'ahead',
          'behind',
          'toplevel',
          'lastCommit',
        ]) {
          expect(body).toHaveProperty(key);
        }
        expect(typeof body.isRepo).toBe('boolean');
        expect(typeof body.changed).toBe('number');
        expect(typeof body.untracked).toBe('number');
        expect(body.cwd).toBe(fixtureDir);
      });

      it('docker status returns the documented keys and does not throw', async () => {
        const res = await api(srv, '/api/docker/status');
        expect(res.status).toBe(200);
        const body = await res.json();

        for (const key of ['available', 'serverVersion', 'running', 'total', 'containers']) {
          expect(body).toHaveProperty(key);
        }
        expect(typeof body.available).toBe('boolean');
        expect(Array.isArray(body.containers)).toBe(true);
        expect(typeof body.running).toBe('number');
        expect(typeof body.total).toBe('number');
      });
    });

    // ------------------------------------------------------------- execute --
    describe('POST /api/terminal/execute', () => {
      it('runs `echo integration-test` and returns its output + exit code 0', async () => {
        const res = await postJson(srv, '/api/terminal/execute', {
          command: 'echo integration-test',
        });
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.output).toContain('integration-test');
        expect(body.exitCode).toBe(0);
        expect(body.status).toBe('success');
        expect(body.real).toBe(true);
        expect(typeof body.executionTimeMs).toBe('number');
      });

      it('reports a non-zero exit code for a failing command', async () => {
        const res = await postJson(srv, '/api/terminal/execute', { command: 'exit 3' });
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.exitCode).not.toBe(0);
        expect(typeof body.exitCode).toBe('number');
        expect(body.status).toBe('error');
      });

      it('handles an empty command exactly as the server does (no-op, no exitCode)', async () => {
        const res = await postJson(srv, '/api/terminal/execute', { command: '   ' });
        expect(res.status).toBe(200);
        const body = await res.json();

        // Real behaviour: the handler short-circuits and returns success with an
        // empty output and NO exitCode / real / syntaxType fields.
        expect(body.output).toBe('');
        expect(body.status).toBe('success');
        expect(body.executionTimeMs).toBe(0);
        expect(body.exitCode).toBeUndefined();
      });
    });

    // -------------------------------------------------------- activity log --
    describe('GET /api/activity-logs', () => {
      it('returns { entries, auditFile, total } and records the executed command', async () => {
        const marker = 'echo integration-test-logs';
        const exec = await postJson(srv, '/api/terminal/execute', { command: marker });
        expect(exec.status).toBe(200);

        const res = await api(srv, '/api/activity-logs');
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(Array.isArray(body.entries)).toBe(true);
        expect(typeof body.auditFile).toBe('string');
        expect(typeof body.total).toBe('number');
        expect(body.total).toBe(body.entries.length);

        // The audit trail lives inside the temp data dir, never the real home.
        expect(body.auditFile).toBe(srv.auditFile);
        expect(body.auditFile.startsWith(srv.dataDir)).toBe(true);

        const entry = body.entries.find((e: any) => e.command === marker);
        expect(entry).toBeDefined();
        expect(entry.exitCode).toBe(0);
        expect(entry.action).toBe('COMMAND_EXEC');

        // The JSONL file itself is really on disk.
        expect(existsSync(body.auditFile)).toBe(true);
        expect(readFileSync(body.auditFile, 'utf8')).toContain(marker);
      });
    });

    // ------------------------------------------------------------ backups --
    describe('backups', () => {
      it('GET /api/backups lists an array (under the `backups` key)', async () => {
        const res = await api(srv, '/api/backups');
        expect(res.status).toBe(200);
        const body = await res.json();

        // NOTE: the real response is an object { dir, backups }, not a bare array.
        expect(typeof body.dir).toBe('string');
        expect(body.dir.startsWith(srv.dataDir)).toBe(true);
        expect(Array.isArray(body.backups)).toBe(true);
      });

      it('POST /api/backups/run creates a real, non-empty archive on disk', async () => {
        const res = await postJson(srv, '/api/backups/run', { cwd: fixtureDir });
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.success).toBe(true);
        expect(typeof body.path).toBe('string');
        expect(body.source).toBe(fixtureDir);

        // A real tar.gz exists on disk and is non-empty.
        expect(existsSync(body.path)).toBe(true);
        const st = statSync(body.path);
        expect(st.size).toBeGreaterThan(0);
        expect(body.path.startsWith(srv.dataDir)).toBe(true);

        // It shows up in the listing ...
        const list = await (await api(srv, '/api/backups')).json();
        expect(list.backups.some((b: any) => b.path === body.path)).toBe(true);

        // ... and gets cleaned up.
        rmSync(body.path);
        expect(existsSync(body.path)).toBe(false);
      });
    });

    // ---------------------------------------------------------- ai settings --
    describe('GET /api/ai/settings', () => {
      it('never returns an apiKey, and reports hasKey + a presets array', async () => {
        const res = await api(srv, '/api/ai/settings');
        expect(res.status).toBe(200);
        const raw = await res.text();
        const body = JSON.parse(raw);

        // The secret itself is never serialised anywhere in the payload.
        expect(raw).not.toContain('apiKey');
        expect(body.saved.apiKey).toBeUndefined();

        expect(typeof body.saved.hasKey).toBe('boolean');
        expect(Array.isArray(body.presets)).toBe(true);
        expect(body.presets.length).toBeGreaterThan(0);
        expect(body.presets[0]).toHaveProperty('id');
        expect(body.presets[0]).toHaveProperty('provider');
      });
    });

    // -------------------------------------------------------- unknown route --
    describe('unknown /api routes', () => {
      it('an unknown POST /api route -> 404', async () => {
        const res = await postJson(srv, '/api/definitely-not-a-route', {});
        expect(res.status).toBe(404);
      });

      // Regression guard: this used to return the SPA's HTML with a 200, which
      // made a typo in a client request look like a successful call. Unknown API
      // routes must answer as an API.
      it('an unknown GET /api route -> 404 JSON, never the SPA HTML', async () => {
        const res = await api(srv, '/api/definitely-not-a-route');
        expect(res.status).toBe(404);
        expect(res.headers.get('content-type')).toMatch(/application\/json/);
        const body = await res.json();
        expect(body.error).toMatch(/Unknown API route/i);
      });

      it('a non-API path still serves the SPA shell', async () => {
        const res = await api(srv, '/some/client/route');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toMatch(/text\/html/);
        expect(await res.text()).toMatch(/<!doctype html>/i);
      });
    });

    // ------------------------------------------------------------ authz/any --
    it('accepts the token via ?token= query as well as the header', async () => {
      const res = await fetch(`${srv.baseUrl}/api/env?token=${TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.headers.get(TOKEN_HEADER)).toBeNull(); // not echoed back
    });
  },
);
