#!/usr/bin/env node
/**
 * Measurement client for scripts/bench.sh. Not meant to be run by hand.
 *
 *   BENCH_MODE=cold   Timing client that does not itself start the app:
 *                       - polls /api/health until it returns 200   -> api_ms
 *                       - opens /term, sends start, then an input
 *                         frame, waits for the sentinel text       -> prompt_ms
 *                       - optionally streams one large command and
 *                         waits for the end marker                  -> throughput_ms
 *                     BENCH_MODE=mem  One-shot resident-memory sample of the
 *                     process tree rooted at BENCH_APP_PID.
 *
 * Every "ms" figure is measured from BENCH_T0, which bench.sh stamps
 * immediately before it spawns Electron, so the numbers include process
 * spawn, and never from "when this script happened to wake up".
 *
 * Result: one JSON object written to BENCH_OUT (and echoed to stdout after a
 * BENCHRESULT prefix, for eyeballing a run by hand).
 */
'use strict';

const fs = require('fs');
const WebSocket = require('ws');

const MODE = process.env.BENCH_MODE || 'cold';
const PORT = process.env.BENCH_PORT || '';
const TOKEN = process.env.BENCH_TOKEN || 'bench';
const T0 = Number(process.env.BENCH_T0 || '0') || Date.now();
const APP_PID = Number(process.env.BENCH_APP_PID || '0');
const OUT = process.env.BENCH_OUT || '';
const LINES = Number(process.env.BENCH_LINES || '100000');

// The sentinel is deliberately QUOTED. A PTY echoes back the line you type, so
// a bare `echo BENCH-READY` would match the echo of the input frame the instant
// it arrives, and the measurement would say nothing about the shell being
// ready. `echo BENCH-"READY"` echoes as BENCH-"READY" (no literal BENCH-READY)
// and only prints the literal sentinel once bash has actually run the command.
const SENTINEL = 'BENCH-READY';
const SENTINEL_CMD = 'echo BENCH-"READY"';
const END = 'BENCH-END';
const END_CMD = 'seq 1 ' + LINES + '; echo BENCH-"END"';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ buffers
let buf = '';
let bytes = 0;
const append = (s) => {
  buf += s;
  bytes += Buffer.byteLength(s);
  // Cap the search window so the O(n) includes() below cannot go quadratic on
  // a multi-megabyte paste; the huge-output marker is always near the tail.
  if (buf.length > 1 << 22) buf = buf.slice(-(1 << 16));
};

function waitFor(needle, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (buf.includes(needle)) return resolve();
      if (Date.now() - started > timeoutMs)
        return reject(new Error('timed out waiting for ' + JSON.stringify(needle)));
      setTimeout(tick, 5);
    };
    tick();
  });
}

// ---------------------------------------------------------------- health/ws
async function waitHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  for (;;) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/api/health', {
        headers: { 'x-omniterm-token': TOKEN },
      });
      last = res.status;
      await res.arrayBuffer();
      if (res.status === 200) return Date.now() - T0;
    } catch {
      last = 0;
    }
    if (Date.now() > deadline) throw new Error('health never returned 200 (last: ' + last + ')');
    await sleep(20);
  }
}

function connectTerm(timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/term?token=' + TOKEN);
      let settled = false;
      ws.on('open', () => {
        settled = true;
        resolve(ws);
      });
      ws.on('error', (err) => {
        if (settled) return;
        try {
          ws.terminate();
        } catch {
          /* already gone */
        }
        if (Date.now() > deadline) reject(err);
        else setTimeout(attempt, 50);
      });
    };
    attempt();
  });
}

function attach(ws) {
  const state = { ready: false };
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (m.type === 'ready') state.ready = true;
    if (m.type === 'data' && typeof m.data === 'string') append(m.data);
  });
  return state;
}

const send = (ws, obj) => ws.send(JSON.stringify(obj));

// ------------------------------------------------------------- /proc reader
function procIndex() {
  const kids = new Map();
  for (const name of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    let stat;
    try {
      stat = fs.readFileSync('/proc/' + name + '/stat', 'utf8');
    } catch {
      continue;
    }
    // comm can contain spaces and brackets; everything after the LAST ')' is
    // the stable field list, where index 1 is ppid.
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const ppid = Number(rest[1]);
    if (!Number.isFinite(ppid)) continue;
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid).push(Number(name));
  }
  return kids;
}

// Breadth-first walk so the first 'electron' we meet is the outermost one (the
// app's main process) and not, say, a zygote.
function walk(root, kids) {
  const out = [];
  const seen = new Set();
  const queue = [root];
  while (queue.length) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push(pid);
    for (const c of kids.get(pid) || []) queue.push(c);
  }
  return out;
}

function pssKb(pid) {
  try {
    const m = fs.readFileSync('/proc/' + pid + '/smaps_rollup', 'utf8').match(/^Pss:\s+(\d+) kB$/m);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function commOf(pid) {
  try {
    return fs.readFileSync('/proc/' + pid + '/comm', 'utf8').trim();
  } catch {
    return '?';
  }
}

function sumPss(pids) {
  let totalKb = 0;
  const byComm = new Map();
  for (const pid of pids) {
    if (!fs.existsSync('/proc/' + pid)) continue;
    const kb = pssKb(pid);
    totalKb += kb;
    const c = commOf(pid);
    byComm.set(c, (byComm.get(c) || 0) + kb);
  }
  const breakdown = [...byComm.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([comm, kb]) => comm + '=' + Math.round(kb / 1024));
  return { pids, totalKb, breakdown };
}

// The launcher (npx -> npm exec -> node shim) is ~50 MB of Node that is not the
// app. Report both the whole tree the harness spawned and the Electron subtree
// alone, so the app figure is comparable to the README's own claim.
function sampleTree(root) {
  const kids = procIndex();
  const whole = walk(root, kids).filter((p) => fs.existsSync('/proc/' + p));
  const appRoot = whole.find((p) => commOf(p) === 'electron') || root;
  const app = walk(appRoot, kids).filter((p) => fs.existsSync('/proc/' + p));
  const w = sumPss(whole);
  const a = sumPss(app);
  return {
    pss_mb: Math.round(w.totalKb / 1024),
    processes: w.pids.length,
    breakdown: w.breakdown.join(' '),
    app_pss_mb: Math.round(a.totalKb / 1024),
    app_processes: a.pids.length,
    app_breakdown: a.breakdown.join(' '),
  };
}

// --------------------------------------------------------------------- main
async function main() {
  if (MODE === 'mem') {
    if (!APP_PID) throw new Error('BENCH_APP_PID is required for BENCH_MODE=mem');
    return sampleTree(APP_PID);
  }

  const apiMs = await waitHealth(60000);
  const ws = await connectTerm(30000);
  const state = attach(ws);

  send(ws, { type: 'start', sessionId: 'bench', cwd: '/root', cols: 80, rows: 24 });
  // Wait for the server's own 'ready' frame (it is emitted after the PTY has
  // been spawned) so the input frame is not racing session creation. Fall back
  // to a short grace period if the frame never arrives.
  const readyDeadline = Date.now() + 10000;
  while (!state.ready && Date.now() < readyDeadline) await sleep(10);

  send(ws, { type: 'input', data: SENTINEL_CMD + '\r' });
  await waitFor(SENTINEL, 60000);
  const promptMs = Date.now() - T0;

  const result = { api_ms: apiMs, prompt_ms: promptMs, ready_frame: state.ready ? 1 : 0 };

  if (process.env.BENCH_THROUGHPUT === '1') {
    buf = '';
    bytes = 0;
    const start = Date.now();
    send(ws, { type: 'input', data: END_CMD + '\r' });
    await waitFor(END, 180000);
    result.throughput_ms = Date.now() - start;
    result.throughput_bytes = bytes;
    result.throughput_lines = LINES;
  }

  try {
    ws.close();
  } catch {
    /* ignore */
  }
  return result;
}

main()
  .then((result) => {
    const json = JSON.stringify(result);
    if (OUT) fs.writeFileSync(OUT, json);
    // Shell-friendly mirror so bench.sh needs no JSON parser.
    if (process.env.BENCH_KV) {
      const kv = Object.entries(result)
        .filter(([, v]) => v !== null && typeof v !== 'object')
        .map(([k, v]) => k + '=' + v)
        .join('\n');
      fs.writeFileSync(process.env.BENCH_KV, kv + '\n');
    }
    process.stdout.write('BENCHRESULT ' + json + '\n');
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write('bench-probe: ' + (err && err.stack ? err.stack : String(err)) + '\n');
    process.exit(1);
  });
