/**
 * Verify the integrity of a hash-chained OmniTerm audit trail.
 *
 * `activity.jsonl` is the evidence of what ran on this machine. Since v1.9.0
 * every new entry carries `seq`, `prevHash` and `hash`, so an edit, a deletion or
 * a hand-written line breaks the chain and is reported here as tampering. Entries
 * written by v1.8.x carry no hashes: they are reported as `legacy` — never as
 * corrupt, and never as missing evidence.
 *
 * The canonical form and the hash formula are documented in audit-chain.ts.
 *
 * Usage (after the bundler has produced the CLI artifact):
 *   node dist/audit-verify.cjs [path/to/activity.jsonl] [--prefix] [--json]
 *   npx omniterm-audit-verify [path] [--prefix] [--json]
 *
 * With no path, $OMNITERM_DATA_DIR/activity.jsonl (or
 * ~/.local/share/omniterm/activity.jsonl) is used, exactly like the server.
 *
 * Exit codes: 0 = intact, legacy or empty; 2 = tampered; 1 = usage error.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  HASH_RE,
  auditChainFiles,
  canonicalSerialisation,
  computeEntryHash,
  hasChainMarkers,
  isHashedEntry,
} from './audit-chain';

export type VerifyStatus = 'intact' | 'tampered' | 'legacy' | 'empty';
export type VerifyMode = 'chain' | 'prefix';

export interface VerifyResult {
  /** intact = chain verifies; tampered = a break was found; legacy = no hashes
   *  anywhere (v1.8.x data, nothing to verify and nothing wrong); empty = no
   *  entries at all. */
  status: VerifyStatus;
  /** Entries read, oldest file first (legacy prelude + chained entries). */
  entries: number;
  /** 0-based index of the first entry that failed, in the verified order
   *  (oldest file first). null when nothing failed. */
  firstBadIndex: number | null;
  /** Human-readable verdict; for a failure it names the check that failed. */
  reason: string;
  /** Mode used: 'chain' (default) or 'prefix'. */
  mode: VerifyMode;
  /** The live log path that was asked about. */
  path: string;
  /** Files actually read, oldest first. */
  files: string[];
  /** Entries before the chain started (no hashes; v1.8.x). */
  legacyEntries: number;
  /** Entries that carry a valid hash and were checked. */
  chainedEntries: number;
  /** seq of the first chained entry (null for legacy/empty). */
  firstSeq: number | null;
  /** seq of the last chained entry (null for legacy/empty). */
  lastSeq: number | null;
  /** hash of the last chained entry: the current head of the chain. */
  lastHash: string | null;
  /** Set when the oldest available entry is the middle of a longer chain, so its
   *  prevHash cannot be checked without the file that came before it. */
  seam: { seq: number; prevHash: string } | null;
  /** Where the first failure is: the file and its 1-based line number. */
  firstBadFile: string | null;
  firstBadLine: number | null;
}

interface Row {
  entry: Record<string, unknown> | null;
  file: string;
  line: number;
}

/** 1-based line numbers, blank lines skipped, unparseable lines kept as null. */
function readRows(file: string): Row[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const rows: Row[] = [];
  text.split('\n').forEach((raw, i) => {
    if (raw.trim() === '') return;
    let parsed: unknown = null;
    try {
      const value: unknown = JSON.parse(raw);
      parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch {
      parsed = null;
    }
    rows.push({ entry: parsed as Record<string, unknown> | null, file, line: i + 1 });
  });
  return rows;
}

function fileHasBytes(file: string): boolean {
  try {
    return fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Verify an audit trail.
 *
 * mode 'chain' (default): the trail is the rotated file `activity.jsonl.1`
 * followed by the live file `activity.jsonl`, when both exist. The chain must be
 * continuous across the rotation boundary, so deleting entries from either file
 * is detected. The very first entry of the oldest file available is a seam: its
 * prevHash can only be checked if an earlier file still exists, so when it is not
 * a genesis entry (seq 1, prevHash "") the result is reported with `seam` set and
 * the chain is verified from there.
 *
 * mode 'prefix': only the given file is read. It is verified as a prefix of a
 * longer chain: the first chained entry's prevHash and seq are taken as given
 * (that is the seam) and everything after it must chain internally. Deleting an
 * entry from the head of such a file therefore cannot be seen — there is no
 * external reference to compare against. Deleting one from the middle or the end
 * still breaks the internal chain.
 */
export function verifyAuditLog(
  auditPath: string,
  options: { mode?: VerifyMode } = {},
): VerifyResult {
  const mode: VerifyMode = options.mode === 'prefix' ? 'prefix' : 'chain';
  const files =
    mode === 'prefix' ? (fileHasBytes(auditPath) ? [auditPath] : []) : auditChainFiles(auditPath);

  const rows: Row[] = [];
  for (const file of files) rows.push(...readRows(file));

  const base = {
    mode,
    path: auditPath,
    files,
    firstBadIndex: null,
    legacyEntries: 0,
    chainedEntries: 0,
    firstSeq: null as number | null,
    lastSeq: null as number | null,
    lastHash: null as string | null,
    seam: null as { seq: number; prevHash: string } | null,
    firstBadFile: null as string | null,
    firstBadLine: null as number | null,
  };

  if (rows.length === 0) {
    return {
      ...base,
      status: 'empty',
      entries: 0,
      reason:
        files.length === 0
          ? `empty: no audit log at ${auditPath} (and no rotated file next to it) — nothing to verify`
          : `empty: ${files.join(', ')} exists but holds no entries — nothing to verify`,
    };
  }

  const fail = (i: number, reason: string): VerifyResult => ({
    ...base,
    status: 'tampered',
    entries: rows.length,
    firstBadIndex: i,
    reason,
    firstBadFile: rows[i].file,
    firstBadLine: rows[i].line,
  });

  let expectSeq = 1;
  let expectHash = '';
  let chained = 0;
  let legacy = 0;
  let firstSeq: number | null = null;
  let seam: { seq: number; prevHash: string } | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const entry = row.entry;
    if (!entry) {
      return fail(
        i,
        `line ${row.line} of ${row.file} is not a JSON object — a truncated write or an edited line`,
      );
    }

    if (!isHashedEntry(entry)) {
      if (hasChainMarkers(entry)) {
        return fail(
          i,
          `entry seq/prevHash/hash is present (line ${row.line} of ${row.file}) but its sha256 hash is missing or malformed: the hash field was removed or corrupted`,
        );
      }
      // A pre-hash-chain (v1.8.x) entry: keep it, count it, never rewrite it. It
      // still occupies a position in the sequence, so the first chained entry
      // after a prelude of L entries must carry seq L + 1.
      legacy++;
      expectSeq++;
      continue;
    }

    const seq = positiveInt(entry.seq);
    if (seq === null) {
      return fail(
        i,
        `line ${row.line} of ${row.file} has a hash but no usable seq (expected ${expectSeq})`,
      );
    }
    const prevHash = entry.prevHash;
    if (typeof prevHash !== 'string' || (prevHash !== '' && !HASH_RE.test(prevHash))) {
      return fail(
        i,
        `line ${row.line} of ${row.file} has a malformed prevHash (expected a sha256 hex string)`,
      );
    }

    if (i === 0) {
      // The oldest entry we have. Genesis is checkable; a mid-chain entry is a
      // seam we cannot close without the file that preceded it.
      if (!(seq === 1 && prevHash === '')) seam = { seq, prevHash };
    } else if (seq !== expectSeq) {
      return fail(
        i,
        `sequence gap at line ${row.line} of ${row.file}: expected seq ${expectSeq}, found ${seq} — an entry before it was removed`,
      );
    } else if (prevHash !== expectHash) {
      return fail(
        i,
        `prevHash mismatch at line ${row.line} of ${row.file}: entry claims prevHash ${prevHash.slice(0, 12)}…, the previous entry hashes to ${expectHash.slice(0, 12)}… — the chain was rewritten or spliced`,
      );
    }

    const recomputed = computeEntryHash(entry);
    if (recomputed !== entry.hash) {
      return fail(
        i,
        `hash mismatch at line ${row.line} of ${row.file}: the entry hashes to ${recomputed.slice(0, 12)}… but records ${String(entry.hash).slice(0, 12)}… — its content was changed after it was written`,
      );
    }

    if (chained === 0) firstSeq = seq;
    chained++;
    expectSeq = seq + 1;
    expectHash = String(entry.hash);
  }

  if (chained === 0) {
    const next = legacy + 1;
    return {
      ...base,
      status: 'legacy',
      entries: rows.length,
      legacyEntries: legacy,
      reason:
        `legacy: ${legacy} ${legacy === 1 ? 'entry' : 'entries'} written before hash chaining ` +
        `(no hashes present, so there is nothing to verify and nothing is wrong). ` +
        `Legacy entries occupy seq 1..${legacy}; the chain starts at seq ${next}, ` +
        `the seq the next entry written will carry.`,
    };
  }

  const scope =
    files.length > 1 ? `${files.join(' then ')}` : files.length === 1 ? files[0] : auditPath;
  const prelude = legacy > 0 ? ` after ${legacy} legacy (pre-hash-chain) entries` : '';
  const seamNote = seam
    ? ` — verified as a prefix of a longer chain: the oldest available entry is seq ${seam.seq} and its prevHash ` +
      `(${seam.prevHash.slice(0, 12)}…) cannot be checked without the earlier file`
    : '';
  return {
    ...base,
    status: 'intact',
    entries: rows.length,
    legacyEntries: legacy,
    chainedEntries: chained,
    firstSeq,
    lastSeq: expectSeq - 1,
    lastHash: expectHash,
    seam,
    reason:
      `intact: ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} in ${scope}${prelude}; ` +
      `chain verified seq ${firstSeq}..${expectSeq - 1}, head ${expectHash.slice(0, 12)}…${seamNote}`,
  };
}

/** Default log path, resolved the same way the server resolves it. */
export function defaultAuditFile(): string {
  const dir =
    process.env.OMNITERM_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'omniterm');
  return path.join(dir, 'activity.jsonl');
}

const CLI_ENTRY_RE = /^audit-verify\.(cjs|mjs|js|cts|mts|ts)$/;

/** True when this file is the process entry point (dist/audit-verify.cjs). */
function invokedDirectly(): boolean {
  try {
    // Running as the CommonJS bundle: the real `module` is the entry.
    if (
      typeof require !== 'undefined' &&
      typeof module !== 'undefined' &&
      require.main === module
    ) {
      return true;
    }
  } catch {
    /* not CommonJS */
  }
  try {
    if (typeof __filename !== 'undefined' && process.argv[1]) {
      // Bundlers inline this file into other entry points; the name check keeps
      // the CLI from firing when that happens.
      return (
        CLI_ENTRY_RE.test(path.basename(process.argv[1])) &&
        path.resolve(process.argv[1]) === path.resolve(__filename)
      );
    }
  } catch {
    /* not CommonJS */
  }
  return false;
}

const USAGE = `OmniTerm audit integrity check

Usage:
  node dist/audit-verify.cjs [path/to/activity.jsonl] [--prefix] [--json]

  path      Activity log to verify. Defaults to
            $OMNITERM_DATA_DIR/activity.jsonl, else ~/.local/share/omniterm/activity.jsonl.
  --prefix  Verify only the given file, as a prefix of the chain
            (default: also read activity.jsonl.1, the rotated file, and
            require the chain to be continuous across the rotation).
  --json    Print the raw result object as JSON.

Statuses: intact | tampered | legacy (v1.8.x data, no hashes) | empty.
Exit codes: 0 = intact/legacy/empty, 2 = tampered, 1 = usage error.`;

function formatReport(result: VerifyResult): string {
  const lines: string[] = [];
  const label = {
    intact: 'INTACT',
    tampered: 'TAMPERED',
    legacy: 'LEGACY (no hashes — v1.8.x data, nothing wrong)',
    empty: 'EMPTY',
  }[result.status];
  lines.push('OmniTerm audit integrity');
  lines.push(`  checked   : ${result.files.length ? result.files.join(', ') : result.path}`);
  lines.push(`  mode      : ${result.mode}`);
  lines.push(`  status    : ${label}`);
  lines.push(
    `  entries   : ${result.entries} (legacy ${result.legacyEntries}, chained ${result.chainedEntries})`,
  );
  if (result.firstSeq !== null) {
    lines.push(
      `  chain     : seq ${result.firstSeq}..${result.lastSeq} (head ${String(result.lastHash).slice(0, 16)}…)`,
    );
  }
  if (result.seam) {
    lines.push(
      `  seam      : oldest available entry is seq ${result.seam.seq}; its prevHash is not checkable here`,
    );
  }
  if (result.firstBadIndex !== null) {
    lines.push(
      `  first bad : entry #${result.firstBadIndex} (0-based), line ${result.firstBadLine}`,
    );
  }
  lines.push(`  verdict   : ${result.reason}`);
  return lines.join('\n');
}

function main(argv: string[]): void {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const unknown = argv.filter((a) => a.startsWith('-') && a !== '--prefix' && a !== '--json');
  if (unknown.length > 0) {
    console.error(`audit-verify: unknown option ${unknown[0]}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const target = argv.find((a) => !a.startsWith('-')) || defaultAuditFile();
  const result = verifyAuditLog(target, {
    mode: argv.includes('--prefix') ? 'prefix' : 'chain',
  });

  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(formatReport(result));

  if (result.status === 'tampered') process.exitCode = 2;
}

if (invokedDirectly()) main(process.argv.slice(2));

// Re-exported so a caller can also print the exact bytes a hash covers.
export { canonicalSerialisation, computeEntryHash };
