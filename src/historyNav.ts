/**
 * Up/Down history navigation, as pure logic.
 *
 * The key handler in TerminalPane is hard to test directly (it needs a live PTY,
 * a WebSocket and an xterm instance), so the decisions live here where they can
 * be exercised exhaustively. Two behaviours matter and both were wrong before:
 *
 * 1. With an empty line, Up/Down must walk the whole history. The old handler
 *    handed an empty line to the shell ("plain shell history"), which does nothing
 *    when the prompt is a fresh integration rcfile with no prior history loaded.
 * 2. The first press must show something. The history list is fetched over the
 *    WebSocket, so the old code consumed the first press, learned nothing, and
 *    silently dropped it — the press had to be repeated to see any effect.
 */

export type HistoryAction =
  | { kind: 'pass' }
  | { kind: 'request'; prefix: string; direction: -1 | 1 }
  | { kind: 'step'; direction: -1 | 1 };

export interface HistoryKeyInput {
  /** The key that was pressed. Anything other than ArrowUp/ArrowDown is passed on. */
  key: string;
  /** Whether prefix history is enabled in settings at all. */
  enabled: boolean;
  /** Ctrl, Alt, Meta or Shift held — the shell's own bindings win. */
  modifierHeld: boolean;
  /**
   * A full-screen program (vim, less, htop) owns the screen. Arrow keys belong to
   * it, and hijacking them is how a terminal becomes unusable.
   */
  altScreen: boolean;
  /** The line currently under the cursor, trimmed. */
  prefix: string;
  /** How many history entries are already cached for this prefix. */
  cachedCount: number;
}

/**
 * Decide what an arrow key should do. Pure: no DOM, no timers, no side effects.
 */
export function decideHistoryKey(input: HistoryKeyInput): HistoryAction {
  const { key, enabled, modifierHeld, altScreen, prefix, cachedCount } = input;

  if (!enabled || modifierHeld || altScreen) return { kind: 'pass' };
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return { kind: 'pass' };

  const direction: -1 | 1 = key === 'ArrowUp' ? -1 : 1;

  // Already have a list for this prefix (or for the empty line): move in it.
  if (cachedCount > 0) return { kind: 'step', direction };

  // Nothing cached yet — ask for the whole history when the line is empty, or for
  // the matching entries when the user has typed a prefix. The direction travels
  // with the request so the answer can be applied straight away instead of being
  // thrown away as the old code did.
  return { kind: 'request', prefix, direction };
}

/**
 * Where a step lands.
 *
 * Returns the new index, or `null` when the walk has run past the newest entry —
 * the caller then restores the line the user started from. `count === 0` is also
 * `null` because there is nothing to show.
 */
export function stepIndex(current: number, direction: -1 | 1, count: number): number | null {
  if (count <= 0) return null;
  const next = current + (direction === -1 ? 1 : -1);
  // Past either end: null means "hand the line back to the user". Clamping here
  // would make Down at the newest entry look dead.
  if (next < 0 || next > count - 1) return null;
  return next;
}
