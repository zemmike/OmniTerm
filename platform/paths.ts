import path from 'node:path';
import type { PlatformName } from './types';

export interface DataDirOptions {
  platform: PlatformName;
  home: string;
  env: NodeJS.ProcessEnv;
}

export function resolveDataDir({ platform, home, env }: DataDirOptions): string {
  if (env.OMNITERM_DATA_DIR) return env.OMNITERM_DATA_DIR;

  if (platform === 'win32') {
    return path.win32.join(env.APPDATA || path.win32.join(home, 'AppData', 'Roaming'), 'OmniTerm');
  }
  if (platform === 'darwin') {
    return path.posix.join(home, 'Library', 'Application Support', 'OmniTerm');
  }
  return path.posix.join(env.XDG_DATA_HOME || path.posix.join(home, '.local', 'share'), 'omniterm');
}
