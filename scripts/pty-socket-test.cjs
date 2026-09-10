/**
 * End-to-end test of the terminal socket for one shell.
 *
 *   PORT=4410 TOKEN=testtoken SHELL_NAME=zsh ALIAS_CMD=zt \
 *   ALIAS_EXPECT=ZSH-ALIAS-OK EXPECT_INTEGRATION=1 \
 *   node scripts/pty-socket-test.cjs
 *
 * Checks the things a user would notice: an interactive prompt, commands that
 * really execute, the user's own rc file being loaded (an alias only defined
 * there), Ctrl+C, and the audit trail recording the command and exit code.
 */
const WebSocket = require('ws');

const PORT = process.env.PORT || '4401';
const TOKEN = process.env.TOKEN || 'tok';
const SHELL_NAME = process.env.SHELL_NAME || 'shell';
const ALIAS_CMD = process.env.ALIAS_CMD || '';
const ALIAS_EXPECT = process.env.ALIAS_EXPECT || '';
const EXPECT_INTEGRATION = process.env.EXPECT_INTEGRATION !== '0';
const CWD = process.env.TEST_CWD || '/tmp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) =>
  s
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '') // OSC (title, cwd, 133 markers)
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '') // CSI
    .replace(/\x1b[=>78]/g, '') // zsh's PROMPT_SP marker, keypad modes
    .replace(/\r/g, '');
const lastLines = (s, n = 2) =>
  JSON.stringify(
    strip(s)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-n)
  ).slice(0, 90);

(async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/term?token=${TOKEN}`);
  let buf = '';
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'data') buf += m.data;
  });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });

  ws.send(JSON.stringify({ type: 'start', sessionId: `t-${SHELL_NAME}`, cols: 100, rows: 30, cwd: CWD }));
  await sleep(3000);

  const checks = [];
  const note = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });

  note('interactive prompt', /[#$%>] ?$/.test(strip(buf).trimEnd().slice(-40)), lastLines(buf, 1));

  const run = async (cmd, wait = 1400) => {
    buf = '';
    ws.send(JSON.stringify({ type: 'input', data: `${cmd}\r` }));
    await sleep(wait);
    return buf;
  };

  const MATH = process.env.MATH_CMD || 'expr 6 \\* 7';
  note('command executes', /(^|\D)42(\D|$)/.test(strip(await run(MATH))), `${MATH} -> 42`);
  if (ALIAS_CMD) {
    const out = await run(ALIAS_CMD);
    note(`user rc loaded (${ALIAS_CMD})`, out.includes(ALIAS_EXPECT), lastLines(out, 2));
  }

  ws.send(JSON.stringify({ type: 'input', data: 'sleep 30\r' }));
  await sleep(900);
  ws.send(JSON.stringify({ type: 'input', data: '\x03' }));
  await sleep(700);
  note('Ctrl+C interrupts', (await run('echo AFTER-CC')).includes('AFTER-CC'), 'echo AFTER-CC ran');

  await run('false');
  await sleep(700);

  const res = await fetch(`http://127.0.0.1:${PORT}/api/activity-logs`, { headers: { 'x-omniterm-token': TOKEN } });
  const body = await res.json();
  const entries = body.entries || [];
  const recorded = entries.find((e) => (e.command || '').includes(MATH.replace('\\\\*', '*')));
  const failed = entries.find((e) => (e.command || '').trim() === 'false');

  note('audit: command recorded', !!recorded, recorded ? `exit=${recorded.exitCode} cwd=${recorded.cwd}` : `missing (saw: ${entries.slice(0, 3).map((e) => e.command).join(' | ')})`);
  if (EXPECT_INTEGRATION) {
    note('audit: exit code captured', !!failed && failed.exitCode === 1, failed ? `exit=${failed.exitCode}` : 'missing');
  } else {
    note('audit: command without exit code (no hooks)', !!failed && failed.exitCode === null, failed ? `exit=${failed.exitCode}` : 'missing');
  }

  const failedChecks = checks.filter((c) => !c.ok);
  console.log(`\n=== ${SHELL_NAME} === integration=${EXPECT_INTEGRATION ? 'osc133' : 'none'}`);
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(42)} ${c.detail}`);
  console.log(`${checks.length - failedChecks.length}/${checks.length} passed`);
  ws.close();
  process.exit(failedChecks.length ? 1 : 0);
})().catch((err) => {
  console.error('TEST ERROR', err);
  process.exit(2);
});
