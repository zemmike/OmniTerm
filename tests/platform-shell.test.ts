import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverShellProfile, type ExecutableLookup } from '../platform/shell';

const tempDirs: string[] = [];

function fakeWhich(available: string[]): ExecutableLookup {
  return (executable) => (available.includes(executable) ? executable : null);
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
    expect(cmd.commandArgs('echo ok')).toEqual(['/d', '/s', '/c', 'echo ok']);
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
});
