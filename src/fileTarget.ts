/**
 * Small pure helpers for the Files tab.
 *
 * Both exist because of real failures: a clicked terminal path can carry trailing
 * punctuation from the sentence it appeared in, and the panel divider needs a
 * single clamped source of truth instead of three magic numbers.
 */

/**
 * Clean up a path that came from terminal output.
 *
 * A path in a sentence often arrives with the punctuation that followed it
 * ("see /etc/hosts," or "/var/log/syslog."), and some shells print `~`. Stripping
 * that here means the rest of the pipeline never has to guess.
 */
export function normalizeTargetPath(raw: string): string {
  let value = (raw || '').trim();
  if (!value) return value;

  // Strip wrapping quotes first, then trailing sentence punctuation.
  value = value.replace(/^['"`<]+/, '').replace(/['"`>]+$/, '');
  value = value.replace(/[.,;:!?)\]]+$/, '');

  // Collapse duplicate slashes, but never inside a leading "//".
  value = value.replace(/([^:])\/{2,}/g, '$1/');
  return value;
}

/** The last path segment, without needing node:path in the renderer. */
export function basenameOf(path: string): string {
  const clean = (path || '').replace(/\/+$/, '');
  const slash = clean.lastIndexOf('/');
  return slash === -1 ? clean : clean.slice(slash + 1);
}

/** The folder a path lives in, or '/' for a top-level entry. */
export function dirnameOf(path: string): string {
  const slash = (path || '').lastIndexOf('/');
  if (slash <= 0) return '/';
  return path.slice(0, slash);
}

export const LIST_PANEL_MIN = 240;
export const LIST_PANEL_MAX = 720;
export const LIST_PANEL_DEFAULT = 384;

/** Keep the file-list panel inside a sane range whatever the pointer does. */
export function clampListWidth(width: number): number {
  if (!Number.isFinite(width)) return LIST_PANEL_DEFAULT;
  return Math.max(LIST_PANEL_MIN, Math.min(LIST_PANEL_MAX, Math.round(width)));
}

/**
 * Strip a line/column suffix that came along with the path.
 *
 * Agents and compilers print `src/app.ts:42` and `src/app.ts:42:7`, and some print
 * `src/app.ts(42,7)`. The suffix is useful information but it is not part of the
 * filename, and leaving it on is why those clicks could not be resolved.
 */
export function stripLineSuffix(path: string): string {
  return path.replace(/:(\d+)(:\d+)?$/, '').replace(/\((\d+)(,\d+)?\)$/, '');
}

/** Expand a leading `~`, which shells and agents print but the API cannot resolve. */
export function expandTilde(path: string, home?: string): string {
  if (!path.startsWith('~') || !home) return path;
  if (path === '~') return home;
  if (path.startsWith('~/')) return `${home.replace(/\/+$/, '')}${path.slice(1)}`;
  return path;
}

/**
 * Turn whatever a terminal printed into a path the API can open.
 *
 * The order matters: sentence punctuation first (a trailing `:` from prose must not
 * survive), then the line suffix, then `~`, then the relative-to-absolute step. A
 * relative path is the shape agents most often print and the reason clicks failed -
 * it was being sent to a local API that only understands absolute paths.
 */
export function resolveTargetPath(
  raw: string,
  options: { base?: string; home?: string } = {},
): string {
  let value = stripLineSuffix(normalizeTargetPath(raw));
  value = expandTilde(value, options.home);
  if (!value || value.startsWith('/')) return value;
  const base = (options.base || '').replace(/\/+$/, '');
  if (!base) return value;
  return `${base}/${value.replace(/^\.\//, '')}`;
}
