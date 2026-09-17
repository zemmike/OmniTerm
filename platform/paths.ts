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

export function decodeFileUriPath(value: string, platform: PlatformName): string | null {
  try {
    const uri = new URL(value);
    if (uri.protocol !== 'file:') return null;
    const pathname = decodeURIComponent(uri.pathname);

    if (platform !== 'win32') return pathname;
    if (/^\/[A-Za-z]:\//.test(pathname)) {
      return pathname.slice(1).replace(/\//g, '\\');
    }
    if (pathname.startsWith('//')) {
      return `\\\\${pathname.slice(2).replace(/\//g, '\\')}`;
    }
    if (uri.hostname) {
      return `\\\\${uri.hostname}${pathname.replace(/\//g, '\\')}`;
    }
    return pathname.replace(/\//g, '\\');
  } catch {
    return null;
  }
}
