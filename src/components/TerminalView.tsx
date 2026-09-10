import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Folder, ChevronDown, GitBranch, Container, ShieldCheck, Columns2, Rows2, Terminal as TerminalIcon } from 'lucide-react';
import TerminalPane, { PaneApi } from './TerminalPane';
import { TerminalTab, OSPreset } from '../types';
import { useSettings } from '../settings';
import { actionForEvent } from '../keys';

interface Props {
  tabs: TerminalTab[];
  setTabs: React.Dispatch<React.SetStateAction<TerminalTab[]>>;
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  currentTheme?: string;
  onOpenSettings?: () => void;
}

interface PaneState {
  id: string;
  sessionId: string;
  title: string;
}

interface TabLayout {
  panes: PaneState[];
  orientation: 'vertical' | 'horizontal';
  activeId: string;
}

const LAST_DIR_KEY = 'omniterm_last_dir';
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function makeTab(cwd: string, colorTheme: string, index: number): TerminalTab {
  return {
    id: newId('tab'),
    title: `shell ${index}`,
    osPreset: 'linux',
    environment: 'local',
    cwd,
    history: [],
    colorTheme,
    activePluginIds: [],
  };
}

export default function TerminalView({ tabs, setTabs, activeTabId, setActiveTabId, onOpenSettings }: Props) {
  const [settings] = useSettings();
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const [repo, setRepo] = useState<{ isRepo: boolean; branch: string | null; changed: number; untracked: number } | null>(null);
  const [docker, setDocker] = useState<{ available: boolean; running: number } | null>(null);
  const [ptyBackend, setPtyBackend] = useState<{ available: boolean; error: string | null } | null>(null);
  const [cwdByTab, setCwdByTab] = useState<Record<string, string>>({});
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserPath, setChooserPath] = useState('');
  const [matches, setMatches] = useState<{ name: string; path: string; type: string }[]>([]);
  const shellInfo = useRef<Record<string, { shell: string; pid: number | null; integration?: string }>>({});
  const apiRef = useRef<Record<string, PaneApi>>({});
  // Element to hand focus back to when the directory chooser closes.
  const chooserReturnRef = useRef<HTMLElement | null>(null);

  // ---- pane layout, one entry per tab: a list of panes plus an orientation
  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});

  const layoutFor = useCallback(
    (tabId: string): TabLayout => {
      const existing = layouts[tabId];
      if (existing) return existing;
      const sessionId = `session-${tabId}`;
      return { panes: [{ id: newId('pane'), sessionId, title: 'shell' }], orientation: 'vertical', activeId: sessionId };
    },
    [layouts]
  );

  const activeLayout = activeTab ? layoutFor(activeTab.id) : null;
  const activeCwd = (activeTab && (cwdByTab[activeTab.id] || activeTab.cwd)) || '';

  // The app shell sizes itself with min-height, so percentage heights never
  // resolve; measure the space we actually have or the terminal gets a
  // zero-height box and renders nothing.
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootH, setRootH] = useState<number | null>(null);
  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setRootH(parent.clientHeight || null);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // ------------------------------------------------------- status bar (real)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeCwd) return;
      try {
        const [r, d] = await Promise.all([
          fetch(`/api/repo/status?path=${encodeURIComponent(activeCwd)}`).then((x) => x.json()),
          fetch('/api/docker/status').then((x) => x.json()),
        ]);
        if (!cancelled) {
          setRepo(r);
          setDocker(d);
        }
      } catch {
        /* status strip is best effort */
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeCwd]);

  useEffect(() => {
    fetch('/api/terminal/status')
      .then((r) => r.json())
      .then(setPtyBackend)
      .catch(() => setPtyBackend(null));
  }, []);

  // ------------------------------------------------------------ pane helpers
  const mutateLayout = useCallback((tabId: string, fn: (l: TabLayout) => TabLayout) => {
    setLayouts((prev) => {
      const current = prev[tabId] || layoutFor(tabId);
      return { ...prev, [tabId]: fn(current) };
    });
  }, [layoutFor]);

  const splitPane = useCallback(
    (tabId: string, orientation: 'vertical' | 'horizontal', _sourceSession?: string) => {
      mutateLayout(tabId, (l) => {
        if (l.panes.length >= 6) return l; // beyond that it stops being usable
        const sessionId = newId('session');
        return {
          panes: [...l.panes, { id: newId('pane'), sessionId, title: 'shell' }],
          orientation,
          activeId: sessionId,
        };
      });
    },
    [mutateLayout]
  );

  const closePane = useCallback(
    (tabId: string, sessionId: string) => {
      mutateLayout(tabId, (l) => {
        if (l.panes.length <= 1) return l;
        delete apiRef.current[sessionId];
        fetch('/api/terminal/kill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        }).catch(() => undefined);
        const panes = l.panes.filter((p) => p.sessionId !== sessionId);
        return { ...l, panes, activeId: panes[panes.length - 1].sessionId };
      });
    },
    [mutateLayout]
  );

  const focusPane = useCallback(
    (tabId: string, sessionId: string) => {
      mutateLayout(tabId, (l) => (l.activeId === sessionId ? l : { ...l, activeId: sessionId }));
    },
    [mutateLayout]
  );

  const focusedApi = useCallback((): PaneApi | null => {
    if (!activeTab || !activeLayout) return null;
    return apiRef.current[activeLayout.activeId] || null;
  }, [activeTab, activeLayout]);

  const registerApi = useCallback((sessionId: string, api: PaneApi | null) => {
    if (api) apiRef.current[sessionId] = api;
    else delete apiRef.current[sessionId];
  }, []);

  // ---------------------------------------------------------------- tab CRUD
  const addTab = useCallback(
    (cwd?: string) => {
      const dir = cwd || activeCwd || localStorage.getItem(LAST_DIR_KEY) || '';
      const tab = makeTab(dir, settings.theme, tabs.length + 1);
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      if (dir) localStorage.setItem(LAST_DIR_KEY, dir);
    },
    [activeCwd, setTabs, setActiveTabId, settings.theme, tabs.length]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((t) => t.id !== tabId);
        if (tabId === activeTabId && next[0]) setActiveTabId(next[0].id);
        return next;
      });
    },
    [activeTabId, setActiveTabId, setTabs]
  );

  const cycleTab = useCallback(
    (direction: -1 | 1) => {
      const index = tabs.findIndex((t) => t.id === activeTabId);
      if (index === -1) return;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      if (next) setActiveTabId(next.id);
    },
    [activeTabId, setActiveTabId, tabs]
  );

  // Left/Right move between session tabs, Home/End jump to the ends.
  const onTabListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ignore keys coming from the tab's own close button.
    if ((e.target as HTMLElement).closest('button')) return;
    const ids = tabs.map((t) => t.id);
    if (ids.length === 0) return;
    const current = Math.max(0, ids.indexOf(activeTabId));
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = (current + 1) % ids.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + ids.length) % ids.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = ids.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    const nextId = ids[next];
    setActiveTabId(nextId);
    window.requestAnimationFrame(() => document.getElementById(`term-tab-${nextId}`)?.focus());
  };

  // ------------------------------------------------------- app-level shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = actionForEvent(e);
      if (!action) return;
      const target = e.target as HTMLElement | null;
      const inTerminal = !!target?.closest?.('.xterm');
      const isFormField = !inTerminal && /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '');
      if (isFormField) return;

      const run = (fn: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      };

      switch (action) {
        case 'newTab':
          return run(() => addTab());
        case 'closeTab':
          return run(() => activeTab && closeTab(activeTab.id));
        case 'nextTab':
          return run(() => cycleTab(1));
        case 'prevTab':
          return run(() => cycleTab(-1));
        case 'splitRight':
          return run(() => activeTab && splitPane(activeTab.id, 'vertical'));
        case 'splitDown':
          return run(() => activeTab && splitPane(activeTab.id, 'horizontal'));
        case 'closePane':
          return run(() => activeTab && activeLayout && closePane(activeTab.id, activeLayout.activeId));
        case 'fontUp':
          return run(() => useSettingsFont(+1));
        case 'fontDown':
          return run(() => useSettingsFont(-1));
        case 'fontReset':
          return run(() => useSettingsFont(0));
        case 'settings':
          return run(() => onOpenSettings?.());
        default: {
          // Clipboard / terminal actions belong to the focused pane.
          const api = focusedApi();
          if (api && api.runAction(action)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, activeLayout, addTab, closeTab, closePane, cycleTab, focusedApi, onOpenSettings, splitPane]);

  // Font size is part of the shared settings, so the Settings tab and the
  // terminal controls can never disagree.
  const [, updateSettings] = useSettings();
  const useSettingsFont = (delta: -1 | 0 | 1) => {
    const current = settings.fontSize;
    const next = delta === 0 ? 13 : Math.min(28, Math.max(8, current + delta));
    updateSettings({ fontSize: next });
  };

  // ----------------------------------------------------- directory completion
  useEffect(() => {
    if (!chooserOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/complete?path=${encodeURIComponent(chooserPath)}`);
        const data = await res.json();
        if (!cancelled) setMatches(data.matches || []);
      } catch {
        if (!cancelled) setMatches([]);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chooserPath, chooserOpen]);

  // The chooser is a modal dialog: Escape closes it from anywhere inside, and
  // focus returns to whatever opened it (the folder button in the tab bar).
  useEffect(() => {
    if (!chooserOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChooserOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const returnTo = chooserReturnRef.current;
      if (returnTo && returnTo.isConnected) returnTo.focus();
    };
  }, [chooserOpen]);

  const tabCwdShort = useMemo(() => {
    const label = activeCwd || '~';
    return label.split('/').filter(Boolean).pop() || '/';
  }, [activeCwd]);

  if (!activeTab || !activeLayout) {
    return <div className="p-6 text-xs text-[#88888E]">No terminal session.</div>;
  }

  return (
    <div ref={rootRef} className="flex flex-col bg-[#0A0A0B]" style={{ height: rootH ? `${rootH}px` : 'calc(100vh - 200px)' }}>
      {/* ------------------------------------------------------------- tab bar */}
      <div className="flex items-center gap-1 border-b border-[#1E1E22] px-2 py-1 bg-[#0F0F10] shrink-0">
        <div
          role="tablist"
          aria-label="Terminal sessions"
          onKeyDown={onTabListKeyDown}
          className="flex items-center gap-1 overflow-x-auto"
        >
          {tabs.map((tab) => {
            const isTabActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                id={`term-tab-${tab.id}`}
                role="tab"
                aria-selected={isTabActive}
                aria-controls={`term-panel-${tab.id}`}
                tabIndex={isTabActive ? 0 : -1}
                onClick={() => setActiveTabId(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTabId(tab.id);
                  }
                }}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)] ${
                  isTabActive ? 'border-[#2A2A2E] bg-[#161618] text-[#E0E0E5]' : 'border-transparent text-[#88888E] hover:text-[#E0E0E5]'
                }`}
              >
                <TerminalIcon aria-hidden="true" className="w-3 h-3" style={{ color: isTabActive ? 'var(--ui-accent)' : undefined }} />
                <span className="max-w-[120px] truncate">{isTabActive ? tabCwdShort : tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#55555E] hover:text-[#FF5555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
                    title="Close tab (Ctrl+W)"
                    aria-label={`Close ${isTabActive ? tabCwdShort : tab.title}`}
                  >
                    <X aria-hidden="true" className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={() => addTab()}
          className="p-1 text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
          title="New tab (Ctrl+T)"
          aria-label="New tab"
        >
          <Plus aria-hidden="true" className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            chooserReturnRef.current = document.activeElement as HTMLElement | null;
            setChooserPath(activeCwd || '~');
            setChooserOpen(true);
          }}
          className="p-1 text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
          title="New tab in a specific directory"
          aria-label="New tab in a specific directory"
          aria-haspopup="dialog"
          aria-expanded={chooserOpen}
        >
          <Folder aria-hidden="true" className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1" />

        {/* pane layout controls */}
        <div className="flex items-center gap-1">
          {activeLayout.panes.length > 1 && (
            <span className="text-[10px] text-[#55555E] mr-1">{activeLayout.panes.length} panes</span>
          )}
          <button
            onClick={() => splitPane(activeTab.id, 'vertical')}
            className={`p-1 rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)] ${activeLayout.orientation === 'vertical' && activeLayout.panes.length > 1 ? 'border-[var(--ui-accent)] text-[var(--ui-accent)]' : 'border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5]'}`}
            title="Split right (Ctrl+Shift+E)"
            aria-label="Split right"
            aria-pressed={activeLayout.orientation === 'vertical' && activeLayout.panes.length > 1}
          >
            <Columns2 aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => splitPane(activeTab.id, 'horizontal')}
            className={`p-1 rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)] ${activeLayout.orientation === 'horizontal' && activeLayout.panes.length > 1 ? 'border-[var(--ui-accent)] text-[var(--ui-accent)]' : 'border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5]'}`}
            title="Split down (Ctrl+Shift+O)"
            aria-label="Split down"
            aria-pressed={activeLayout.orientation === 'horizontal' && activeLayout.panes.length > 1}
          >
            <Rows2 aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-[#55555E] ml-2 flex items-center gap-1">
            {repo?.isRepo ? (
              <>
                <GitBranch aria-hidden="true" className="w-3 h-3" /> {repo.branch}
                {repo.changed > 0 && <span className="text-[#EAB308]"> · {repo.changed} changed</span>}
              </>
            ) : (
              'not a git repository'
            )}
          </span>
          <span className="text-[10px] text-[#55555E] flex items-center gap-1">
            <Container aria-hidden="true" className="w-3 h-3" /> {docker?.running ?? 0} running
          </span>
          <div className="flex items-center gap-1 text-[10px] text-[#55555E] ml-2">
            <button
              onClick={() => useSettingsFont(-1)}
              className="px-1 hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              title="Smaller (Ctrl+-)"
              aria-label="Decrease font size"
            >
              <span aria-hidden="true">−</span>
            </button>
            <span className="font-mono" aria-hidden="true">{settings.fontSize}</span>
            <button
              onClick={() => useSettingsFont(1)}
              className="px-1 hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              title="Larger (Ctrl+=)"
              aria-label="Increase font size"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- panes */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {tabs.map((tab) => {
          const layout = layouts[tab.id] || layoutFor(tab.id);
          const isCurrent = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tabpanel"
              id={`term-panel-${tab.id}`}
              aria-labelledby={`term-tab-${tab.id}`}
              tabIndex={-1}
              className="absolute inset-0"
              style={{ visibility: isCurrent ? 'visible' : 'hidden', pointerEvents: isCurrent ? 'auto' : 'none' }}
            >
              <div className={layout.orientation === 'vertical' ? 'flex flex-row w-full h-full' : 'flex flex-col w-full h-full'}>
                {layout.panes.map((pane, index) => {
                  const isActive = layout.activeId === pane.sessionId;
                  return (
                    <div
                      key={pane.sessionId}
                      className="relative flex-1 min-w-0 min-h-0"
                      style={{
                        borderLeft: layout.orientation === 'vertical' && index > 0 ? '1px solid #1E1E22' : undefined,
                        borderTop: layout.orientation === 'horizontal' && index > 0 ? '1px solid #1E1E22' : undefined,
                        boxShadow: isActive && layout.panes.length > 1 ? 'inset 0 0 0 1px var(--ui-accent)' : undefined,
                      }}
                      onMouseDown={() => focusPane(tab.id, pane.sessionId)}
                    >
                      <TerminalPane
                        sessionId={pane.sessionId}
                        cwd={tab.cwd}
                        active={isCurrent && isActive}
                        settings={settings}
                        registerApi={registerApi}
                        onFocusPane={() => focusPane(tab.id, pane.sessionId)}
                        onAction={(actionId, sessionId) => splitPane(tab.id, actionId === 'splitRight' ? 'vertical' : 'horizontal', sessionId)}
                        onReady={(info) => {
                          shellInfo.current[pane.sessionId] = info;
                        }}
                        onCwdChange={(cwd) => {
                          if (cwd) {
                            setCwdByTab((prev) => (prev[tab.id] === cwd ? prev : { ...prev, [tab.id]: cwd }));
                            localStorage.setItem(LAST_DIR_KEY, cwd);
                          }
                        }}
                      />
                      {layout.panes.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            closePane(tab.id, pane.sessionId);
                          }}
                          className="absolute top-1 right-1 z-10 p-0.5 rounded bg-black/50 text-[#88888E] hover:text-[#FF5555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
                          title="Close pane (Ctrl+Shift+W)"
                          aria-label="Close pane"
                        >
                          <X aria-hidden="true" className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- status bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 border-t border-[#1E1E22] bg-[#0F0F10] text-[10px] text-[#66666E]">
        <span className="flex items-center gap-1 text-[#00C853]" role="status">
          <ShieldCheck aria-hidden="true" className="w-3 h-3" />
          real PTY · {shellInfo.current[activeLayout.activeId]?.shell?.split('/').pop() || 'shell'}
          {shellInfo.current[activeLayout.activeId]?.integration && shellInfo.current[activeLayout.activeId]?.integration !== 'none'
            ? ` · audit: ${shellInfo.current[activeLayout.activeId]?.integration}`
            : ''}
        </span>
        <span>{activeCwd || '~'}</span>
        <span className="text-[#4A4A52]">Ctrl+Shift+E split · Ctrl+Shift+O split down · Ctrl+Shift+W close pane · Ctrl+, settings</span>
        {ptyBackend && !ptyBackend.available && (
          <span className="text-[#FF5555]" role="status">
            terminal backend unavailable: {ptyBackend.error}
          </span>
        )}
      </div>

      {/* ------------------------------------------------------ directory chooser */}
      {chooserOpen && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-start justify-center pt-20" onClick={() => setChooserOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="omniterm-chooser-title"
            className="w-[560px] max-w-[92vw] bg-[#161618] border border-[#2A2A2E] rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-[#2A2A2E] text-[11px] text-[#E0E0E5] flex items-center gap-2">
              <Folder aria-hidden="true" className="w-3.5 h-3.5 text-[var(--ui-accent)]" />
              <span id="omniterm-chooser-title">New tab — choose a directory (Tab completes)</span>
            </div>
            <input
              autoFocus
              aria-label="Directory path"
              value={chooserPath}
              onChange={(e) => setChooserPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && matches[0]) {
                  e.preventDefault();
                  setChooserPath(matches[0].path);
                }
                if (e.key === 'Enter') {
                  addTab(chooserPath);
                  setChooserOpen(false);
                }
                if (e.key === 'Escape') setChooserOpen(false);
              }}
              className="w-full bg-transparent px-3 py-2 text-xs font-mono text-[#E0E0E5] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--ui-accent)]"
            />
            <div className="max-h-64 overflow-y-auto border-t border-[#2A2A2E]">
              {matches.map((m) => (
                <button
                  key={m.path}
                  onClick={() => {
                    if (m.type === 'directory') setChooserPath(m.path);
                    else {
                      addTab(m.path.split('/').slice(0, -1).join('/'));
                      setChooserOpen(false);
                    }
                  }}
                  aria-label={m.type === 'directory' ? `Open directory ${m.name}` : `Use directory ${m.name}`}
                  className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-[#C9C9CF] hover:bg-[#202024] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--ui-accent)]"
                >
                  {m.type === 'directory' ? <Folder aria-hidden="true" className="w-3 h-3 text-[#3B82F6]" /> : <ChevronDown aria-hidden="true" className="w-3 h-3 text-[#55555E]" />}
                  {m.name}
                </button>
              ))}
              {matches.length === 0 && <div className="px-3 py-3 text-[11px] text-[#55555E]">No matches.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
