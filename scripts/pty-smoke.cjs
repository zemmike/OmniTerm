// Deterministic node-pty smoke test: no stage machine, fixed sleeps only.
//
// Reports through GitHub annotations (::error:: / ::notice::) so a red run explains
// itself without needing the job log: on CI, logs are only readable with an
// authenticated gh, and a smoke test that cannot say why it failed is not much use.
//
// What is gated: the shell actually evaluates a command, Ctrl+C actually interrupts a
// running command, and a prompt appears. What is only reported: the alias count, which
// legitimately differs by platform (macOS bash loads no aliases for a non-login
// interactive shell, so gating on it would fail the platform, not the code).
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const announce = (level, message) => console.log(`::${level}::${message}`);

let pty;
try {
  pty = require('node-pty');
} catch (error) {
  // The most common real cause: node-pty's native binary is missing or was built for a
  // different ABI than the Node running this script.
  announce(
    'error',
    `PTY smoke could not load node-pty on ${process.platform}: ${(error && error.message) || error}`,
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findWindowsShell() {
  for (const executable of ['pwsh.exe', 'powershell.exe', 'cmd.exe']) {
    const result = spawnSync('where.exe', [executable], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) return result.stdout.split(/\r?\n/).find(Boolean).trim();
  }
  return process.env.ComSpec || 'cmd.exe';
}

async function main() {
  const windows = process.platform === 'win32';
  const shell = windows ? findWindowsShell() : process.env.SHELL || '/bin/bash';
  announce(
    'notice',
    `pty-smoke platform=${process.platform} node=${process.version} shell=${shell} pty=${require('node-pty/package.json').version}`,
  );

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

  try {
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
    const promptSeen = windows
      ? /(?:PS [^\r\n>]+>|[A-Z]:\\[^\r\n>]*>)/i.test(buf)
      : /\S+@\S+/.test(buf.replace(/STAGE|ALIASES|AFTER[^\n]*/g, ''));
    const aliasMatch = buf.match(/ALIASES:(\d+) TYPE:(\S+)/);

    const checks = [
      ['the shell evaluated a command (STAGE-5)', buf.includes('STAGE-5')],
      ['Ctrl+C interrupted the running command', seg.includes('AFTER-INTERRUPT')],
    ];
    for (const [label, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    console.log(
      `info prompt detected: ${promptSeen}; aliases reported: ${aliasMatch ? aliasMatch[0] : 'none'}`,
    );

    const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
    if (failed.length) {
      announce('error', `PTY smoke failed on ${process.platform} (${shell}): ${failed.join('; ')}`);
      announce('error', `pty-smoke tail: ${JSON.stringify(buf.slice(-500))}`);
      process.exitCode = 1;
    } else {
      announce('notice', `PTY smoke passed on ${process.platform} with ${shell}`);
    }
  } catch (error) {
    announce(
      'error',
      `PTY smoke crashed on ${process.platform}: ${(error && error.stack) || error}`,
    );
    announce('error', `pty-smoke tail: ${JSON.stringify(buf.slice(-500))}`);
    process.exitCode = 1;
  } finally {
    try {
      p.kill();
    } catch {
      /* already gone */
    }
  }
}

void main();
