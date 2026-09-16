/**
 * Up/Down history navigation.
 *
 * The bug these cover: with an empty line, the handler used to hand the key to
 * the shell, so Up did nothing at all, and even with a prefix the first press was
 * silently dropped while the history request was in flight.
 */
import { describe, expect, it } from 'vitest';
import { decideHistoryKey, stepIndex } from '../src/historyNav';

const base = {
  key: 'ArrowUp',
  enabled: true,
  modifierHeld: false,
  interactiveProgram: false,
  prefix: '',
  cachedCount: 0,
};

describe('decideHistoryKey', () => {
  it('asks for the whole history when the line is empty', () => {
    // This is the reported bug: an empty line must walk every previous command,
    // not be passed to the shell.
    expect(decideHistoryKey({ ...base, key: 'ArrowUp' })).toEqual({
      kind: 'request',
      prefix: '',
      direction: -1,
    });
    expect(decideHistoryKey({ ...base, key: 'ArrowDown' })).toEqual({
      kind: 'request',
      prefix: '',
      direction: 1,
    });
  });

  it('asks for matching entries when a prefix is typed', () => {
    expect(decideHistoryKey({ ...base, prefix: 'git', cachedCount: 0 })).toEqual({
      kind: 'request',
      prefix: 'git',
      direction: -1,
    });
  });

  it('steps inside an already-fetched list rather than asking again', () => {
    expect(decideHistoryKey({ ...base, cachedCount: 12 })).toEqual({ kind: 'step', direction: -1 });
    expect(decideHistoryKey({ ...base, key: 'ArrowDown', cachedCount: 12 })).toEqual({
      kind: 'step',
      direction: 1,
    });
  });

  it('leaves the arrows alone while a program owns the keyboard', () => {
    // vim, less, htop: hijacking Up/Down there makes the terminal unusable.
    expect(decideHistoryKey({ ...base, interactiveProgram: true })).toEqual({ kind: 'pass' });
    expect(decideHistoryKey({ ...base, interactiveProgram: true, cachedCount: 5 })).toEqual({
      kind: 'pass',
    });
  });

  it('never steals a modified arrow key', () => {
    expect(decideHistoryKey({ ...base, modifierHeld: true })).toEqual({ kind: 'pass' });
    expect(decideHistoryKey({ ...base, modifierHeld: true, cachedCount: 5 })).toEqual({
      kind: 'pass',
    });
  });

  it('gives the arrows back the moment the program exits', () => {
    // Same empty line, same settings: only the running-program flag differs, so the
    // history walk resumes exactly as it was.
    expect(decideHistoryKey({ ...base, interactiveProgram: true }).kind).toBe('pass');
    expect(decideHistoryKey({ ...base, interactiveProgram: false }).kind).toBe('request');
  });

  it('an inline prompt that is not full-screen still keeps its arrows', () => {
    // The reported case: a CLI yes/no chooser that renders inline, so there is no
    // alternate screen and an empty line is exactly what the prompt looks like.
    const input = { ...base, key: 'ArrowUp', cachedCount: 0, interactiveProgram: true };
    expect(decideHistoryKey(input)).toEqual({ kind: 'pass' });
    expect(decideHistoryKey({ ...input, cachedCount: 12 })).toEqual({ kind: 'pass' });
  });

  it('does nothing when prefix history is switched off', () => {
    expect(decideHistoryKey({ ...base, enabled: false, cachedCount: 5 })).toEqual({ kind: 'pass' });
  });

  it('passes every other key through untouched', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'a', 'Enter', 'Tab', 'Escape']) {
      expect(decideHistoryKey({ ...base, key })).toEqual({ kind: 'pass' });
    }
  });
});

describe('stepIndex', () => {
  it('reveals the newest entry from a standing start, going up', () => {
    expect(stepIndex(-1, -1, 3)).toBe(0);
  });

  it('walks towards older entries', () => {
    expect(stepIndex(0, -1, 3)).toBe(1);
    expect(stepIndex(1, -1, 3)).toBe(2);
  });

  it('returns null past the oldest entry, which restores the typed line', () => {
    expect(stepIndex(2, -1, 3)).toBeNull();
  });

  it('returning down walks back towards the newest entry', () => {
    expect(stepIndex(2, 1, 3)).toBe(1);
    expect(stepIndex(1, 1, 3)).toBe(0);
  });

  it('returns null past the newest entry too — the line is handed back', () => {
    // The old maths clamped to 0 here, so Down at the newest entry appeared dead.
    expect(stepIndex(0, 1, 3)).toBeNull();
  });

  it('has nothing to show for an empty history', () => {
    expect(stepIndex(-1, -1, 0)).toBeNull();
    expect(stepIndex(0, 1, 0)).toBeNull();
  });

  it('never returns an index outside the list', () => {
    for (const count of [1, 2, 50]) {
      for (let current = -1; current <= count; current += 1) {
        for (const direction of [-1, 1] as const) {
          const next = stepIndex(current, direction, count);
          if (next !== null) {
            expect(next).toBeGreaterThanOrEqual(0);
            expect(next).toBeLessThanOrEqual(count - 1);
          }
        }
      }
    }
  });
});
