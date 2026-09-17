import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSnapshot,
  listSnapshots,
  removePartialArchive,
  type ArchiveCommandResult,
} from '../platform/archive';

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniterm-archive-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('createSnapshot', () => {
  it.each(['linux', 'darwin'] as const)(
    'creates %s snapshots with tar argument arrays',
    (platform) => {
      const backupDir = tempDir();
      const sourceDir = path.join(backupDir, 'source with spaces');
      fs.mkdirSync(sourceDir);
      const calls: Array<{ command: string; args: string[] }> = [];

      const result = createSnapshot(sourceDir, backupDir, {
        platform,
        now: () => new Date('2026-09-18T12:34:56Z'),
        run: (command, args) => {
          calls.push({ command, args });
          fs.writeFileSync(args[1], 'archive');
          return { status: 0, stderr: '' };
        },
      });

      expect(calls).toEqual([
        {
          command: 'tar',
          args: [
            '-czf',
            expect.stringContaining('.partial.'),
            '--exclude=node_modules',
            '--exclude=.git',
            '-C',
            sourceDir,
            '.',
          ],
        },
      ]);
      expect(result.format).toBe('tar.gz');
      expect(result.path).toMatch(/snapshot-2026-09-18T12-34-56\.tar\.gz$/);
      expect(result.restoreHint).toContain('tar -xzf');
      expect(fs.readFileSync(result.path, 'utf8')).toBe('archive');
      expect(fs.readdirSync(backupDir).some((name) => name.includes('.partial.'))).toBe(false);
    },
  );

  it('creates Windows snapshots with PowerShell arguments and a ZIP restore hint', () => {
    const backupDir = tempDir();
    const sourceDir = path.join(backupDir, 'source with spaces');
    fs.mkdirSync(sourceDir);
    let call: { command: string; args: string[] } | undefined;

    const result = createSnapshot(sourceDir, backupDir, {
      platform: 'win32',
      powershell: 'pwsh.exe',
      now: () => new Date('2026-09-18T12:34:56Z'),
      run: (command, args) => {
        call = { command, args };
        fs.writeFileSync(args.at(-1)!, 'zip');
        return { status: 0, stderr: '' };
      },
    });

    expect(call?.command).toBe('pwsh.exe');
    expect(call?.args.slice(0, 4)).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-Command',
      expect.any(String),
    ]);
    expect(call?.args.at(-2)).toBe(sourceDir);
    expect(call?.args.at(-1)).toContain('.partial.zip');
    expect(call?.args[3]).toContain('Compress-Archive');
    expect(result).toMatchObject({ format: 'zip', sizeBytes: 3 });
    expect(result.restoreHint).toContain('Expand-Archive');
    expect(result.path).toMatch(/snapshot-2026-09-18T12-34-56\.zip$/);
  });

  it('removes only its partial destination when archive creation fails', () => {
    const backupDir = tempDir();
    const sourceDir = path.join(backupDir, 'source');
    const existing = path.join(backupDir, 'snapshot-2026-09-18T12-34-56.tar.gz');
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(existing, 'existing');

    expect(() =>
      createSnapshot(sourceDir, backupDir, {
        platform: 'linux',
        now: () => new Date('2026-09-18T12:34:56Z'),
        run: (_command, args): ArchiveCommandResult => {
          fs.writeFileSync(args[1], 'partial');
          return { status: 2, stderr: 'tar broke' };
        },
      }),
    ).toThrow('tar broke');

    expect(fs.readFileSync(existing, 'utf8')).toBe('existing');
    expect(fs.readdirSync(backupDir)).toEqual(['snapshot-2026-09-18T12-34-56.tar.gz', 'source']);
  });
});

describe('listSnapshots', () => {
  it('lists completed tar.gz and ZIP snapshots but ignores partial files', () => {
    const backupDir = tempDir();
    fs.writeFileSync(path.join(backupDir, 'snapshot-a.tar.gz'), 'tar');
    fs.writeFileSync(path.join(backupDir, 'snapshot-b.zip'), 'zip');
    fs.writeFileSync(path.join(backupDir, '.snapshot-c.partial.zip'), 'partial');
    fs.writeFileSync(path.join(backupDir, 'notes.txt'), 'ignore');

    expect(listSnapshots(backupDir).map(({ name, format }) => ({ name, format }))).toEqual(
      expect.arrayContaining([
        { name: 'snapshot-a.tar.gz', format: 'tar.gz' },
        { name: 'snapshot-b.zip', format: 'zip' },
      ]),
    );
  });
});

describe('removePartialArchive', () => {
  it('ignores a missing partial file', () => {
    expect(() => removePartialArchive(path.join(tempDir(), 'missing.partial.zip'))).not.toThrow();
  });
});
