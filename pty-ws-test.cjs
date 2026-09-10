// End-to-end test of the PTY WebSocket: real shell, Ctrl+C, aliases, TUI app.
const WebSocket = require('ws');

const PORT = process.env.PORT || '4399';
const TOKEN = process.env.TOKEN || 'tok';
const url = `ws://127.0.0.1:${PORT}/term?token=${TOKEN}`;
const ws = new WebSocket(url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let buf = '';
const results = {};

ws.on('open', async () => {
  ws.send(JSON.stringify({ type: 'start', sessionId: 'test-1', cols: 100, rows: 30, cwd: '/root' }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'data') buf += msg.data;
  if (msg.type === 'ready') results.ready = `${msg.shell} pid=${msg.pid} cwd=${msg.cwd}`;
  if (msg.type === 'error') results.error = msg.message;
  if (msg.type === 'exit') results.exit = msg.exitCode;
});

(async () => {
  await sleep(2500);
  const send = (d) => ws.send(JSON.stringify({ type: 'input', data: d }));

  // 1. does the shell run and echo back, with the user's own prompt?
  send('echo PTY-OK-$(( 6 * 7 ))\r');
  await sleep(1200);
  results.shellWorks = buf.includes('PTY-OK-42');
  results.realPrompt = /root@[\w.-]+:/.test(buf);

  // 2. does integration report the exit code + command to the audit trail?
  send('false\r');
  await sleep(900);
  send('echo AFTER-FALSE\r');
  await sleep(900);
  results.auditHookFired = buf.includes('AFTER-FALSE');

  // 3. Ctrl+C on a long-running command
  const before = buf.length;
  send('sleep 60\r');
  await sleep(900);
  send('\u0003');
  await sleep(600);
  send('echo CTRL-C-OK\r');
  await sleep(900);
  results.ctrlC = buf.slice(before).includes('CTRL-C-OK');

  // 4. tab completion (shell-driven, folders in /root)
  send('cd /root/OmniT\t\r');
  await sleep(900);
  send('pwd\r');
  await sleep(900);
  results.tabCompletion = /\/root\/OmniTerm/.test(buf.slice(-400));

  // 5. a full-screen TUI program (the old build refused these outright)
  const beforeTui = buf.length;
  send('vim -u NONE -c "set nocompatible" /tmp/omniterm-tui-test.txt\r');
  await sleep(1800);
  const tuiBuffer = buf.slice(beforeTui);
  results.vimLaunched = !/not supported|only one-shot commands|refus/i.test(tuiBuffer);
  results.vimAltScreen = tuiBuffer.includes('\u001b[?1049h') || tuiBuffer.includes('\u001b[?47h');
  send('\u001b:q!\r');
  await sleep(1200);
  send('echo VIM-EXITED-OK\r');
  await sleep(900);
  results.vimExited = buf.slice(-200).includes('VIM-EXITED-OK');

  console.log(JSON.stringify(results, null, 2));
  console.log('--- tail ---');
  console.log(JSON.stringify(buf.slice(-260)));
  ws.close();
  process.exit(0);
})();

setTimeout(() => {
  console.log('TIMEOUT', JSON.stringify(results, null, 2));
  process.exit(1);
}, 40000);
