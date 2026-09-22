import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  applyHerdrTheme,
  backupPathFor,
  findHerdrBinary,
  readHerdrStatus,
  resolveHerdrConfigPath,
  revertHerdrTheme,
} from '../herdr';

/**
 * The opt-in check against a real Herdr installation.
 *
 * Skipped unless `OMNITERM_HERDR_E2E=1`, because it writes the Herdr config of whoever
 * runs it. It restores that file itself - byte for byte, and it removes the file again if
 * there was none - and it asserts the restore, so a failure here leaves its own evidence
 * rather than a surprise.
 */
const binary = findHerdrBinary();
const enabled = process.env.OMNITERM_HERDR_E2E === '1' && Boolean(binary);
const keys = { autoSwitch: true, darkName: 'terminal', lightName: 'terminal' };

describe.skipIf(!enabled)('Herdr integration (opt-in, real installation)', () => {
  it('writes the theme keys into the config Herdr itself reports, validates them, and reverts exactly', async () => {
    const configPath = await resolveHerdrConfigPath(binary);
    const backupPath = backupPathFor(configPath);
    const existedBefore = fs.existsSync(configPath);
    const before = existedBefore ? fs.readFileSync(configPath, 'utf8') : '';
    // A previous opt-in run can leave a backup behind; start from a known state rather than
    // failing on someone else's leftovers.
    fs.rmSync(backupPath, { force: true });

    const written = await applyHerdrTheme(keys);
    expect(written.ok).toBe(true);
    expect(written.validated).toBe(true);
    expect(written.configPath).toBe(configPath);
    // With a server running, the change is applied live; without one, the adapter says so
    // instead of pretending.
    const probe = await readHerdrStatus();
    expect(written.reloaded).toBe(probe.serverRunning);
    if (!probe.serverRunning) expect(written.note || '').toContain('next time it starts');

    const after = fs.readFileSync(configPath, 'utf8');
    expect(after).toContain('auto_switch = true');
    expect(after).toContain('dark_name = "terminal"');
    expect(after).toContain('light_name = "terminal"');
    // The backup is the file as it was, kept for the way back.
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, 'utf8')).toBe(before);

    const status = await readHerdrStatus();
    expect(status.theme).toEqual({ autoSwitch: true, darkName: 'terminal', lightName: 'terminal' });

    const reverted = await revertHerdrTheme();
    expect(reverted.ok).toBe(true);
    if (existedBefore) {
      expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
    } else {
      expect(fs.existsSync(configPath)).toBe(false);
    }

    // Leave the machine as it was found, backup included.
    if (!existedBefore) fs.rmSync(backupPath, { force: true });
  });

  it('refuses to leave a config Herdr rejects, and rolls back', async () => {
    const configPath = await resolveHerdrConfigPath(binary);
    const backupPath = backupPathFor(configPath);
    const existedBefore = fs.existsSync(configPath);
    const before = existedBefore ? fs.readFileSync(configPath, 'utf8') : '';
    fs.rmSync(backupPath, { force: true });

    // Valid TOML is not the point here: this file has a syntax error my writer does not
    // touch, so the failure comes from Herdr's own check rather than from anything else.
    const broken = '[theme]\nname = "nord"\n\n[terminal]\nshell = = broken\n';
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, broken);

    const result = await applyHerdrTheme(keys);
    expect(result.ok).toBe(false);
    expect(result.rolledBack).toBe(true);
    // The file is exactly as it was before the attempt - a rejected change is not left behind.
    expect(fs.readFileSync(configPath, 'utf8')).toBe(broken);
    // And this is how we know the check read the file we wrote, rather than passing on an
    // empty directory somewhere else.
    expect(result.error).toBeTruthy();

    // Put it back the way it was, then clean up after ourselves.
    if (existedBefore) fs.writeFileSync(configPath, before);
    else fs.rmSync(configPath, { force: true });
    fs.rmSync(backupPath, { force: true });
  });
});

afterAll(() => {
  if (enabled) return;
  // Nothing to clean: the suite above never ran.
});
