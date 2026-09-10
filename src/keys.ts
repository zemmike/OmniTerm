import { getSettings } from './settings';

/**
 * Every app-level shortcut lives here, so the Settings tab can list them and
 * re-record them without any component hard-coding a key combination.
 * Bindings are stored as 'Ctrl+Shift+E' strings.
 */
export interface ActionDef {
  id: string;
  label: string;
  group: 'Tabs' | 'Panes' | 'Clipboard' | 'Terminal' | 'App';
  def: string;
}

export const ACTIONS: ActionDef[] = [
  { id: 'newTab', label: 'New tab', group: 'Tabs', def: 'Ctrl+Shift+T' },
  { id: 'closeTab', label: 'Close tab', group: 'Tabs', def: 'Ctrl+W' },
  { id: 'nextTab', label: 'Next tab', group: 'Tabs', def: 'Ctrl+Tab' },
  { id: 'prevTab', label: 'Previous tab', group: 'Tabs', def: 'Ctrl+Shift+Tab' },
  { id: 'splitRight', label: 'Split pane right (vertical)', group: 'Panes', def: 'Ctrl+Shift+E' },
  { id: 'splitDown', label: 'Split pane down (horizontal)', group: 'Panes', def: 'Ctrl+Shift+O' },
  { id: 'closePane', label: 'Close pane', group: 'Panes', def: 'Ctrl+Shift+W' },
  { id: 'focusPaneLeft', label: 'Focus pane left', group: 'Panes', def: 'Ctrl+Shift+ArrowLeft' },
  { id: 'focusPaneRight', label: 'Focus pane right', group: 'Panes', def: 'Ctrl+Shift+ArrowRight' },
  { id: 'focusPaneUp', label: 'Focus pane up', group: 'Panes', def: 'Ctrl+Shift+ArrowUp' },
  { id: 'focusPaneDown', label: 'Focus pane down', group: 'Panes', def: 'Ctrl+Shift+ArrowDown' },
  { id: 'copy', label: 'Copy selection', group: 'Clipboard', def: 'Ctrl+Shift+C' },
  { id: 'paste', label: 'Paste', group: 'Clipboard', def: 'Ctrl+Shift+V' },
  { id: 'selectAll', label: 'Select all', group: 'Clipboard', def: 'Ctrl+Shift+A' },
  { id: 'search', label: 'Search the scrollback', group: 'Terminal', def: 'Ctrl+Shift+F' },
  { id: 'clear', label: 'Clear the screen', group: 'Terminal', def: 'Ctrl+Shift+K' },
  {
    id: 'prevPrompt',
    label: 'Jump to previous prompt',
    group: 'Terminal',
    def: 'Ctrl+Shift+PageUp',
  },
  { id: 'nextPrompt', label: 'Jump to next prompt', group: 'Terminal', def: 'Ctrl+Shift+PageDown' },
  { id: 'fontUp', label: 'Increase font size', group: 'Terminal', def: 'Ctrl+=' },
  { id: 'fontDown', label: 'Decrease font size', group: 'Terminal', def: 'Ctrl+-' },
  { id: 'fontReset', label: 'Reset font size', group: 'Terminal', def: 'Ctrl+0' },
  { id: 'settings', label: 'Open settings', group: 'App', def: 'Ctrl+,' },
];

function normaliseKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  const map: Record<string, string> = {
    ' ': 'Space',
    Esc: 'Escape',
    Del: 'Delete',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
  };
  return map[key] || key;
}

/** 'Ctrl+Shift+E' for a keyboard event, or '' for modifier-only presses. */
export function bindingFromEvent(e: KeyboardEvent): string {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return '';
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  parts.push(normaliseKey(e.key));
  return parts.join('+');
}

export function formatBinding(binding: string): string {
  return binding.split('+').join(' + ');
}

export function bindingFor(actionId: string): string {
  const custom = getSettings().shortcuts[actionId];
  if (custom !== undefined) return custom;
  return ACTIONS.find((a) => a.id === actionId)?.def || '';
}

export function isDefault(actionId: string): boolean {
  return getSettings().shortcuts[actionId] === undefined;
}

/** Which action, if any, this event triggers. */
export function actionForEvent(e: KeyboardEvent): string | null {
  const pressed = bindingFromEvent(e);
  if (!pressed) return null;
  for (const action of ACTIONS) {
    const binding = bindingFor(action.id);
    if (binding && binding === pressed) return action.id;
  }
  return null;
}

/** Human-readable conflicts for the settings UI ("also used by …"). */
export function conflictsFor(actionId: string): string[] {
  const binding = bindingFor(actionId);
  if (!binding) return [];
  return ACTIONS.filter((a) => a.id !== actionId && bindingFor(a.id) === binding).map(
    (a) => a.label,
  );
}
