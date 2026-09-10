// Deterministic node-pty smoke test: no stage machine, fixed sleeps only.
const pty = require('node-pty');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const shell = process.env.SHELL || '/bin/bash';
  let buf = '';
  const p = pty.spawn(shell, ['-i'], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.env.HOME || '/root',
    env: { ...process.env, TERM: 'xterm-256color' },
  });
  p.onData((d) => {
    buf += d;
  });

  await sleep(600);
  p.write('echo STAGE-$(( 2 + 3 ))\r');
  await sleep(800);

  p.write('echo ALIASES:$(alias | wc -l) TYPE:$(type -t ll)\r');
  await sleep(800);

  p.write('sleep 30\r');
  await sleep(600);
  const before = buf.length;
  p.write('\x03'); // Ctrl+C
  await sleep(700);
  p.write('echo AFTER-INTERRUPT\r');
  await sleep(900);

  const seg = buf.slice(before);
  console.log('STAGE-5 seen        :', buf.includes('STAGE-5'));
  console.log(
    'aliases loaded      :',
    /ALIASES:([1-9]\d*)/.test(buf),
    (buf.match(/ALIASES:\d+ TYPE:\S+/) || ['?'])[0],
  );
  console.log('Ctrl+C interrupted  :', seg.includes('AFTER-INTERRUPT'));
  console.log(
    'prompt is real      :',
    /\S+@\S+/.test(buf.replace(/STAGE|ALIASES|AFTER[^\n]*/g, '')),
  );
  console.log('--- tail ---');
  console.log(JSON.stringify(buf.slice(-420)));
  p.kill();
  process.exit(0);
})();
