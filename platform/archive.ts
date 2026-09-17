import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { discoverShellProfile } from './shell';
import type { PlatformName } from './types';

export interface SnapshotResult {
  path: string;
  format: 'tar.gz' | 'zip';
  sizeBytes: number;
  restoreHint: string;
}

export interface ListedSnapshot extends SnapshotResult {
  name: string;
  modifiedAt: Date;
}

export interface ArchiveCommandResult {
  status: number | null;
  stderr: string | Buffer;
  error?: Error;
}

export interface ArchiveOptions {
  platform?: PlatformName;
  powershell?: string;
  now?: () => Date;
  run?: (command: string, args: string[]) => ArchiveCommandResult;
}

const powershellArchiveScript =
  '& { param($source, $destination) Compress-Archive -LiteralPath $source -DestinationPath $destination -Force }';

function formatForPlatform(platform: PlatformName): SnapshotResult['format'] {
  return platform === 'win32' ? 'zip' : 'tar.gz';
}

function restoreHint(archivePath: string, format: SnapshotResult['format']): string {
  return format === 'zip'
    ? `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath <target-dir>`
    : `tar -xzf "${archivePath.replace(/"/g, '\\"')}" -C <target-dir>`;
}

function defaultRun(command: string, args: string[]): ArchiveCommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 300_000,
    windowsHide: true,
  });
  return {
    status: result.status,
    stderr: result.stderr || '',
    error: result.error,
  };
}

export function removePartialArchive(partialPath: string): void {
  try {
    fs.unlinkSync(partialPath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function createSnapshot(
  sourceDir: string,
  backupDir: string,
  options: ArchiveOptions = {},
): SnapshotResult {
  const platform = options.platform || (process.platform as PlatformName);
  const format = formatForPlatform(platform);
  const stamp = (options.now || (() => new Date()))()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const archivePath = path.join(backupDir, `snapshot-${stamp}.${format}`);
  const partialPath = path.join(backupDir, `.snapshot-${stamp}.partial.${format}`);
  const run = options.run || defaultRun;

  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  removePartialArchive(partialPath);

  try {
    let result: ArchiveCommandResult;
    if (platform === 'win32') {
      const powershell =
        options.powershell || discoverShellProfile({ platform: 'win32' }).executable;
      result = run(powershell, [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        powershellArchiveScript,
        sourceDir,
        partialPath,
      ]);
    } else {
      result = run('tar', [
        '-czf',
        partialPath,
        '--exclude=node_modules',
        '--exclude=.git',
        '-C',
        sourceDir,
        '.',
      ]);
    }

    if (result.error || result.status !== 0) {
      const detail = result.stderr.toString().trim();
      throw result.error || new Error(detail || `archive command exited ${result.status}`);
    }

    fs.renameSync(partialPath, archivePath);
    return {
      path: archivePath,
      format,
      sizeBytes: fs.statSync(archivePath).size,
      restoreHint: restoreHint(archivePath, format),
    };
  } catch (error) {
    removePartialArchive(partialPath);
    throw error;
  }
}

export function listSnapshots(backupDir: string): ListedSnapshot[] {
  try {
    return fs
      .readdirSync(backupDir)
      .filter(
        (name) =>
          !name.includes('.partial.') && (name.endsWith('.tar.gz') || name.endsWith('.zip')),
      )
      .map((name) => {
        const archivePath = path.join(backupDir, name);
        const stat = fs.statSync(archivePath);
        const format = name.endsWith('.zip') ? 'zip' : 'tar.gz';
        return {
          name,
          path: archivePath,
          format,
          sizeBytes: stat.size,
          modifiedAt: new Date(stat.mtimeMs),
          restoreHint: restoreHint(archivePath, format),
        } satisfies ListedSnapshot;
      })
      .sort(
        (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime() || a.name.localeCompare(b.name),
      );
  } catch {
    return [];
  }
}
