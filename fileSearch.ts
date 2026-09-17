/**
 * Find files by name under a directory.
 *
 * The Files tab could only filter the folder it was already showing, which is useless
 * for the actual question ("where is that file?"). This walks subdirectories instead.
 *
 * It is written to stay bounded rather than to be exhaustive: a local UI must not hang
 * because someone searched from their home directory. Three limits, all of them
 * reported to the caller instead of silently truncating:
 *   - a result cap, so the list stays renderable
 *   - a visited-entry cap, so a huge tree cannot run forever
 *   - a depth cap, plus skipping the directories that are never what someone means
 *     (`node_modules`, `.git`, build output, virtualenvs)
 */

import fs from 'fs';
import path from 'path';

export interface SearchHit {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface SearchResult {
  root: string;
  query: string;
  results: SearchHit[];
  /** Entries examined; a crude but honest measure of the work done. */
  visited: number;
  /** True when a cap was hit, so the caller can say so rather than imply completion. */
  truncated: boolean;
  /** Which cap was hit, for the UI message. */
  limitReached: 'results' | 'visited' | 'depth' | null;
}

export const SEARCH_MAX_RESULTS = 200;
export const SEARCH_MAX_VISITED = 20000;
export const SEARCH_MAX_DEPTH = 8;

/** Directories that are never what someone searching by name is looking for. */
export const SEARCH_SKIP = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.next',
  '.nuxt',
  '.turbo',
  'coverage',
]);

export interface SearchOptions {
  maxResults?: number;
  maxVisited?: number;
  maxDepth?: number;
}

export function searchDirectory(
  root: string,
  query: string,
  options: SearchOptions = {},
): SearchResult {
  const maxResults = options.maxResults ?? SEARCH_MAX_RESULTS;
  const maxVisited = options.maxVisited ?? SEARCH_MAX_VISITED;
  const maxDepth = options.maxDepth ?? SEARCH_MAX_DEPTH;

  const needle = (query || '').toLowerCase();
  const result: SearchResult = {
    root,
    query,
    results: [],
    visited: 0,
    truncated: false,
    limitReached: null,
  };
  if (!needle) return result;

  const stop = (limit: 'results' | 'visited' | 'depth') => {
    result.truncated = true;
    result.limitReached = result.limitReached ?? limit;
  };

  const walk = (dir: string, depth: number) => {
    if (result.limitReached) return;
    if (depth > maxDepth) {
      stop('depth');
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // Unreadable directory (permissions, races): skip it, keep searching.
      return;
    }
    for (const entry of entries) {
      if (result.limitReached) return;
      result.visited += 1;
      if (result.visited > maxVisited) {
        stop('visited');
        return;
      }

      const full = path.join(dir, entry.name);
      const isDirectory = entry.isDirectory();
      if (entry.name.toLowerCase().includes(needle)) {
        let size = 0;
        if (!isDirectory) {
          try {
            size = fs.statSync(full).size;
          } catch {
            size = 0;
          }
        }
        result.results.push({ name: entry.name, path: full, isDirectory, size });
        if (result.results.length >= maxResults) {
          stop('results');
          return;
        }
      }

      if (isDirectory && !SEARCH_SKIP.has(entry.name)) walk(full, depth + 1);
    }
  };

  try {
    if (!fs.statSync(root).isDirectory()) return result;
  } catch {
    return result;
  }
  walk(root, 0);
  return result;
}
