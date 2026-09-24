import { describe, expect, it } from 'vitest';
import { stripBracketedPasteMarkers } from '../pty';

describe('stripBracketedPasteMarkers', () => {
  it('removes the paste markers and keeps the text', () => {
    expect(stripBracketedPasteMarkers('\x1b[200~hello\nworld\x1b[201~')).toBe('hello\nworld');
  });
  it('leaves other input alone', () => {
    expect(stripBracketedPasteMarkers('\x1b[A ls\r')).toBe('\x1b[A ls\r');
  });
});
