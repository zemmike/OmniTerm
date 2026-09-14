/**
 * Hash-chain primitives for the OmniTerm command audit trail.
 *
 * The audit trail (`activity.jsonl`, mode 0600) is the app's evidence of what
 * actually ran. On its own a JSONL file proves nothing: anyone who can write it
 * (the user, any process running as them) can edit or delete a line and the file
 * still looks intact. This module turns every new line into a link in a hash
 * chain, so a modified or removed entry no longer verifies.
 *
 * ---------------------------------------------------------------------------
 * THE CANONICAL FORM (v1) — reimplementable from this comment alone
 * ---------------------------------------------------------------------------
 *
 * An entry is a JSON object. Chained entries carry three extra fields:
 *
 *   seq       integer >= 1, the entry's position in the chain
 *   prevHash  the `hash` of the preceding entry, or "" for the first entry
 *   hash      lowercase hex sha256 (64 chars) of the canonical serialisation
 *
 * The canonical serialisation is the UTF-8 bytes of a JSON array with exactly
 * sixteen elements, in this order and with these encodings:
 *
 *   [0]  "OmniTerm-Audit-Chain"   schema tag (constant)
 *   [1]  1                        chain version (constant)
 *   [2]  seq                      integer >= 1, or null if absent/non-integer
 *   [3]  prevHash                 "" when absent
 *   [4]  id            [5]  timestamp    [6]  username    [7]  role
 *   [8]  action        [9]  details      [10] ip          [11] severity
 *   [12] cwd           [13] exitCode     [14] durationMs  [15] command
 *
 * Element encoding for [4]..[15]: a string stays a string; a finite number stays
 * a number; anything absent (undefined), null, NaN or Infinity becomes null. A
 * value of any other type is serialised with JSON.stringify. In particular an
 * absent field and an explicit null hash identically, which matters because
 * JSON.stringify drops undefined properties but keeps null ones.
 *
 *   canonical = JSON.stringify(array above)      // no whitespace, no newline
 *   hash      = sha256(utf8(canonical)) as lowercase hex
 *
 * Notes for a reimplementer:
 *   - JSON object key order in the file is irrelevant: only the array above is
 *     hashed, so the fields a writer appends last do not change the hash.
 *   - `hash` is never part of its own input, and `prevHash`/`seq` always are, so
 *     editing a seq or swapping two entries also breaks the chain.
 *   - Only those twelve content fields are covered. Any other property a future
 *     version adds is not protected until the canonical form is revised (which
 *     is why the version number is inside the hash).
 *   - Numbers are written in JavaScript's shortest round-trip form, so they must
 *     be integers (exit codes, durations). A fraction would be hashed exactly as
 *     JS prints it and a different language may print it differently.
 *
 * ---------------------------------------------------------------------------
 * CHAIN SEMANTICS
 * ---------------------------------------------------------------------------
 *   - The first chained entry of a chain has seq 1 and prevHash "".
 *   - Every following entry has seq = previous seq + 1 and prevHash equal to the
 *     previous entry's hash.
 *   - Entries written before chaining existed (v1.8.x) have no seq/prevHash/hash.
 *     They are a *legacy prelude*: they keep their position at the front of the
 *     file, are never rewritten, and are counted so that the first chained entry
 *     after a prelude of L entries has seq L + 1 and prevHash "". Old data is
 *     never described as corrupt.
 *   - The chain is continuous *across rotation*: activity.jsonl is renamed to
 *     activity.jsonl.1 at 8 MB and the next entry (written into the fresh live
 *     file) continues from the renamed file's last hash and seq.
 */

import fs from 'fs';
import crypto from 'crypto';

/** Schema tag mixed into every hash, so a hash cannot be reused in another scheme. */
export const CHAIN_SCHEMA = 'OmniTerm-Audit-Chain';
/** Canonical-form version, hashed with every entry. Bump only with a migration. */
export const CHAIN_VERSION = 1;
/** A well-formed entry hash: lowercase sha256 hex. */
export const HASH_RE = /^[0-9a-f]{64}$/;

/** The twelve content positions of the canonical array, in order. */
export const CANONICAL_FIELDS = [
  'id',
  'timestamp',
  'username',
  'role',
  'action',
  'details',
  'ip',
  'severity',
  'cwd',
  'exitCode',
  'durationMs',
  'command',
] as const;

/** An audit entry as it is read back from JSONL: no shape guarantees. */
export type AuditEntryLike = Record<string, unknown>;

/** The tail of a chain: what the next entry must build on. */
export interface ChainTail {
  seq: number;
  hash: string;
}

/** The anchor a brand-new chain starts from (seq 0, no predecessor). */
export const GENESIS_TAIL: ChainTail = { seq: 0, hash: '' };

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Canonical encoding of one canonical-array element (see the spec above). */
function canonicalValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return JSON.stringify(value) ?? String(value);
}

function canonicalSeq(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** The canonical array hashed for an entry. Exported so a tool can print it. */
export function canonicalPayload(entry: AuditEntryLike): (string | number | null)[] {
  return [
    CHAIN_SCHEMA,
    CHAIN_VERSION,
    canonicalSeq(entry.seq),
    typeof entry.prevHash === 'string' ? entry.prevHash : '',
    ...CANONICAL_FIELDS.map((field) => canonicalValue(entry[field])),
  ];
}

/** The exact string that is hashed for an entry. */
export function canonicalSerialisation(entry: AuditEntryLike): string {
  return JSON.stringify(canonicalPayload(entry));
}

/**
 * The entry's hash over its own content plus prevHash and seq. Call it with the
 * entry as it will be written (seq and prevHash already set).
 */
export function computeEntryHash(entry: AuditEntryLike): string {
  return sha256Hex(canonicalSerialisation(entry));
}

/** True only for an entry carrying a well-formed 64-hex sha256 `hash`. */
export function isHashedEntry(entry: AuditEntryLike | null | undefined): boolean {
  return !!entry && typeof entry.hash === 'string' && HASH_RE.test(entry.hash);
}

/**
 * True when an entry carries any chain marker at all. A marker without a valid
 * hash means the hash field was removed or corrupted — that is tampering, never
 * a legacy entry (v1.8.x lines have none of these three fields).
 */
export function hasChainMarkers(entry: AuditEntryLike | null | undefined): boolean {
  if (!entry) return false;
  return entry.hash !== undefined || entry.seq !== undefined || entry.prevHash !== undefined;
}

/** activity.jsonl → activity.jsonl.1, the single rotation generation. */
export function rotatedAuditPath(livePath: string): string {
  return `${livePath}.1`;
}

function fileHasBytes(file: string): boolean {
  try {
    return fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

/**
 * The files that make up one logical trail, oldest first: the rotated file (if
 * it exists and is non-empty) then the live file. Both the writer and the
 * verifier order files this way, so "the chain" means the same thing to each.
 */
export function auditChainFiles(livePath: string): string[] {
  const rotated = rotatedAuditPath(livePath);
  const files: string[] = [];
  if (fileHasBytes(rotated)) files.push(rotated);
  if (fileHasBytes(livePath)) files.push(livePath);
  return files;
}

/** Tolerant JSONL reader: blank lines skipped, unparseable lines dropped. */
export function readJsonlEntries(file: string): AuditEntryLike[] {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        try {
          const parsed: unknown = JSON.parse(line);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as AuditEntryLike)
            : null;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is AuditEntryLike => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Where the chain currently ends, so the next entry can continue it.
 *
 *   - the newest entry sealed with a valid hash wins (the live file first; the
 *     rotated file only when the live file has nothing chained yet, which is
 *     exactly the state right after a rotation and a restart);
 *   - otherwise there is no chain yet: legacy entries occupy seq 1..N, so the
 *     first chained entry gets seq N + 1 with prevHash "".
 *
 * Reads at most the two files of one generation, and never throws: a log it
 * cannot read simply yields the genesis anchor.
 */
export function loadAuditChainTail(livePath: string): ChainTail {
  const files = auditChainFiles(livePath).slice().reverse(); // newest first
  let unhashed = 0;
  for (const file of files) {
    const entries = readJsonlEntries(file);
    unhashed += entries.length;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (isHashedEntry(entry)) {
        const seq = canonicalSeq(entry.seq) ?? i + 1;
        return { seq, hash: String(entry.hash) };
      }
    }
  }
  return { seq: unhashed, hash: '' };
}
