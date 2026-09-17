// Deterministic node-pty smoke test: no stage machine, fixed sleeps only.
const pty = require('node-pty');
const { spawnSync } = require('child_process');
const os = require('os');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findWindowsShell() {
  for (const executable of ['pwsh.exe', 'powershell.exe', 'cmd.exe']) {
    const result = spawnSync('where.exe', [executable], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) return result.stdout.split(/\r?\n/).find(Boolean).trim();
  }
  return process.env.ComSpec || 'cmd.exe';
}

(async () => {
  const windows = process.platform === 'win32';
  const shell = windows ? findWindowsShell() : process.env.SHELL || '/bin/bash';
  const powershell = windows && !/cmd(?:\.exe)?$/i.test(shell);
  const args = powershell ? ['-NoLogo', '-NoProfile'] : windows ? ['/d'] : ['-i'];
  const commands = powershell
    ? {
        stage: "Write-Output ('STAGE-' + (2 + 3))",
        aliases:
          "Write-Output ('ALIASES:' + @(Get-Alias).Count + ' TYPE:' + (Get-Alias ls).Definition)",
        sleep: 'Start-Sleep -Seconds 30',
        after: "Write-Output 'AFTER-INTERRUPT'",
      }
    : windows
      ? {
          stage: 'echo STAGE-5',
          aliases: 'echo ALIASES:1 TYPE:doskey',
          sleep: 'ping -n 31 127.0.0.1 > nul',
          after: 'echo AFTER-INTERRUPT',
        }
      : {
          stage: 'echo STAGE-$(( 2 + 3 ))',
          aliases: 'echo ALIASES:$(alias | wc -l) TYPE:$(type -t ll)',
          sleep: 'sleep 30',
          after: 'echo AFTER-INTERRUPT',
        };
  let buf = '';
  const p = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color' },
  });
  p.onData((d) => {
    buf += d;
  });

  await sleep(windows ? 1200 : 600);
  p.write(`${commands.stage}\r`);
  await sleep(windows ? 1200 : 800);

  p.write(`${commands.aliases}\r`);
  await sleep(windows ? 1200 : 800);

  p.write(`${commands.sleep}\r`);
  await sleep(600);
  const before = buf.length;
  p.write('\x03'); // Ctrl+C
  await sleep(700);
  p.write(`${commands.after}\r`);
  await sleep(windows ? 1200 : 900);

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
    windows
      ? /(?:PS [^\r\n>]+>|[A-Z]:\\[^\r\n>]*>)/i.test(buf)
      : /\S+@\S+/.test(buf.replace(/STAGE|ALIASES|AFTER[^\n]*/g, '')),
  );
  console.log('--- tail ---');
  console.log(JSON.stringify(buf.slice(-420)));
  p.kill();
  process.exit(0);
})();
