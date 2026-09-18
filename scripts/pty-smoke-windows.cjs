// Windows PTY smoke test: spawns ConPTY, runs a marker command, interrupts a running
// command with Ctrl+C, and confirms the shell is still usable afterwards.
//
// Like the Unix smoke, this reports through GitHub annotations so a failure explains
// itself without the job log, and it fails loudly instead of only printing booleans.
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const announce = (level, message) => console.log(`::${level}::${message}`);

let pty;
try {
  pty = require('node-pty');
} catch (error) {
  announce(
    'error',
    `Windows PTY smoke could not load node-pty: ${(error && error.message) || error}`,
  );
  process.exit(1);
}

function findExecutable(name) {
  const result = spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).find(Boolean)?.trim() || null;
}

function discoverProfile() {
  const powershell = findExecutable('pwsh.exe') || findExecutable('powershell.exe');
  if (powershell) {
    return {
      executable: powershell,
      args: ['-NoLogo', '-NoProfile'],
      marker: "Write-Output 'OMNITERM_PTY_OK'",
      sleep: 'Start-Sleep -Seconds 30',
      afterInterrupt: "Write-Output 'OMNITERM_PTY_INTERRUPTED'",
      prompt: /PS [^\r\n>]*>/i,
    };
  }

  const commandPrompt = findExecutable('cmd.exe') || process.env.ComSpec;
  if (!commandPrompt) throw new Error('No supported Windows shell was found');
  return {
    executable: commandPrompt,
    args: ['/d'],
    marker: 'echo OMNITERM_PTY_OK',
    sleep: 'ping -n 31 127.0.0.1 > nul',
    afterInterrupt: 'echo OMNITERM_PTY_INTERRUPTED',
    prompt: /[A-Z]:\\[^\r\n>]*>/i,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitFor(readOutput, pattern, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (pattern.test(readOutput())) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, 50);
  });
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('The Windows PTY smoke test must run on Windows');
  }

  const profile = discoverProfile();
  announce(
    'notice',
    `windows-pty-smoke platform=${process.platform} node=${process.version} shell=${profile.executable} pty=${require('node-pty/package.json').version}`,
  );

  let output = '';
  let terminal = null;
  try {
    terminal = pty.spawn(profile.executable, profile.args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    terminal.onData((data) => {
      output += data;
    });

    await waitFor(() => output, profile.prompt, 15_000, 'the initial prompt');
    terminal.write(`${profile.marker}\r`);
    await waitFor(() => output, /OMNITERM_PTY_OK/, 10_000, 'the marker command');
    terminal.write(`${profile.sleep}\r`);
    // Let the sleep actually start before interrupting it, and give the shell a moment
    // after Ctrl+C: writing the next command in the same tick raced the interrupt.
    await sleep(900);
    const beforeInterrupt = output.length;
    terminal.write('\x03');
    await sleep(900);
    terminal.write(`${profile.afterInterrupt}\r`);
    await waitFor(() => output, /OMNITERM_PTY_INTERRUPTED/, 10_000, 'the post-interrupt marker');
    const interrupted = output.slice(beforeInterrupt).includes('OMNITERM_PTY_INTERRUPTED');
    if (!interrupted) throw new Error('Ctrl+C did not leave the shell usable');
    terminal.write('exit\r');
    announce('notice', `Windows PTY smoke passed with ${profile.executable}`);
  } catch (error) {
    announce('error', `Windows PTY smoke failed with ${profile.executable}: ${error.message}`);
    announce('error', `windows-pty-smoke tail: ${JSON.stringify(output.slice(-800))}`);
    process.exitCode = 1;
  } finally {
    try {
      terminal?.kill();
    } catch {
      /* already gone */
    }
  }
}

main().catch((error) => {
  announce('error', `Windows PTY smoke crashed: ${(error && error.stack) || error}`);
  process.exitCode = 1;
});
