/**
 * Compatibility shim: the header theme menu used to keep its own palette list,
 * which drifted from the terminal's. Everything now comes from themes.ts, so
 * picking a theme in the header changes the whole window immediately.
 */
import { THEMES } from '../themes';

export const TERMINAL_THEMES: Record<string, { name: string }> = Object.fromEntries(
  THEMES.map((t) => [t.id, { name: t.label }]),
);

export type ThemeId = string;
