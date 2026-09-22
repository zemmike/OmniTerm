export type ColorScheme = 'dark' | 'light';

/**
 * Relative luminance of a #rrggbb colour (WCAG 2.1), 0 for black and 1 for white.
 *
 * The channel weights are the perceptual ones: green carries most of the brightness, so
 * weighting the channels equally would call a saturated green background "light".
 */
export function relativeLuminance(hex: string): number {
  const value = (hex || '').trim().replace(/^#/, '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0;
  const channel = (i: number) => {
    const srgb = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Which scheme a background colour represents. Unparseable colours count as dark. */
export function schemeForBackground(background: string): ColorScheme {
  return relativeLuminance(background) > 0.5 ? 'light' : 'dark';
}

/**
 * The report a terminal sends when it is asked about its colour scheme (`CSI ? 996 n`),
 * and when the scheme changes while a program has asked to be told (`DECSET 2031`).
 *
 * 997;1 is dark and 997;2 is light; the payload is deliberately only "re-ask", so a
 * program that receives it re-issues its OSC 10/11 probe instead of trusting a value the
 * terminal would otherwise have to keep in sync.
 */
export function colorSchemeReport(scheme: ColorScheme): string {
  return scheme === 'dark' ? '\u001b[?997;1n' : '\u001b[?997;2n';
}
