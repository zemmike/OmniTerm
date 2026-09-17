const os = require('node:os');
const { spawnSync } = require('node:child_process');
const pty = require('node-pty');

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
  let output = '';
  const terminal = pty.spawn(profile.executable, profile.args, {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color' },
  });
  terminal.onData((data) => {
    output += data;
  });

  try {
    await waitFor(() => output, profile.prompt, 15_000, 'the initial prompt');
    terminal.write(`${profile.marker}\r`);
    await waitFor(() => output, /OMNITERM_PTY_OK/, 10_000, 'the marker command');
    terminal.write(`${profile.sleep}\r`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    terminal.write('\x03');
    terminal.write(`${profile.afterInterrupt}\r`);
    await waitFor(() => output, /OMNITERM_PTY_INTERRUPTED/, 10_000, 'the post-interrupt marker');
    terminal.write('exit\r');
    console.log(`Windows PTY smoke passed with ${profile.executable}`);
  } catch (error) {
    console.error(`Windows PTY smoke failed with ${profile.executable}: ${error.message}`);
    console.error(output.slice(-2000));
    process.exitCode = 1;
  } finally {
    terminal.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
