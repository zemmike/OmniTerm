import { describe, expect, it } from 'vitest';
import { parseWorkspace } from '../src/workspace';

const tab = (id: string) => ({
  id,
  title: `Tab ${id}`,
  osPreset: 'linux',
  environment: 'local',
  cwd: `/tmp/${id}`,
  history: ['must not persist'],
  colorTheme: 'matrix',
  activePluginIds: ['must-not-persist'],
});

describe('terminal workspace persistence', () => {
  it('restores validated tabs and pane topology without command history', () => {
    const result = parseWorkspace(
      JSON.stringify({
        version: 1,
        activeTabId: 'two',
        tabs: [tab('one'), tab('two')],
        layouts: {
          one: {
            panes: [{ id: 'p1', sessionId: 's1', title: 'shell' }],
            orientation: 'vertical',
            activeId: 's1',
          },
          two: {
            panes: [{ id: 'p2', sessionId: 's2', title: 'shell' }],
            orientation: 'horizontal',
            activeId: 's2',
          },
        },
      }),
    );
    expect(result?.activeTabId).toBe('two');
    expect(result?.layouts.two.orientation).toBe('horizontal');
    expect(result?.tabs[0].history).toEqual([]);
    expect(result?.tabs[0].activePluginIds).toEqual([]);
  });

  it('rejects malformed snapshots and repairs invalid active ids', () => {
    expect(parseWorkspace('{nope')).toBeNull();
    expect(parseWorkspace(JSON.stringify({ version: 2, tabs: [], layouts: {} }))).toBeNull();
    const result = parseWorkspace(
      JSON.stringify({
        version: 1,
        activeTabId: 'missing',
        tabs: [tab('one')],
        layouts: {
          one: {
            panes: [{ id: 'p1', sessionId: 's1', title: 'shell' }],
            orientation: 'sideways',
            activeId: 'missing',
          },
        },
      }),
    );
    expect(result?.activeTabId).toBe('one');
    expect(result?.layouts.one.activeId).toBe('s1');
    expect(result?.layouts.one.orientation).toBe('vertical');
  });

  it('bounds restored tabs, panes, and identifier lengths', () => {
    const tabs = Array.from({ length: 30 }, (_, i) => tab(`tab-${i}`));
    const panes = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      sessionId: `s${i}`.repeat(80),
      title: 'shell',
    }));
    const result = parseWorkspace(
      JSON.stringify({
        version: 1,
        activeTabId: 'tab-0',
        tabs,
        layouts: { 'tab-0': { panes, orientation: 'vertical', activeId: panes[0].sessionId } },
      }),
    );
    expect(result?.tabs).toHaveLength(20);
    expect(result?.layouts['tab-0'].panes).toHaveLength(6);
    expect(result?.layouts['tab-0'].panes[0].sessionId.length).toBeLessThanOrEqual(64);
  });
});
