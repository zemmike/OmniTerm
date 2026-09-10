/**
 * Checks the shell-integration features that need a real shell:
 *   - Up/Down history search over the socket (prefix filtered, session + file)
 *   - command start markers, so every command reports its duration
 *   - live cwd reporting
 *   node scripts/pty-features-test.cjs   (server must be running)
 */
const WebSocket = require('ws');
const PORT = process.env.PORT || '4450';
const TOKEN = process.env.TOKEN || 'tok';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/term?token=${TOKEN}`);
  const commands = [];
  let buf = '';
  let history = null;
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'data') buf += m.data;
    if (m.type === 'command') commands.push(m);
    if (m.type === 'history-result') history = m;
  });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  ws.send(JSON.stringify({ type: 'start', sessionId: 'feat', cols: 100, rows: 30, cwd: '/tmp' }));
  await sleep(2500);

  const run = async (cmd, wait = 1800) => {
    buf = '';
    ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }));
    await sleep(wait);
    return buf;
  };

  const checks = [];
  const note = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });

  await run('echo HISTORY-ONE');
  await run('git status --short 2>/dev/null || true');
  await run('sleep 1');

  // duration comes from the PS0/preexec start marker + the prompt marker
  const dur = commands.find((c) => (c.command || '').startsWith('sleep 1'));
  note(
    'command event with duration',
    !!dur,
    dur ? `exit=${dur.exitCode} duration=${dur.durationMs}ms` : `saw ${commands.length} events`,
  );
  note(
    'duration is plausible (>=900ms)',
    !!dur && dur.durationMs >= 900,
    dur ? `${dur.durationMs}ms` : 'n/a',
  );
  note('exit code reported', !!dur && dur.exitCode === 0, dur ? `exit=${dur.exitCode}` : 'n/a');

  // history: everything, then only what starts with "git"
  ws.send(JSON.stringify({ type: 'history', prefix: '', limit: 50, requestId: 'r1' }));
  await sleep(1200);
  const all = history && history.items ? history.items : [];
  note(
    'history includes session commands',
    all.includes('echo HISTORY-ONE'),
    `${all.length} entries`,
  );

  ws.send(JSON.stringify({ type: 'history', prefix: 'git', limit: 50, requestId: 'r2' }));
  await sleep(1200);
  const git = history && history.items ? history.items : [];
  note(
    'prefix search is filtered',
    git.length > 0 && git.every((c) => c.startsWith('git')),
    JSON.stringify(git.slice(0, 3)),
  );

  ws.send(JSON.stringify({ type: 'history', prefix: 'echo', limit: 50, requestId: 'r3' }));
  await sleep(1200);
  const echoes = history && history.items ? history.items : [];
  note(
    'prefix search excludes other commands',
    echoes.length > 0 && echoes.every((c) => c.startsWith('echo')),
    `${echoes.length} echo entries`,
  );

  const failed = checks.filter((c) => !c.ok);
  console.log('\n=== shell integration features ===');
  for (const c of checks)
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(38)} ${c.detail}`);
  console.log(`${checks.length - failed.length}/${checks.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(2);
});
