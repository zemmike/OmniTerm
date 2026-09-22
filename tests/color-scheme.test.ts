import { describe, expect, it } from 'vitest';
import { colorSchemeReport, relativeLuminance, schemeForBackground } from '../src/colorScheme';

describe('relativeLuminance', () => {
  it('puts black at 0 and white at 1', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('weights the channels perceptually', () => {
    // Equal-weighted channels would score yellow around a third; perceptually it is
    // almost white, which is what makes it a light background.
    expect(relativeLuminance('#ffff00')).toBeGreaterThan(0.8);
    expect(relativeLuminance('#0000ff')).toBeLessThan(0.1);
  });

  it('accepts shorthand and rejects nonsense without throwing', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('not-a-colour')).toBe(0);
    expect(relativeLuminance('')).toBe(0);
  });
});

describe('schemeForBackground', () => {
  it('reads the shipped dark themes as dark', () => {
    for (const background of ['#0A0A0B', '#0F0F10', '#191A21', '#1E1F29', '#2E3440', '#002B36']) {
      expect(schemeForBackground(background)).toBe('dark');
    }
  });

  it('reads the paper theme as light', () => {
    expect(schemeForBackground('#FFFFFF')).toBe('light');
    expect(schemeForBackground('#fdf6e3')).toBe('light');
  });

  it('treats an unparseable colour as dark', () => {
    expect(schemeForBackground('')).toBe('dark');
  });
});

describe('colorSchemeReport', () => {
  it('reports dark as 997;1 and light as 997;2', () => {
    expect(colorSchemeReport('dark')).toBe('\u001b[?997;1n');
    expect(colorSchemeReport('light')).toBe('\u001b[?997;2n');
  });
});
