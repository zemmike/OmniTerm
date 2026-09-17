import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverShellProfile, type ExecutableLookup } from '../platform/shell';
import type { ShellProfile } from '../platform/types';

const tempDirs: string[] = [];
const windowsPowerShell = (() => {
  if (process.platform !== 'win32') return null;
  const result = spawnSync('where.exe', ['powershell.exe'], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean)?.trim() || null : null;
})();

function fakeWhich(available: string[]): ExecutableLookup {
  return (executable) => (available.includes(executable) ? executable : null);
}

function generatedPowerShellProfile(): ShellProfile {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniterm-shell-'));
  tempDirs.push(dataDir);
  return discoverShellProfile({
    platform: 'win32',
    dataDir,
    which: (executable) => (executable === 'powershell.exe' ? windowsPowerShell : null),
  });
}

function runWindowsPowerShellPrompt(profile: ShellProfile, beforePrompt = '') {
  const scriptPath = profile.args.at(-1)!;
  const quotedScript = scriptPath.replace(/'/g, "''");
  const result = spawnSync(
    windowsPowerShell!,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      [`. '${quotedScript}'`, beforePrompt, 'prompt'].filter(Boolean).join('; '),
    ],
    { encoding: 'buffer', timeout: 15_000, windowsHide: true },
  );
  const output = result.stdout.includes(0)
    ? result.stdout.toString('utf16le')
    : result.stdout.toString('utf8');
  return { ...result, output };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('discoverShellProfile', () => {
  it('prefers PowerShell 7 on Windows', () => {
    const profile = discoverShellProfile({
      platform: 'win32',
      which: fakeWhich(['pwsh.exe', 'powershell.exe', 'cmd.exe']),
    });

    expect(profile.kind).toBe('powershell');
    expect(profile.executable).toBe('pwsh.exe');
  });

  it('falls back from PowerShell 7 to Windows PowerShell', () => {
    const profile = discoverShellProfile({
      platform: 'win32',
      which: fakeWhich(['powershell.exe', 'cmd.exe']),
    });

    expect(profile.kind).toBe('powershell');
    expect(profile.executable).toBe('powershell.exe');
  });

  it('falls back to cmd when no PowerShell is available', () => {
    const profile = discoverShellProfile({
      platform: 'win32',
      which: fakeWhich(['cmd.exe']),
    });

    expect(profile.kind).toBe('cmd');
    expect(profile.executable).toBe('cmd.exe');
  });

  it('uses shell-specific one-shot argument arrays', () => {
    const pwsh = discoverShellProfile({
      platform: 'win32',
      which: fakeWhich(['pwsh.exe']),
    });
    const powershell = discoverShellProfile({
      platform: 'win32',
      which: fakeWhich(['powershell.exe']),
    });
    const cmd = discoverShellProfile({
      platform: 'win32',
      which: fakeWhich(['cmd.exe']),
    });
    const bash = discoverShellProfile({
      platform: 'linux',
      env: { SHELL: '/usr/bin/bash' },
      home: '/home/m',
      which: fakeWhich([]),
    });

    expect(pwsh.commandArgs('Write-Output ok')).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-Command',
      'Write-Output ok',
    ]);
    expect(powershell.commandArgs('Write-Output ok')).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-Command',
      'Write-Output ok',
    ]);
    expect(cmd.commandArgs('echo ok')).toEqual(['/d', '/s', '/c', '"echo ok"']);
    expect(bash.commandArgs('printf ok')).toEqual(['-lc', 'printf ok']);
  });

  it('uses zsh by default on macOS', () => {
    expect(discoverShellProfile({ platform: 'darwin', env: {} }).executable).toBe('/bin/zsh');
  });

  it('uses the configured POSIX shell and its known history format', () => {
    const profile = discoverShellProfile({
      platform: 'linux',
      env: { SHELL: '/usr/bin/fish' },
      home: '/home/m',
      which: fakeWhich([]),
    });

    expect(profile.kind).toBe('fish');
    expect(profile.historyFiles).toEqual(['/home/m/.local/share/fish/fish_history']);
  });

  it('returns no history files for shells without a safe known format', () => {
    const profile = discoverShellProfile({
      platform: 'win32',
      which: fakeWhich(['cmd.exe']),
    });

    expect(profile.historyFiles).toEqual([]);
  });

  it('preserves interactive launch arguments for basic and unknown POSIX shells', () => {
    const basic = discoverShellProfile({
      platform: 'linux',
      env: { SHELL: '/bin/sh' },
      which: fakeWhich([]),
    });
    const unknown = discoverShellProfile({
      platform: 'linux',
      env: { SHELL: '/opt/custom-shell' },
      which: fakeWhich([]),
    });

    expect(basic.args).toEqual(['-i']);
    expect(unknown.args).toEqual(['-l', '-i']);
  });

  it('creates a session-only PowerShell integration script under the data directory', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniterm-shell-'));
    tempDirs.push(dataDir);

    const profile = discoverShellProfile({
      platform: 'win32',
      dataDir,
      which: fakeWhich(['pwsh.exe']),
    });
    const scriptPath = path.join(dataDir, 'shell-integration.ps1');

    expect(profile.integration).toBe('powershell osc133');
    expect(profile.args).toEqual(['-NoLogo', '-NoExit', '-File', scriptPath]);
    expect(fs.existsSync(scriptPath)).toBe(true);
    const script = fs.readFileSync(scriptPath, 'utf8');
    expect(script).toContain(']7;file://');
    expect(script).toContain(']133;C');
    expect(script).toContain(']133;D;');
  });

  it.runIf(Boolean(windowsPowerShell))('emits real ESC bytes in Windows PowerShell 5.1', () => {
    const result = runWindowsPowerShellPrompt(generatedPowerShellProfile());

    expect(result.status).toBe(0);
    expect(result.output).toContain('\u001b]133;D;');
  });

  it.runIf(Boolean(windowsPowerShell))(
    'reports a nonzero status when a PowerShell cmdlet fails after LASTEXITCODE was zero',
    () => {
      const result = runWindowsPowerShellPrompt(
        generatedPowerShellProfile(),
        "$global:LASTEXITCODE = 0; Get-Item 'Z:\\omniterm-missing' -ErrorAction SilentlyContinue",
      );
      const marker = result.output.match(/\u001b\]133;D;(\d+);/);

      expect(result.status).toBe(0);
      expect(marker?.[1]).toBeDefined();
      expect(marker?.[1]).not.toBe('0');
    },
  );

  it.runIf(process.platform === 'win32')(
    'runs a quoted cmd executable path containing spaces',
    () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniterm cmd '));
      tempDirs.push(dataDir);
      const scriptPath = path.join(dataDir, 'quoted tool.cmd');
      fs.writeFileSync(scriptPath, '@echo off\r\necho CMD-QUOTED-OK:%1\r\n');
      const profile = discoverShellProfile({
        platform: 'win32',
        which: (executable) => (executable === 'cmd.exe' ? 'cmd.exe' : null),
      });

      const command = `"${scriptPath}" value`;
      const result = spawnSync(profile.executable, profile.commandArgs(command), {
        encoding: 'utf8',
        windowsHide: true,
        windowsVerbatimArguments: profile.commandWindowsVerbatimArguments,
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('CMD-QUOTED-OK:value');
    },
  );
});
