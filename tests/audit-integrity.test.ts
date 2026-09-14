/**
 * Audit-log integrity (hash chaining).
 *
 * The audit trail is the app's evidence of what ran, so the interesting cases
 * are the adversarial ones: an edited entry, a deleted entry, an appended
 * forgery, and the rotation seam where activity.jsonl becomes activity.jsonl.1.
 * Each tamper case asserts *which* entry was caught and *why*, not merely that
 * the status is 'tampered' — a verifier that fails everything is as useless as
 * one that accepts everything.
 *
 * Hermetic: every fixture is written into a fresh temp directory, and the child
 * processes are given a temp HOME and OMNITERM_DATA_DIR. The real
 * ~/.local/share/omniterm/activity.jsonl is never read or written.
 *
 * The chains are built with the same primitives the server uses (audit-chain.ts),
 * and the end-to-end block proves the real bundled server produces a trail that
 * verifies. The CLI is exercised as `node dist/audit-verify.cjs` when the
 * artifact exists (the API suites already build dist/server.cjs the same way);
 * if it cannot be built the CLI block skips with an explicit reason.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeEntryHash, loadAuditChainTail, type AuditEntryLike } from '../audit-chain';
import { verifyAuditLog } from '../audit-verify';
import { api, postJson, serverBuilt, startServer, type TestServer } from './helpers/server';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'dist', 'audit-verify.cjs');

/* ------------------------------------------------------------------ fixtures */

const tempRoots: string[] = [];

/** A fresh temp root per fixture; nothing here ever touches the real data dir. */
function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'omniterm-audit-'));
  tempRoots.push(root);
  return root;
}

interface Fixture {
  root: string;
  file: string;
  rotated: string;
}

function fixture(): Fixture {
  const root = tempRoot();
  const file = path.join(root, 'activity.jsonl');
  return { root, file, rotated: `${file}.1` };
}

/**
 * Entries chained exactly the way the server chains them: seq counts up, prevHash
 * is the previous entry's hash ("" for the first), and hash covers the entry's
 * canonical form plus both of those.
 */
function chained(
  count: number,
  opts: { start?: number; seed?: string; onto?: string } = {},
): AuditEntryLike[] {
  const start = opts.start ?? 1;
  const seed = opts.seed ?? 'entry';
  const out: AuditEntryLike[] = [];
  let prevHash = opts.onto ?? '';
  for (let i = 0; i < count; i++) {
    const seq = start + i;
    const entry: AuditEntryLike = {
      id: `${seed}-${seq}`,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
      username: 'tester',
      role: 'local',
      action: 'COMMAND_EXEC',
      details: `${seed} number ${seq}  →  exit 0  (10ms, cwd /tmp)`,
      ip: '127.0.0.1',
      severity: 'info',
      cwd: '/tmp',
      exitCode: 0,
      durationMs: 10,
      command: `echo ${seed}-${seq}`,
      seq,
      prevHash,
    };
    entry.hash = computeEntryHash(entry);
    prevHash = String(entry.hash);
    out.push(entry);
  }
  return out;
}

/** A v1.8.x-style entry: exactly the fields that version wrote, no chain markers. */
function legacyEntry(seq: number): AuditEntryLike {
  return {
    id: `log-legacy-${seq}`,
    timestamp: new Date(Date.UTC(2025, 0, 1, 0, 0, seq)).toISOString(),
    username: 'tester',
    role: 'local',
    action: 'COMMAND_EXEC',
    details: `legacy echo ${seq}  →  exit 0  (5ms, cwd /tmp)`,
    ip: '127.0.0.1',
    severity: 'info',
    cwd: '/tmp',
    exitCode: 0,
    durationMs: 5,
    command: `echo legacy-${seq}`,
  };
}

function writeJsonl(file: string, entries: AuditEntryLike[]): void {
  writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

/** Edit one line in place and fail loudly if the fixture did not actually change. */
function editLine(file: string, lineIndex: number, edit: (line: string) => string): void {
  const lines = readFileSync(file, 'utf8').split('\n');
  const before = lines[lineIndex];
  const after = edit(before);
  expect(after, `fixture edit at line ${lineIndex + 1} did not change the file`).not.toBe(before);
  lines[lineIndex] = after;
  writeFileSync(file, lines.join('\n'));
}

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------- verification */

describe('audit hash chain — verifying a single trail', () => {
  it('an intact chain verifies: intact, every entry chained, nothing flagged', () => {
    const { file } = fixture();
    writeJsonl(file, chained(5));

    const result = verifyAuditLog(file);
    expect(result.status).toBe('intact');
    expect(result.entries).toBe(5);
    expect(result.chainedEntries).toBe(5);
    expect(result.legacyEntries).toBe(0);
    expect(result.firstBadIndex).toBeNull();
    expect(result.firstSeq).toBe(1);
    expect(result.lastSeq).toBe(5);
    expect(result.lastHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.reason).toMatch(/^intact:/);
  });

  it('one changed byte inside a middle entry is caught, and names that entry', () => {
    const { file } = fixture();
    writeJsonl(file, chained(5));

    // Entry at index 2 (line 3): change one word of `details`, leaving seq,
    // prevHash and the recorded hash exactly as the writer left them.
    editLine(file, 2, (line) => line.replace('entry number 3', 'entry numBer 3'));

    const result = verifyAuditLog(file);
    expect(result.status).toBe('tampered');
    expect(result.firstBadIndex).toBe(2);
    expect(result.firstBadLine).toBe(3);
    expect(result.firstBadFile).toBe(file);
    expect(result.reason).toMatch(/hash mismatch/);
    expect(result.reason).toMatch(/content was changed/);
  });

  it('a deleted entry is caught as a sequence gap at the entry that took its place', () => {
    const { file } = fixture();
    const entries = chained(5);
    // Drop the entry with seq 2; what used to be seq 3 now sits at index 1.
    writeJsonl(
      file,
      entries.filter((e) => e.seq !== 2),
    );

    const result = verifyAuditLog(file);
    expect(result.status).toBe('tampered');
    expect(result.firstBadIndex).toBe(1);
    expect(result.entries).toBe(4);
    expect(result.reason).toMatch(/sequence gap/);
    expect(result.reason).toMatch(/expected seq 2, found 3/);
  });

  it('an appended hand-written entry with no hash is caught at that entry', () => {
    const { file } = fixture();
    const entries = chained(5);
    writeJsonl(file, entries);
    // A forged line with the right seq/prevHash would still need the hash the
    // writer alone can produce; this one does not even try.
    const forged: AuditEntryLike = {
      ...legacyEntry(99),
      id: 'forged-6',
      details: 'rm -rf /  →  exit 0',
      seq: 6,
      prevHash: entries[4].hash,
    };
    writeFileSync(file, readFileSync(file, 'utf8') + JSON.stringify(forged) + '\n');

    const result = verifyAuditLog(file);
    expect(result.status).toBe('tampered');
    expect(result.firstBadIndex).toBe(5);
    expect(result.firstBadLine).toBe(6);
    expect(result.reason).toMatch(/hash is missing or malformed/);
  });

  it('an appended entry that fakes a hash is caught as a hash mismatch', () => {
    const { file } = fixture();
    const entries = chained(5);
    writeJsonl(file, entries);
    const forged: AuditEntryLike = {
      ...legacyEntry(99),
      id: 'forged-6',
      details: 'rm -rf /  →  exit 0',
      seq: 6,
      prevHash: entries[4].hash,
      hash: 'f'.repeat(64), // well-formed, but not this entry's hash
    };
    writeFileSync(file, readFileSync(file, 'utf8') + JSON.stringify(forged) + '\n');

    const result = verifyAuditLog(file);
    expect(result.status).toBe('tampered');
    expect(result.firstBadIndex).toBe(5);
    expect(result.reason).toMatch(/hash mismatch/);
  });

  it('an unhashed v1.8.x log reports legacy — it is old data, never corruption', () => {
    const { file } = fixture();
    writeJsonl(file, [legacyEntry(1), legacyEntry(2), legacyEntry(3)]);

    const result = verifyAuditLog(file);
    expect(result.status).toBe('legacy');
    expect(result.entries).toBe(3);
    expect(result.legacyEntries).toBe(3);
    expect(result.chainedEntries).toBe(0);
    expect(result.firstBadIndex).toBeNull();
    expect(result.reason).toMatch(/^legacy:/);
    expect(result.reason).toMatch(/chain starts at seq 4/);
    expect(result.reason).not.toMatch(/tamper|corrupt|fail/i);
  });

  it('a legacy prelude followed by a chain verifies as intact', () => {
    const { file } = fixture();
    // Three v1.8.x entries, then the chain the next version wrote: it starts at
    // seq 4 with prevHash "" because there is nothing to chain onto.
    writeJsonl(file, [legacyEntry(1), legacyEntry(2), legacyEntry(3), ...chained(2, { start: 4 })]);

    const result = verifyAuditLog(file);
    expect(result.status).toBe('intact');
    expect(result.entries).toBe(5);
    expect(result.legacyEntries).toBe(3);
    expect(result.chainedEntries).toBe(2);
    expect(result.firstSeq).toBe(4);
    expect(result.reason).toMatch(/legacy/);
    expect(result.firstBadIndex).toBeNull();
  });

  it('a missing or empty log is empty, not an error', () => {
    const { file, root } = fixture();
    const missing = verifyAuditLog(path.join(root, 'nothing-here.jsonl'));
    expect(missing.status).toBe('empty');
    expect(missing.entries).toBe(0);
    expect(missing.firstBadIndex).toBeNull();

    writeFileSync(file, '\n');
    const blank = verifyAuditLog(file);
    expect(blank.status).toBe('empty');
    expect(blank.entries).toBe(0);
  });

  it('a line that is not JSON at all is reported as a bad entry', () => {
    const { file } = fixture();
    writeJsonl(file, chained(2));
    writeFileSync(file, readFileSync(file, 'utf8') + 'half-written-lin\n');

    const result = verifyAuditLog(file);
    expect(result.status).toBe('tampered');
    expect(result.firstBadIndex).toBe(2);
    expect(result.reason).toMatch(/not a JSON object/);
  });
});

/* ------------------------------------------------------- rotation continuity */

describe('audit hash chain — across the 8 MB rotation', () => {
  /** activity.jsonl.1 holds seq 1..3, the live file continues at seq 4..5. */
  function rotatedFixture(): Fixture & {
    rotatedEntries: AuditEntryLike[];
    liveEntries: AuditEntryLike[];
  } {
    const fx = fixture();
    const rotatedEntries = chained(3);
    const liveEntries = chained(2, { start: 4, onto: String(rotatedEntries[2].hash) });
    // Sanity: the live chain really continues from the rotated one.
    expect(liveEntries[0].prevHash).toBe(rotatedEntries[2].hash);
    writeJsonl(fx.rotated, rotatedEntries);
    writeJsonl(fx.file, liveEntries);
    return { ...fx, rotatedEntries, liveEntries };
  }

  it('verifies the rotated file then the live file as one continuous chain', () => {
    const fx = rotatedFixture();

    const result = verifyAuditLog(fx.file);
    expect(result.status).toBe('intact');
    expect(result.entries).toBe(5);
    expect(result.chainedEntries).toBe(5);
    expect(result.files).toEqual([fx.rotated, fx.file]);
    expect(result.firstSeq).toBe(1);
    expect(result.lastSeq).toBe(5);
    expect(result.seam).toBeNull();
    expect(result.reason).toContain(fx.rotated);
  });

  it('verifies a single file as a prefix of the chain (seam reported, not failed)', () => {
    const fx = rotatedFixture();

    const live = verifyAuditLog(fx.file, { mode: 'prefix' });
    expect(live.status).toBe('intact');
    expect(live.entries).toBe(2);
    expect(live.firstSeq).toBe(4);
    expect(live.seam).toEqual({ seq: 4, prevHash: fx.rotatedEntries[2].hash });
    expect(live.reason).toMatch(/prefix of a longer chain/);

    // The rotated file on its own is a prefix too (it starts at seq 1 here, so it
    // is complete as far as it goes).
    const older = verifyAuditLog(fx.rotated, { mode: 'prefix' });
    expect(older.status).toBe('intact');
    expect(older.firstSeq).toBe(1);
    expect(older.lastSeq).toBe(3);
    expect(older.firstBadIndex).toBeNull();
  });

  it('an edit in the rotated file is caught, and is attributed to that file', () => {
    const fx = rotatedFixture();
    editLine(fx.rotated, 1, (line) => line.replace('entry number 2', 'entry number 9'));

    const result = verifyAuditLog(fx.file);
    expect(result.status).toBe('tampered');
    expect(result.firstBadIndex).toBe(1);
    expect(result.firstBadFile).toBe(fx.rotated);
    expect(result.firstBadLine).toBe(2);
    expect(result.reason).toMatch(/hash mismatch/);
  });

  it('a break across the rotation boundary is caught in the live file', () => {
    const fx = rotatedFixture();
    // Splice: the live file claims a predecessor hash that the rotated file does
    // not end with. Detecting this is the whole point of reading both files.
    editLine(fx.file, 0, (line) =>
      line.replace(`"prevHash":"${fx.rotatedEntries[2].hash}"`, `"prevHash":"${'a'.repeat(64)}"`),
    );

    const result = verifyAuditLog(fx.file);
    expect(result.status).toBe('tampered');
    expect(result.firstBadIndex).toBe(3);
    expect(result.firstBadFile).toBe(fx.file);
    expect(result.reason).toMatch(/prevHash mismatch/);
  });

  it('deleting the last entry of the rotated file is caught at the first live entry', () => {
    const fx = rotatedFixture();
    writeJsonl(fx.rotated, fx.rotatedEntries.slice(0, 2)); // seq 1..2, seq 3 gone

    const result = verifyAuditLog(fx.file);
    expect(result.status).toBe('tampered');
    expect(result.firstBadIndex).toBe(2);
    expect(result.firstBadFile).toBe(fx.file);
    expect(result.reason).toMatch(/sequence gap/);
    expect(result.reason).toMatch(/expected seq 3, found 4/);
  });
});

/* ------------------------------------------------------------------- the CLI */

const cliArgs = (file: string, extra: string[] = []) => [CLI_ENTRY, file, ...extra];

/**
 * Build dist/audit-verify.cjs if it is missing or older than its sources, with
 * the same command the package script uses. `npm run build` (vite) empties
 * dist/, and a stale artifact would test yesterday's verifier, so both cases
 * rebuild; if the build fails the CLI block skips with a reason instead of
 * silently passing.
 */
function ensureCli(): boolean {
  const sources = ['audit-verify.ts', 'audit-chain.ts'].map((f) => path.join(REPO_ROOT, f));
  const fresh =
    existsSync(CLI_ENTRY) &&
    sources.every((src) => statSync(src).mtimeMs <= statSync(CLI_ENTRY).mtimeMs);
  if (fresh) return true;
  try {
    mkdirSync(path.join(REPO_ROOT, 'dist'), { recursive: true });
    const result = spawnSync(
      path.join(REPO_ROOT, 'node_modules', '.bin', 'esbuild'),
      [
        'audit-verify.ts',
        '--bundle',
        '--platform=node',
        '--format=cjs',
        '--packages=external',
        '--outfile=dist/audit-verify.cjs',
      ],
      { cwd: REPO_ROOT, timeout: 60_000 },
    );
    return result.status === 0 && existsSync(CLI_ENTRY);
  } catch {
    return false;
  }
}

const cliBuilt = ensureCli();

describe.skipIf(!cliBuilt)(
  cliBuilt
    ? 'audit-verify CLI (node dist/audit-verify.cjs)'
    : 'audit-verify CLI — SKIPPED: dist/audit-verify.cjs not built',
  () => {
    it('verifies the data dir log by default and exits 0', () => {
      const { root } = fixture();
      const dataDir = path.join(root, 'data');
      mkdirSync(dataDir, { recursive: true });
      writeJsonl(path.join(dataDir, 'activity.jsonl'), chained(3));

      const result = spawnSync(process.execPath, [CLI_ENTRY], {
        env: { ...process.env, HOME: root, OMNITERM_DATA_DIR: dataDir },
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/status\s+: INTACT/);
      expect(result.stdout).toMatch(/seq 1\.\.3/);
    });

    it('reports legacy without an error exit code', () => {
      const { root } = fixture();
      const file = path.join(root, 'legacy.jsonl');
      writeJsonl(file, [legacyEntry(1), legacyEntry(2)]);

      const result = spawnSync(process.execPath, cliArgs(file), { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/LEGACY/);
      expect(result.stdout).toMatch(/chain starts at seq 3/);
    });

    it('exits 2 and prints the offending index for a tampered log', () => {
      const { file } = fixture();
      writeJsonl(file, chained(4));
      editLine(file, 2, (line) => line.replace('entry number 3', 'entry number 7'));

      const human = spawnSync(process.execPath, cliArgs(file), { encoding: 'utf8' });
      expect(human.status).toBe(2);
      expect(human.stdout).toMatch(/TAMPERED/);
      expect(human.stdout).toMatch(/first bad : entry #2/);

      const json = spawnSync(process.execPath, cliArgs(file, ['--json']), { encoding: 'utf8' });
      expect(json.status).toBe(2);
      const parsed = JSON.parse(json.stdout) as ReturnType<typeof verifyAuditLog>;
      expect(parsed.status).toBe('tampered');
      expect(parsed.firstBadIndex).toBe(2);
      expect(parsed.reason).toMatch(/hash mismatch/);
    });
  },
);

/* --------------------------------------------------------- where a chain ends */

describe('chain tail — what the next entry must build on', () => {
  it('is genesis for a missing or empty log', () => {
    const { file, root } = fixture();
    expect(loadAuditChainTail(file)).toEqual({ seq: 0, hash: '' });
    writeFileSync(file, '');
    expect(loadAuditChainTail(file)).toEqual({ seq: 0, hash: '' });
    expect(loadAuditChainTail(path.join(root, 'nope.jsonl'))).toEqual({ seq: 0, hash: '' });
  });

  it('counts a legacy prelude so the first chained entry is seq N + 1', () => {
    const { file } = fixture();
    writeJsonl(file, [legacyEntry(1), legacyEntry(2), legacyEntry(3)]);
    expect(loadAuditChainTail(file)).toEqual({ seq: 3, hash: '' });
  });

  it('continues from the last sealed entry', () => {
    const { file } = fixture();
    const entries = chained(4);
    writeJsonl(file, entries);
    expect(loadAuditChainTail(file)).toEqual({ seq: 4, hash: entries[3].hash });
  });

  it('reads the tail from the rotated file when the live file is still empty', () => {
    // The state right after a rotation and a restart: activity.jsonl.1 holds the
    // chain, the new live file has not been written to yet. Starting from genesis
    // here would break the chain across the rotation boundary.
    const { file, rotated } = fixture();
    const entries = chained(3);
    writeJsonl(rotated, entries);
    writeFileSync(file, '');
    expect(loadAuditChainTail(file)).toEqual({ seq: 3, hash: entries[2].hash });

    const legacy = [legacyEntry(1), legacyEntry(2)];
    writeJsonl(rotated, legacy); // rotated while still a v1.8.x log
    expect(loadAuditChainTail(file)).toEqual({ seq: 2, hash: '' });
  });
});

/* ------------------------------------------------- the real writer and routes */

describe.skipIf(!serverBuilt)(
  serverBuilt
    ? 'the real server writes a verifiable chain'
    : 'the real server writes a verifiable chain — SKIPPED: dist/server.cjs not built',
  () => {
    let srv: TestServer;

    beforeAll(async () => {
      srv = await startServer();
    });

    afterAll(async () => {
      await srv?.stop();
    });

    it('the trail the server writes verifies, keeps real exit codes, and stays 0600', async () => {
      for (const command of ['echo chain-check-a', 'echo chain-check-b', 'exit 3']) {
        const res = await postJson(srv, '/api/terminal/execute', { command });
        expect(res.status).toBe(200);
      }

      const result = verifyAuditLog(srv.auditFile);
      expect(result.status).toBe('intact');
      expect(result.entries).toBeGreaterThanOrEqual(3);
      expect(result.chainedEntries).toBe(result.entries);
      expect(result.firstBadIndex).toBeNull();
      expect(result.firstSeq).toBe(1);
      expect(result.lastSeq).toBe(result.entries);

      // Every line carries a chain, and the recorded content is the real content.
      const rows = readFileSync(srv.auditFile, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as AuditEntryLike);
      for (const [i, row] of rows.entries()) {
        expect(row.seq).toBe(i + 1);
        expect(row.prevHash).toBe(i === 0 ? '' : rows[i - 1].hash);
        expect(row.hash).toBe(computeEntryHash(row));
      }
      const failed = rows.find((row) => row.command === 'exit 3');
      expect(failed?.exitCode).toBe(3); // auditing still records reality

      // The audit file is still owner-only.
      expect(statSync(srv.auditFile).mode & 0o777).toBe(0o600);

      // The API surfaces the chained entries too, hashes included.
      const logs = (await (await api(srv, '/api/activity-logs')).json()) as {
        entries: AuditEntryLike[];
        total: number;
      };
      expect(logs.total).toBe(logs.entries.length);
      expect(String(logs.entries[0].hash)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('a hand-edited line in the server own trail is detected', async () => {
      await postJson(srv, '/api/terminal/execute', { command: 'echo tamper-me' });
      const rows = readFileSync(srv.auditFile, 'utf8').trim().split('\n');
      // The second command of the first test, so this is never the seam entry —
      // a seam cannot be checked without the file before it.
      const victim = rows.findIndex((line) => line.includes('echo chain-check-b'));
      expect(victim).toBeGreaterThan(0);

      rows[victim] = rows[victim].replace('echo chain-check-b', 'echo chain-check-X');
      writeFileSync(srv.auditFile, rows.join('\n') + '\n');

      const result = verifyAuditLog(srv.auditFile);
      expect(result.status).toBe('tampered');
      expect(result.firstBadIndex).toBe(victim);
      expect(result.reason).toMatch(/hash mismatch/);
    });

    it('export still streams the trail, chain fields included', async () => {
      await postJson(srv, '/api/terminal/execute', { command: 'echo export-check' });
      const res = await api(srv, '/api/audit/export');
      expect(res.status).toBe(200);

      const rows = (await res.text())
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AuditEntryLike);
      expect(rows.length).toBeGreaterThan(0);
      const exported = rows.find((row) => row.command === 'echo export-check');
      expect(exported).toBeDefined();
      expect(String(exported?.hash)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('a pre-existing v1.8.x log still loads, still exports, and new entries chain onto it', async () => {
      // Boot a second server over a data dir that already holds a v1.8.x trail,
      // written before hashing existed. Nothing about it may be rewritten or
      // called corrupt; the next command must chain onto it instead.
      const root = tempRoot();
      const dataDir = path.join(root, 'data');
      mkdirSync(dataDir, { recursive: true });
      const legacyFile = path.join(dataDir, 'activity.jsonl');
      writeJsonl(legacyFile, [legacyEntry(1), legacyEntry(2), legacyEntry(3)]);
      const original = readFileSync(legacyFile, 'utf8');

      const legacyServer = await startServer({ OMNITERM_DATA_DIR: dataDir });
      try {
        // It verifies as legacy, not as damage.
        expect(verifyAuditLog(legacyFile).status).toBe('legacy');

        // It still shows up in the log tab...
        const logs = (await (await api(legacyServer, '/api/activity-logs')).json()) as {
          entries: AuditEntryLike[];
          auditFile: string;
        };
        expect(logs.auditFile).toBe(legacyFile);
        expect(logs.entries.some((e) => e.id === 'log-legacy-1')).toBe(true);

        // ...and it still exports verbatim.
        const exported = await (await api(legacyServer, '/api/audit/export')).text();
        expect(exported).toContain('legacy echo 1');

        // A new command chains onto the legacy prelude: seq 4, prevHash "".
        const exec = await postJson(legacyServer, '/api/terminal/execute', {
          command: 'echo after-legacy',
        });
        expect(exec.status).toBe(200);

        const after = verifyAuditLog(legacyFile);
        expect(after.status).toBe('intact');
        expect(after.entries).toBe(4);
        expect(after.legacyEntries).toBe(3);
        expect(after.chainedEntries).toBe(1);
        expect(after.firstSeq).toBe(4);
        expect(after.firstBadIndex).toBeNull();

        const rows = readFileSync(legacyFile, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as AuditEntryLike);
        expect(rows[3].seq).toBe(4);
        expect(rows[3].prevHash).toBe('');
        expect(rows[3].command).toBe('echo after-legacy');

        // The three old lines are byte-for-byte what v1.8.x wrote.
        expect(readFileSync(legacyFile, 'utf8').startsWith(original)).toBe(true);
      } finally {
        await legacyServer.stop();
      }
    });

    it('DELETE /api/audit-log still clears the trail and records it as a fresh chain', async () => {
      await postJson(srv, '/api/terminal/execute', { command: 'echo before-the-wipe' });
      expect(readFileSync(srv.auditFile, 'utf8')).toContain('before-the-wipe');

      const res = await api(srv, '/api/audit-log', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { removed: number };
      expect(body.removed).toBeGreaterThan(0);

      const after = readFileSync(srv.auditFile, 'utf8');
      expect(after).not.toContain('before-the-wipe');
      expect(after).toContain('AUDIT_CLEARED');

      // The surviving record is the deletion itself, and it starts a new chain:
      // verification must not accuse the user of tampering for deleting their own
      // data through the API.
      const rows = after
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as AuditEntryLike);
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('AUDIT_CLEARED');
      expect(rows[0].seq).toBe(1);
      expect(rows[0].prevHash).toBe('');

      const result = verifyAuditLog(srv.auditFile);
      expect(result.status).toBe('intact');
      expect(result.entries).toBe(1);
      expect(result.firstBadIndex).toBeNull();

      const logs = (await (await api(srv, '/api/activity-logs')).json()) as {
        entries: AuditEntryLike[];
      };
      expect(logs.entries).toHaveLength(1);
      expect(logs.entries[0].action).toBe('AUDIT_CLEARED');
    });
  },
);
