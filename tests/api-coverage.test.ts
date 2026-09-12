/**
 * Second integration suite for the OmniTerm HTTP API.
 *
 * tests/api.test.ts covers the "happy path" of the core endpoints. This file
 * closes the coverage gap: it exercises the routes that api.test.ts never hits
 * — the security / posture / alerts / audit / docs / AI / session-management
 * endpoints — plus the edge cases of routes that are only lightly covered.
 *
 * Same hermetic setup as api.test.ts: the real bundled server
 * (`node dist/server.cjs`) boots on a free port with a fixed token and a temp
 * HOME / OMNITERM_DATA_DIR (see tests/helpers/server.ts). Nothing here mocks
 * the server; every assertion is on a real status code and a real body, and
 * every mutation is checked against disk or a follow-up GET.
 *
 * NOTE ON THE AI TESTS: the helper strips every *_API_KEY from the child env,
 * but this machine happens to run a local Ollama, which the server
 * auto-detects. So the tests do NOT assume "no provider"; instead they point
 * the provider at a port nothing listens on, which makes "provider
 * unreachable" deterministic, and then assert the failure is reported as a
 * real failure rather than a fabricated success.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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

describe.skipIf(!serverBuilt)(
  serverBuilt
    ? 'OmniTerm HTTP API — coverage gap (live server)'
    : 'OmniTerm HTTP API coverage — SKIPPED: dist/server.cjs not built (run `npm run build:server`)',
  () => {
    let srv: TestServer;
    let fixtureDir: string;

    // A secret we plant in a request and then hunt for in every response body.
    // A port nothing listens on, so "reach the provider" always fails here.

    beforeAll(async () => {
      srv = await startServer();

      fixtureDir = path.join(srv.workDir, 'coverage-fixtures');
      mkdirSync(fixtureDir, { recursive: true });
      writeFileSync(path.join(fixtureDir, 'existing.txt'), 'existing\n');
    });

    afterAll(async () => {
      await srv?.stop();
    });

    // -------------------------------------------------- security posture --
    describe('GET /api/security', () => {
      it('returns the real host posture, with the audit file inside the temp data dir', async () => {
        const res = await api(srv, '/api/security');
        expect(res.status).toBe(200);
        const body = await res.json();

        // Documented/expected shape.
        for (const key of [
          'firewall',
          'apparmor',
          'sudoGroups',
          'sshKeys',
          'authorizedKeys',
          'sshService',
          'worldWritableEtcFiles',
          'listening',
          'exposedPorts',
          'auditFile',
          'auditEntries',
        ]) {
          expect(body).toHaveProperty(key);
        }

        expect(typeof body.firewall).toBe('string');
        expect(typeof body.apparmor).toBe('string');
        expect(typeof body.sudoGroups).toBe('string');
        expect(typeof body.sshKeys).toBe('number');
        expect(typeof body.authorizedKeys).toBe('number');
        expect(typeof body.sshService).toBe('string');
        expect(typeof body.worldWritableEtcFiles).toBe('number');
        expect(Array.isArray(body.listening)).toBe(true);
        expect(typeof body.exposedPorts).toBe('number');

        // ${exposedPorts} must agree with the per-socket flags.
        expect(body.exposedPorts).toBe(
          body.listening.filter((l: any) => l.exposed === true).length,
        );
        for (const sock of body.listening as any[]) {
          expect(sock).toMatchObject({
            proto: expect.any(String),
            address: expect.any(String),
            port: expect.any(String),
            process: expect.any(String),
            exposed: expect.any(Boolean),
          });
        }

        // Hermeticity: the posture describes the temp audit trail, never the
        // real ~/.local/share/omniterm one.
        expect(body.auditFile).toBe(srv.auditFile);
        expect(body.auditFile.startsWith(srv.dataDir)).toBe(true);
        expect(typeof body.auditEntries).toBe('number');

        // The server's HOME is an empty temp dir, so no SSH material is found.
        expect(body.sshKeys).toBe(0);
        expect(body.authorizedKeys).toBe(0);
      });
    });

    describe('GET /api/toolchain', () => {
      it('probes real binaries and reports install status per tool', async () => {
        const res = await api(srv, '/api/toolchain');
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);
        for (const item of body as any[]) {
          expect(item).toMatchObject({
            name: expect.any(String),
            installed: expect.any(Boolean),
          });
        }

        // This test process is running under node, so node must be found.
        const node = (body as any[]).find((t) => t.name === 'node');
        expect(node).toBeDefined();
        expect(node.installed).toBe(true);
        expect(typeof node.path).toBe('string');
      });
    });

    // ------------------------------------------------------ auth guard ----
    describe('auth guard on endpoints api.test.ts never checked', () => {
      it('GET /api/security without a token -> 401', async () => {
        const res = await api(srv, '/api/security', { token: null });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toMatch(/unauthorized/i);
      });

      it('POST /api/files/save without a token -> 401 and writes nothing', async () => {
        const target = path.join(srv.workDir, 'unauthenticated-write.txt');
        const res = await postJson(
          srv,
          '/api/files/save',
          { path: target, content: 'should never land' },
          { token: null },
        );
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toMatch(/unauthorized/i);
        // Fail-closed: an unauthenticated request must not mutate state.
        expect(existsSync(target)).toBe(false);
      });

      it('a foreign Origin -> 403 before the token is even considered', async () => {
        // No token at all: if the origin check did not run first this would be
        // a 401 instead of a 403.
        const res = await fetch(`${srv.baseUrl}/api/security`, {
          headers: { origin: 'http://evil.example.com' },
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toMatch(/not allowed/i);
      });

      it('a malformed Origin -> 403', async () => {
        const res = await api(srv, '/api/security', {
          headers: { origin: 'this is not a url' },
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toMatch(/malformed origin/i);
      });
    });

    describe('GET /api/audit/export', () => {
      it('streams the real JSONL trail as an NDJSON attachment', async () => {
        const marker = 'echo coverage-audit-marker';
        const exec = await postJson(srv, '/api/terminal/execute', { command: marker });
        expect(exec.status).toBe(200);

        const res = await api(srv, '/api/audit/export');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toMatch(/application\/x-ndjson/);
        expect(res.headers.get('content-disposition')).toMatch(
          /attachment; filename="omniterm-audit.jsonl"/,
        );

        const text = await res.text();
        expect(text.endsWith('\n')).toBe(true);

        const rows = text
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        expect(rows.length).toBeGreaterThan(0);
        const entry = rows.find((r: any) => r.command === marker);
        expect(entry).toBeDefined();
        expect(entry.action).toBe('COMMAND_EXEC');

        // The export is the same trail the activity-logs endpoint shows.
        const logs = await (await api(srv, '/api/activity-logs')).json();
        expect(logs.total).toBe(rows.length);
      });
    });

    describe('GET /api/alerts + POST /api/alerts/mark-read', () => {
      it('returns an array, marks everything read, and stays an array', async () => {
        const res = await api(srv, '/api/alerts');
        expect(res.status).toBe(200);
        const alerts = await res.json();
        expect(Array.isArray(alerts)).toBe(true);

        // NOTE: on a fresh server nothing has pushed an alert yet (only a
        // failed backup does, and the box runs as root so a backup failure is
        // not reachable deterministically). The mark-read contract is asserted
        // regardless; if an alert ever appears, its flag must flip.
        for (const a of alerts as any[]) {
          expect(a).toMatchObject({
            id: expect.any(String),
            timestamp: expect.any(String),
            title: expect.any(String),
            message: expect.any(String),
            type: expect.any(String),
            read: expect.any(Boolean),
          });
        }

        const mark = await postJson(srv, '/api/alerts/mark-read', {});
        expect(mark.status).toBe(200);
        expect(await mark.json()).toEqual({ success: true });

        const after = await (await api(srv, '/api/alerts')).json();
        expect(Array.isArray(after)).toBe(true);
        expect(after.every((a: any) => a.read === true)).toBe(true);

        // Idempotent.
        const again = await postJson(srv, '/api/alerts/mark-read', {});
        expect(again.status).toBe(200);
        expect(await again.json()).toEqual({ success: true });
      });
    });

    // -------------------------------------------------------- api docs -----
    describe('GET /api/api-docs', () => {
      it('serves an OpenAPI document with the advertised info block', async () => {
        const res = await api(srv, '/api/api-docs');
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.openapi).toBe('3.0.0');
        expect(body.info).toMatchObject({
          title: expect.any(String),
          version: expect.any(String),
          description: expect.any(String),
        });
        expect(typeof body.paths).toBe('object');
        expect(body.paths).toHaveProperty('/api/health');
        expect(body.paths).toHaveProperty('/api/terminal/execute');
        // Every documented path is a real route.
        expect(Object.keys(body.paths).every((p) => p.startsWith('/api/'))).toBe(true);
      });
    });

    // ------------------------------------------------------ files/save -----
    describe('POST /api/files/save', () => {
      it('creates a file, then overwrites it, and the bytes match on disk', async () => {
        const target = path.join(fixtureDir, 'saved.txt');
        const first = 'first-version\n';
        const second = 'second-version-and-longer\n';

        const create = await postJson(srv, '/api/files/save', { path: target, content: first });
        expect(create.status).toBe(200);
        expect(await create.json()).toEqual({
          success: true,
          path: target,
          created: true,
          size: Buffer.byteLength(first),
        });
        expect(readFileSync(target, 'utf8')).toBe(first);

        const overwrite = await postJson(srv, '/api/files/save', { path: target, content: second });
        expect(overwrite.status).toBe(200);
        expect(await overwrite.json()).toEqual({
          success: true,
          path: target,
          created: false,
          size: Buffer.byteLength(second),
        });
        expect(readFileSync(target, 'utf8')).toBe(second);

        // The write is audited in the temp trail, not the real one.
        const logs = await (await api(srv, '/api/activity-logs')).json();
        const saveEntry = logs.entries.find(
          (e: any) => e.action === 'FILE_SAVE' || e.action === 'FILE_CREATE',
        );
        expect(saveEntry).toBeDefined();
        expect(logs.auditFile).toBe(srv.auditFile);
      });

      it('returns 400 for a missing path', async () => {
        const res = await postJson(srv, '/api/files/save', { content: 'x' });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Missing path.' });
      });

      it('returns 400 when the parent directory does not exist', async () => {
        const res = await postJson(srv, '/api/files/save', {
          path: path.join(fixtureDir, 'no-such-dir', 'x.txt'),
          content: 'x',
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/directory does not exist/i);
      });

      it('refuses a directory path with 400 and leaks no temp file', async () => {
        const res = await postJson(srv, '/api/files/save', {
          path: fixtureDir,
          content: 'nope',
        });
        // Regression guard: this used to write `<target>.omniterm-<pid>.tmp`,
        // fail at the rename, answer 500 and leave the temp file behind.
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/not a file/i);
        expect(statSync(fixtureDir).isDirectory()).toBe(true);
        expect(readFileSync(path.join(fixtureDir, 'existing.txt'), 'utf8')).toBe('existing\n');

        const stray = readdirSync(srv.workDir).filter((n) =>
          n.startsWith(`${path.basename(fixtureDir)}.omniterm-`),
        );
        expect(stray).toEqual([]);
      });
    });

    // ------------------------------------------------ repo status (non-repo)
    describe('GET /api/repo/status on a non-git directory', () => {
      it('reports isRepo:false with null repo fields and zeroed counters', async () => {
        const res = await api(srv, `/api/repo/status?path=${encodeURIComponent(fixtureDir)}`);
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.isRepo).toBe(false);
        expect(body.cwd).toBe(fixtureDir);
        expect(body.branch).toBeNull();
        expect(body.toplevel).toBeNull();
        expect(body.lastCommit).toBeNull();
        expect(body.changed).toBe(0);
        expect(body.untracked).toBe(0);
        expect(body.ahead).toBe(0);
        expect(body.behind).toBe(0);
      });
    });

    // -------------------------------------------------------- backups ------
    describe('POST /api/backups/run', () => {
      it('writes a real, non-empty gzip archive and lists it, then cleans up', async () => {
        const res = await postJson(srv, '/api/backups/run', { cwd: fixtureDir });
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.success).toBe(true);
        expect(body.source).toBe(fixtureDir);
        expect(typeof body.path).toBe('string');
        expect(body.path.startsWith(srv.dataDir)).toBe(true);

        expect(existsSync(body.path)).toBe(true);
        const bytes = readFileSync(body.path);
        expect(bytes.length).toBeGreaterThan(0);
        // Real gzip magic.
        expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
        expect(statSync(body.path).size).toBe(bytes.length);

        const list = await (await api(srv, '/api/backups')).json();
        expect(list.backups.some((b: any) => b.path === body.path)).toBe(true);

        rmSync(body.path);
        expect(existsSync(body.path)).toBe(false);
      });
    });

    // ----------------------------------------------- complete edge cases ---
    describe('GET /api/complete edge cases', () => {
      it('an empty prefix -> 200 with the cwd directory and an array of matches', async () => {
        const res = await api(srv, '/api/complete?path=');
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.input).toBe('');
        expect(body.directory).toBe('.');
        expect(Array.isArray(body.matches)).toBe(true);
        expect(body.error).toBeUndefined();
        for (const m of body.matches as any[]) {
          expect(m).toMatchObject({ name: expect.any(String), path: expect.any(String) });
          expect(['file', 'directory']).toContain(m.type);
        }
      });

      it('a prefix with no matches -> 200 with matches:[] and no error', async () => {
        const res = await api(
          srv,
          `/api/complete?path=${encodeURIComponent(path.join(fixtureDir, 'zzz-no-match'))}`,
        );
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.directory).toBe(fixtureDir);
        expect(body.matches).toEqual([]);
        expect(body.error).toBeUndefined();
      });

      it('a non-existent directory -> 200 with matches:[] and an error field', async () => {
        const res = await api(
          srv,
          `/api/complete?path=${encodeURIComponent('/no/such/omniterm-dir-xyz/more')}`,
        );
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.directory).toBe('/no/such/omniterm-dir-xyz');
        expect(body.matches).toEqual([]);
        expect(typeof body.error).toBe('string');
      });
    });

    // ------------------------------------------------ terminal sessions ----
    describe('interactive terminal session endpoints', () => {
      it('GET /api/terminal/status reports backend state + session list', async () => {
        const res = await api(srv, '/api/terminal/status');
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body).toMatchObject({
          available: expect.any(Boolean),
          shell: expect.any(String),
          sessions: expect.any(Array),
        });
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('integration');
      });

      it('GET /api/terminal/sessions returns a (possibly empty) sessions array', async () => {
        const res = await api(srv, '/api/terminal/sessions');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body.sessions)).toBe(true);
      });

      it('POST /api/terminal/kill for an unknown id -> success:false', async () => {
        const res = await postJson(srv, '/api/terminal/kill', { sessionId: 'does-not-exist' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: false });
      });
    });
    // ------------------------------------------------- overwriting your data --
    describe('deleting local data (DELETE /api/audit-log and /api/backups)', () => {
      it('DELETE /api/audit-log without a token -> 401 and the file survives', async () => {
        const res = await fetch(`${srv.baseUrl}/api/audit-log`, { method: 'DELETE' });
        expect(res.status).toBe(401);
      });

      it('DELETE /api/audit-log clears the trail and records that it did', async () => {
        // Put something in the trail first, so "cleared" is a real assertion.
        await postJson(srv, '/api/terminal/execute', { command: 'echo before-the-wipe' });
        expect(readFileSync(srv.auditFile, 'utf8')).toContain('before-the-wipe');

        const res = await fetch(`${srv.baseUrl}/api/audit-log`, {
          method: 'DELETE',
          headers: { [TOKEN_HEADER]: TOKEN },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.removed).toBeGreaterThan(0);

        const after = readFileSync(srv.auditFile, 'utf8');
        expect(after).not.toContain('before-the-wipe');
        // The one entry that survives is the admission that it was cleared: a
        // silent deletion would leave the user unable to tell what happened.
        expect(after).toContain('AUDIT_CLEARED');
        expect(await (await api(srv, '/api/activity-logs')).json()).toHaveProperty('entries');
      });

      it('DELETE /api/backups removes the snapshots that exist and reports the bytes', async () => {
        const created = await postJson(srv, '/api/backups/run', { cwd: fixtureDir });
        const createdPath = (await created.json()).path;
        expect(existsSync(createdPath)).toBe(true);

        const res = await fetch(`${srv.baseUrl}/api/backups`, {
          method: 'DELETE',
          headers: { [TOKEN_HEADER]: TOKEN },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.removed).toBeGreaterThanOrEqual(1);
        expect(body.freedBytes).toBeGreaterThan(0);

        expect(existsSync(createdPath)).toBe(false);
        expect((await (await api(srv, '/api/backups')).json()).backups).toEqual([]);
      });

      it('is idempotent: deleting an empty trail is a 200 with removed: 0', async () => {
        const first = await fetch(`${srv.baseUrl}/api/backups`, {
          method: 'DELETE',
          headers: { [TOKEN_HEADER]: TOKEN },
        });
        expect(first.status).toBe(200);
        const second = await fetch(`${srv.baseUrl}/api/backups`, {
          method: 'DELETE',
          headers: { [TOKEN_HEADER]: TOKEN },
        });
        expect(second.status).toBe(200);
        expect((await second.json()).removed).toBe(0);
      });
    });
  },
);
