import { describe, expect, it } from 'vitest';
import { createPreOpenMessageQueue } from '../src/socketQueue';

describe('pre-open terminal message queue', () => {
  it('sends the session start before history and input queued during startup', () => {
    const delivered: string[] = [];
    const queue = createPreOpenMessageQueue<string>((message) => delivered.push(message));
    queue.send('history');
    queue.send('input');
    expect(delivered).toEqual([]);
    queue.open('start');
    expect(delivered).toEqual(['start', 'history', 'input']);
    queue.send('resize');
    expect(delivered).toEqual(['start', 'history', 'input', 'resize']);
  });

  it('does not emit a duplicate start frame', () => {
    const delivered: string[] = [];
    const queue = createPreOpenMessageQueue<string>((message) => delivered.push(message));
    queue.open('start');
    queue.open('start-again');
    expect(delivered).toEqual(['start']);
  });
});
