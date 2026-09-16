/**
 * Pane sizes for a split layout, as pure maths.
 *
 * Panes are stored as fractions that sum to 1 so a split survives a window resize
 * or a tab switch without renegotiating pixel values. Two rules matter and are the
 * reason this is not inlined into the component:
 *
 * - a pane can never be dragged below a usable minimum, and
 * - dragging one boundary must never move the other boundaries, so only the two
 *   panes either side of the divider ever change.
 */

/** No pane may be dragged smaller than this share of the split. */
export const PANE_MIN_FRACTION = 0.12;

function equal(count: number): number[] {
  if (count <= 0) return [];
  return new Array(count).fill(1 / count);
}

/**
 * Coerce whatever is stored into something renderable.
 *
 * Missing, malformed, or stale sizes (a pane was closed, so the saved list is the
 * wrong length) fall back to equal panes rather than producing a broken layout.
 */
export function normalizeSizes(count: number, sizes?: number[] | null): number[] {
  if (count <= 0) return [];
  if (!Array.isArray(sizes) || sizes.length !== count) return equal(count);

  // One unusable number makes the whole set unusable: dropping just that pane to
  // zero (or clamping it) would render a pane of no width, which is worse than
  // starting from equal panes.
  if (sizes.some((value) => !Number.isFinite(value) || value <= 0)) return equal(count);
  const total = sizes.reduce((sum, value) => sum + value, 0);
  return sizes.map((value) => value / total);
}

/**
 * Move the divider after pane `index` by `delta` (a fraction of the whole split,
 * positive meaning "grow the pane to the left").
 *
 * Both neighbours are clamped to `PANE_MIN_FRACTION`; if the requested move cannot
 * be honoured in full, it is reduced to whatever is possible, so a drag never
 * produces an unusable pane or a layout that no longer sums to 1.
 */
export function resizeNeighbours(
  sizes: number[],
  index: number,
  delta: number,
  min = PANE_MIN_FRACTION,
): number[] {
  if (index < 0 || index >= sizes.length - 1) return sizes;
  const left = sizes[index];
  const right = sizes[index + 1];
  const pair = left + right;

  // Never let a drag push either pane under the minimum, and never let it exceed
  // the space the pair actually shares.
  const lowerBound = min - left;
  const upperBound = pair - min - left;
  const applied = Math.max(lowerBound, Math.min(upperBound, delta));

  const next = [...sizes];
  next[index] = left + applied;
  next[index + 1] = right - applied;
  return next;
}

/** Keyboard equivalent: nudge one boundary by a fixed step. */
export const PANE_KEY_STEP = 0.02;
