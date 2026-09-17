import { describe, expect, it } from 'vitest';
import { resolveDataDir } from '../platform/paths';

describe('resolveDataDir', () => {
  it('uses the exact Linux fallback when no XDG directory is configured', () => {
    expect(resolveDataDir({ platform: 'linux', home: '/home/m', env: {} })).toBe(
      '/home/m/.local/share/omniterm',
    );
  });

  it('uses the macOS Application Support directory', () => {
    expect(resolveDataDir({ platform: 'darwin', home: '/Users/m', env: {} })).toBe(
      '/Users/m/Library/Application Support/OmniTerm',
    );
  });

  it('uses the Windows roaming application-data directory', () => {
    expect(
      resolveDataDir({
        platform: 'win32',
        home: 'C:\\Users\\m',
        env: { APPDATA: 'C:\\Users\\m\\AppData\\Roaming' },
      }),
    ).toBe('C:\\Users\\m\\AppData\\Roaming\\OmniTerm');
  });

  it('prefers an explicit OmniTerm data directory on every platform', () => {
    expect(
      resolveDataDir({
        platform: 'win32',
        home: 'C:\\Users\\m',
        env: {
          APPDATA: 'C:\\Users\\m\\AppData\\Roaming',
          OMNITERM_DATA_DIR: 'D:\\OmniTerm Data',
        },
      }),
    ).toBe('D:\\OmniTerm Data');
  });

  it('honours XDG_DATA_HOME on Linux', () => {
    expect(
      resolveDataDir({
        platform: 'linux',
        home: '/home/m',
        env: { XDG_DATA_HOME: '/srv/share' },
      }),
    ).toBe('/srv/share/omniterm');
  });

  it('falls back beneath the Windows home when APPDATA is unavailable', () => {
    expect(resolveDataDir({ platform: 'win32', home: 'C:\\Users\\m', env: {} })).toBe(
      'C:\\Users\\m\\AppData\\Roaming\\OmniTerm',
    );
  });
});
