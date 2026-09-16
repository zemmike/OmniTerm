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
