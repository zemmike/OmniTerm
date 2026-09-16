import { describe, expect, it } from 'vitest';
import { normalizeSizes, resizeNeighbours, PANE_MIN_FRACTION } from '../src/splitSizes';

describe('normalizeSizes', () => {
  it('gives equal panes when nothing is stored', () => {
    expect(normalizeSizes(2)).toEqual([0.5, 0.5]);
    expect(normalizeSizes(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('renormalises stored sizes so they always sum to 1', () => {
    expect(normalizeSizes(2, [3, 1])).toEqual([0.75, 0.25]);
  });

  it('falls back to equal panes when the stored list is the wrong length', () => {
    // Exactly what a closed pane leaves behind.
    expect(normalizeSizes(2, [0.7, 0.2, 0.1])).toEqual([0.5, 0.5]);
  });

  it('refuses garbage rather than rendering a broken layout', () => {
    expect(normalizeSizes(2, [Number.NaN, 0.5])).toEqual([0.5, 0.5]);
    expect(normalizeSizes(2, [0, 0])).toEqual([0.5, 0.5]);
    expect(normalizeSizes(2, [-1, 2])).toEqual([0.5, 0.5]);
  });

  it('handles a single pane and an empty layout', () => {
    expect(normalizeSizes(1)).toEqual([1]);
    expect(normalizeSizes(0)).toEqual([]);
  });
});

describe('resizeNeighbours', () => {
  it('moves only the two panes either side of the divider', () => {
    const sizes = [0.25, 0.25, 0.25, 0.25];
    const next = resizeNeighbours(sizes, 1, 0.1);
    expect(next[0]).toBeCloseTo(0.25); // untouched
    expect(next[1]).toBeCloseTo(0.35);
    expect(next[2]).toBeCloseTo(0.15);
    expect(next[3]).toBeCloseTo(0.25); // untouched
    expect(next.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('never lets a pane go below the minimum, however hard it is dragged', () => {
    const next = resizeNeighbours([0.5, 0.5], 0, 10);
    expect(next[1]).toBeCloseTo(PANE_MIN_FRACTION);
    expect(next[0]).toBeCloseTo(1 - PANE_MIN_FRACTION);
  });

  it('clamps in the other direction too', () => {
    const next = resizeNeighbours([0.5, 0.5], 0, -10);
    expect(next[0]).toBeCloseTo(PANE_MIN_FRACTION);
    expect(next[1]).toBeCloseTo(1 - PANE_MIN_FRACTION);
  });

  it('does nothing at the ends, where there is no divider', () => {
    const sizes = [0.5, 0.5];
    expect(resizeNeighbours(sizes, -1, 0.2)).toBe(sizes);
    expect(resizeNeighbours(sizes, 1, 0.2)).toBe(sizes);
  });

  it('keeps the total at 1 across a long sequence of drags', () => {
    let sizes = normalizeSizes(3);
    for (let i = 0; i < 200; i += 1) {
      sizes = resizeNeighbours(sizes, i % 2, i % 3 === 0 ? 0.03 : -0.02);
    }
    expect(sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(PANE_MIN_FRACTION - 1e-9);
  });
});
