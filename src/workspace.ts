import type { TerminalTab } from './types';

export interface PersistedPane {
  id: string;
  sessionId: string;
  title: string;
}

export interface PersistedLayout {
  panes: PersistedPane[];
  orientation: 'vertical' | 'horizontal';
  activeId: string;
  /**
   * Pane sizes as fractions of the split, summing to 1. Optional: layouts written
   * before this existed (and any layout whose pane count changed) fall back to
   * equal panes.
   */
  sizes?: number[];
}

export interface TerminalWorkspace {
  version: 1;
  activeTabId: string;
  tabs: TerminalTab[];
  layouts: Record<string, PersistedLayout>;
}

export const WORKSPACE_KEY = 'omniterm_terminal_workspace_v1';
const MAX_TABS = 20;
const MAX_PANES = 6;

const text = (value: unknown, max = 4096) => (typeof value === 'string' ? value.slice(0, max) : '');

/**
 * Treat localStorage as untrusted input. A malformed or stale snapshot should
 * never stop the terminal from opening, create an unbounded number of panes,
 * or reconnect to session identifiers outside the backend's 64-byte limit.
 */
export function parseWorkspace(raw: string | null): TerminalWorkspace | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TerminalWorkspace>;
    if (value.version !== 1 || !Array.isArray(value.tabs) || !value.layouts) return null;

    const seenTabs = new Set<string>();
    const tabs = value.tabs.slice(0, MAX_TABS).flatMap((candidate) => {
      const tab = candidate as Partial<TerminalTab>;
      const id = text(tab.id, 64);
      if (!id || seenTabs.has(id)) return [];
      seenTabs.add(id);
      return [
        {
          id,
          title: text(tab.title, 120) || 'Terminal',
          osPreset: 'linux' as const,
          environment: 'local' as const,
          cwd: text(tab.cwd),
          history: [],
          colorTheme: text(tab.colorTheme, 64) || 'matrix',
          activePluginIds: [],
        },
      ];
    });
    if (!tabs.length) return null;

    const layouts: Record<string, PersistedLayout> = {};
    const seenSessions = new Set<string>();
    for (const tab of tabs) {
      const candidate = (value.layouts as Record<string, Partial<PersistedLayout>>)[tab.id];
      if (!candidate || !Array.isArray(candidate.panes)) continue;
      const panes = candidate.panes.slice(0, MAX_PANES).flatMap((candidatePane) => {
        const pane = candidatePane as Partial<PersistedPane>;
        const sessionId = text(pane.sessionId, 64);
        if (!sessionId || seenSessions.has(sessionId)) return [];
        seenSessions.add(sessionId);
        return [
          {
            id: text(pane.id, 64) || sessionId,
            sessionId,
            title: text(pane.title, 120) || 'shell',
          },
        ];
      });
      if (!panes.length) continue;
      const activeId = panes.some((pane) => pane.sessionId === candidate.activeId)
        ? String(candidate.activeId)
        : panes[0].sessionId;
      // Only keep sizes that describe exactly these panes and are usable numbers;
      // anything else is dropped rather than loaded into a broken layout.
      const rawSizes = Array.isArray(candidate.sizes) ? candidate.sizes : null;
      const sizes =
        rawSizes &&
        rawSizes.length === panes.length &&
        rawSizes.every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
          ? rawSizes
          : undefined;

      layouts[tab.id] = {
        panes,
        orientation: candidate.orientation === 'horizontal' ? 'horizontal' : 'vertical',
        activeId,
        ...(sizes ? { sizes } : {}),
      };
    }

    const activeTabId = tabs.some((tab) => tab.id === value.activeTabId)
      ? String(value.activeTabId)
      : tabs[0].id;
    return { version: 1, activeTabId, tabs, layouts };
  } catch {
    return null;
  }
}

export function loadWorkspace(): TerminalWorkspace | null {
  try {
    return parseWorkspace(localStorage.getItem(WORKSPACE_KEY));
  } catch {
    return null;
  }
}

export function saveWorkspace(workspace: TerminalWorkspace): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  } catch {
    // Private browsing, a full quota, or a disabled store must not affect PTYs.
  }
}
