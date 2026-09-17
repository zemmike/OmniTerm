import { describe, expect, it } from 'vitest';
import electronDataDir from '../platform/electron-data-dir.cjs';

const { resolveElectronDataDir } = electronDataDir;

describe('resolveElectronDataDir', () => {
  it('preserves an inherited explicit data directory', () => {
    expect(
      resolveElectronDataDir({
        platform: 'win32',
        home: 'C:\\Users\\m',
        userData: 'C:\\Users\\m\\AppData\\Roaming\\OmniTerm',
        env: { OMNITERM_DATA_DIR: 'D:\\OmniTerm Data' },
        existsSync: () => false,
      }),
    ).toBe('D:\\OmniTerm Data');
  });

  it('keeps an existing Linux legacy data directory in place', () => {
    expect(
      resolveElectronDataDir({
        platform: 'linux',
        home: '/home/m',
        userData: '/home/m/.config/OmniTerm',
        env: {},
        existsSync: (candidate: string) => candidate === '/home/m/.local/share/omniterm',
      }),
    ).toBe('/home/m/.local/share/omniterm');
  });

  it('uses Electron userData when Linux has no explicit or existing legacy directory', () => {
    expect(
      resolveElectronDataDir({
        platform: 'linux',
        home: '/home/m',
        userData: '/home/m/.config/OmniTerm',
        env: {},
        existsSync: () => false,
      }),
    ).toBe('/home/m/.config/OmniTerm');
  });
});
