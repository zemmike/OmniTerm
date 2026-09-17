import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PlatformName, ShellKind, ShellProfile } from './types';

export type ExecutableLookup = (executable: string) => string | null;

export interface ShellDiscoveryOptions {
  platform: PlatformName;
  env?: NodeJS.ProcessEnv;
  home?: string;
  dataDir?: string;
  which?: ExecutableLookup;
}

function systemWhich(platform: PlatformName): ExecutableLookup {
  return (executable) => {
    const result = spawnSync(platform === 'win32' ? 'where.exe' : 'which', [executable], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    return (
      result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) || null
    );
  };
}

function shellKind(executable: string, platform: PlatformName): ShellKind {
  const base = (platform === 'win32' ? path.win32 : path.posix).basename(executable).toLowerCase();
  if (base.startsWith('bash')) return 'bash';
  if (base.startsWith('zsh')) return 'zsh';
  if (base.startsWith('fish')) return 'fish';
  if (base === 'pwsh' || base === 'pwsh.exe' || base === 'powershell.exe') return 'powershell';
  if (base === 'cmd' || base === 'cmd.exe') return 'cmd';
  return 'plain';
}

function historyFiles(kind: ShellKind, home: string, env: NodeJS.ProcessEnv): string[] {
  if (kind === 'bash') return [path.posix.join(home, '.bash_history')];
  if (kind === 'zsh') {
    const configured = path.posix.join(env.ZDOTDIR || home, '.zsh_history');
    const fallback = path.posix.join(home, '.zsh_history');
    return configured === fallback ? [fallback] : [fallback, configured];
  }
  if (kind === 'fish') {
    return [path.posix.join(home, '.local', 'share', 'fish', 'fish_history')];
  }
  return [];
}

function powershellIntegration(dataDir: string | undefined): string | null {
  if (!dataDir) return null;
  const scriptPath = path.join(dataDir, 'shell-integration.ps1');
  const script = `# OmniTerm shell integration - generated file, safe to delete.
$script:OmniTermOriginalPrompt = $function:global:prompt
$script:OmniTermPreviousHistoryHandler = $null
if (Get-Command Get-PSReadLineOption -ErrorAction SilentlyContinue) {
  $script:OmniTermPreviousHistoryHandler = (Get-PSReadLineOption).AddToHistoryHandler
  Set-PSReadLineOption -AddToHistoryHandler {
    param($line)
    [Console]::Write(('{0}]133;C{1}' -f [char]27, [char]7))
    if ($script:OmniTermPreviousHistoryHandler) {
      return & $script:OmniTermPreviousHistoryHandler $line
    }
    return $true
  }
}
function global:prompt {
  $omniTermSucceeded = $?
  $omniTermNativeExit = $global:LASTEXITCODE
  $omniTermExit = if ($omniTermSucceeded) { 0 } elseif ($omniTermNativeExit -is [int] -and $omniTermNativeExit -ne 0) { $omniTermNativeExit } else { 1 }
  $omniTermHistory = Get-History -Count 1 -ErrorAction SilentlyContinue
  $omniTermCommand = if ($omniTermHistory) { [string]$omniTermHistory.CommandLine } else { '' }
  $omniTermBytes = [Text.Encoding]::UTF8.GetBytes($omniTermCommand)
  $omniTermBase64 = [Convert]::ToBase64String($omniTermBytes)
  $omniTermCwd = (Get-Location).Path.Replace('\\', '/')
  if ($omniTermCwd -match '^[A-Za-z]:') { $omniTermCwd = "/$omniTermCwd" }
  $omniTermEscapedCwd = (($omniTermCwd -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
  $omniTermHostName = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { 'localhost' }
  [Console]::Write(('{0}]133;D;{1};{2}{3}' -f [char]27, $omniTermExit, $omniTermBase64, [char]7))
  [Console]::Write(('{0}]7;file://{1}{2}{3}' -f [char]27, $omniTermHostName, $omniTermEscapedCwd, [char]7))
  [Console]::Write(('{0}]133;A{1}' -f [char]27, [char]7))
  if ($script:OmniTermOriginalPrompt) { return & $script:OmniTermOriginalPrompt }
  return "PS $($executionContext.SessionState.Path.CurrentLocation)> "
}
`;
  try {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(scriptPath, script, { mode: 0o600 });
    return scriptPath;
  } catch {
    return null;
  }
}

function posixProfile(
  executable: string,
  platform: PlatformName,
  home: string,
  env: NodeJS.ProcessEnv,
): ShellProfile {
  const kind = shellKind(executable, platform);
  const base = path.posix.basename(executable).toLowerCase();
  const basicShell = /^(dash|ash|busybox|sh)$/.test(base);
  const labels: Record<ShellKind, string> = {
    bash: 'Bash',
    zsh: 'Zsh',
    fish: 'fish',
    powershell: 'PowerShell',
    cmd: 'Command Prompt',
    plain: 'Shell',
  };
  return {
    id: kind,
    label: labels[kind],
    executable,
    args: kind === 'plain' && basicShell ? ['-i'] : ['-l', '-i'],
    commandArgs: (command) => ['-lc', command],
    kind,
    integration: 'none',
    historyFiles: historyFiles(kind, home, env),
    env: {},
  };
}

export function discoverShellProfile(options: ShellDiscoveryOptions): ShellProfile {
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const which = options.which || systemWhich(options.platform);

  if (options.platform === 'win32') {
    const powershell = which('pwsh.exe') || which('powershell.exe');
    if (powershell) {
      const integrationScript = powershellIntegration(options.dataDir);
      return {
        id: path.win32
          .basename(powershell)
          .toLowerCase()
          .replace(/\.exe$/, ''),
        label: path.win32.basename(powershell).toLowerCase().startsWith('pwsh')
          ? 'PowerShell 7'
          : 'Windows PowerShell',
        executable: powershell,
        args: integrationScript
          ? ['-NoLogo', '-NoExit', '-File', integrationScript]
          : ['-NoLogo', '-NoExit'],
        commandArgs: (command) => ['-NoLogo', '-NoProfile', '-Command', command],
        kind: 'powershell',
        integration: integrationScript ? 'powershell osc133' : 'none',
        historyFiles: [],
        env: {},
      };
    }

    const commandPrompt = which('cmd.exe') || env.ComSpec || 'cmd.exe';
    return {
      id: 'cmd',
      label: 'Command Prompt',
      executable: commandPrompt,
      args: ['/d'],
      commandArgs: (command) => ['/d', '/s', '/c', `"${command}"`],
      commandWindowsVerbatimArguments: true,
      kind: 'cmd',
      integration: 'none',
      historyFiles: [],
      env: {},
    };
  }

  if (options.platform === 'darwin') {
    return posixProfile(env.SHELL || '/bin/zsh', options.platform, home, env);
  }

  const executable = env.SHELL || which('bash') || which('sh') || '/bin/bash';
  return posixProfile(executable, options.platform, home, env);
}
