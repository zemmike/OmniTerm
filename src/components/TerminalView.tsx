import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Terminal as TerminalIcon, Folder, ChevronDown, GitBranch, Container, ShieldCheck, Minus, RotateCcw } from 'lucide-react';
import TerminalPane, { XtermTheme } from './TerminalPane';
import { TerminalTab, OSPreset, UserRole } from '../types';

interface Props {
  tabs: TerminalTab[];
  setTabs: React.Dispatch<React.SetStateAction<TerminalTab[]>>;
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  osPreset: OSPreset;
  userRole: UserRole;
  currentTheme: string;
}

// --------------------------------------------------------------------- themes
export const TERMINAL_THEMES: Record<string, XtermTheme> = {
  matrix: {
    background: '#0A0A0B', foreground: '#D7DAE0', cursor: '#22C55E', selectionBackground: '#264F78',
    black: '#1B1D22', red: '#F87171', green: '#22C55E', yellow: '#EAB308', blue: '#60A5FA',
    magenta: '#C084FC', cyan: '#22D3EE', white: '#D7DAE0', brightBlack: '#6B7280', brightRed: '#FCA5A5',
    brightGreen: '#4ADE80', brightYellow: '#FDE047', brightBlue: '#93C5FD', brightMagenta: '#D8B4FE',
    brightCyan: '#67E8F9', brightWhite: '#F9FAFB',
  },
  dracula: {
    background: '#1E1F29', foreground: '#F8F8F2', cursor: '#FF79C6', selectionBackground: '#44475A',
    black: '#21222C', red: '#FF5555', green: '#50FA7B', yellow: '#F1FA8C', blue: '#BD93F9',
    magenta: '#FF79C6', cyan: '#8BE9FD', white: '#F8F8F2', brightBlack: '#6272A4', brightRed: '#FF6E6E',
    brightGreen: '#69FF94', brightYellow: '#FFFFA5', brightBlue: '#D6ACFF', brightMagenta: '#FF92DF',
    brightCyan: '#A4FFFF', brightWhite: '#FFFFFF',
  },
  slate: {
    background: '#12141A', foreground: '#E2E8F0', cursor: '#38BDF8', selectionBackground: '#334155',
    black: '#1E293B', red: '#F87171', green: '#4ADE80', yellow: '#FACC15', blue: '#60A5FA',
    magenta: '#C084FC', cyan: '#38BDF8', white: '#E2E8F0', brightBlack: '#64748B', brightRed: '#FCA5A5',
    brightGreen: '#86EFAC', brightYellow: '#FDE68A', brightBlue: '#93C5FD', brightMagenta: '#D8B4FE',
    brightCyan: '#7DD3FC', brightWhite: '#F8FAFC',
  },
  solarized: {
    background: '#002B36', foreground: '#93A1A1', cursor: '#B58900', selectionBackground: '#073642',
    black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900', blue: '#268BD2',
    magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5', brightBlack: '#586E75', brightRed: '#CB4B16',
    brightGreen: '#586E75', brightYellow: '#657B83', brightBlue: '#839496', brightMagenta: '#6C71C4',
    brightCyan: '#93A1A1', brightWhite: '#FDF6E3',
  },
  amber: {
    background: '#0C0A06', foreground: '#F5D0A9', cursor: '#F59E0B', selectionBackground: '#3F2D10',
    black: '#26180A', red: '#EF4444', green: '#84CC16', yellow: '#F59E0B', blue: '#38BDF8',
    magenta: '#E879F9', cyan: '#22D3EE', white: '#FDE68A', brightBlack: '#78716C', brightRed: '#FCA5A5',
    brightGreen: '#BEF264', brightYellow: '#FCD34D', brightBlue: '#7DD3FC', brightMagenta: '#F0ABFC',
    brightCyan: '#67E8F9', brightWhite: '#FFFBEB',
  },
};

const FONT_KEY = 'omniterm_font_size';
const LAST_DIR_KEY = 'omniterm_last_dir';

function makeTab(cwd: string, osPreset: OSPreset, colorTheme: string, index: number): TerminalTab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: `shell ${index}`,
    osPreset,
    environment: 'local',
    cwd,
    history: [],
    colorTheme,
    activePluginIds: [],
  };
}

export default function TerminalView({
  tabs,
  setTabs,
  activeTabId,
  setActiveTabId,
  osPreset,
  currentTheme,
}: Props) {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const [fontSize, setFontSize] = useState<number>(() => Number(localStorage.getItem(FONT_KEY)) || 13);
  const [repo, setRepo] = useState<{ isRepo: boolean; branch: string | null; changed: number; untracked: number } | null>(null);
  const [docker, setDocker] = useState<{ available: boolean; running: number } | null>(null);
  const [ptyBackend, setPtyBackend] = useState<{ available: boolean; error: string | null } | null>(null);
  const [cwdByTab, setCwdByTab] = useState<Record<string, string>>({});
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserPath, setChooserPath] = useState('');
  const [matches, setMatches] = useState<{ name: string; path: string; type: string }[]>([]);
  const shellInfo = useRef<Record<string, { shell: string; pid: number | null }>>({});

  // The app shell sizes itself with min-height, so percentage heights do not
  // resolve here. Measure the available space instead of trusting h-full, or
  // the terminal gets a zero-height box and renders nothing.
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

  const theme = TERMINAL_THEMES[currentTheme] || TERMINAL_THEMES.matrix;
  const activeCwd = cwdByTab[activeTab?.id] || activeTab?.cwd || '';

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(fontSize));
  }, [fontSize]);

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
        /* status bar is informational */
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
      .then((d) => setPtyBackend({ available: d.available, error: d.error }))
      .catch(() => setPtyBackend({ available: false, error: 'API unreachable' }));
  }, []);

  // ------------------------------------------------------------------- tabs
  const addTab = useCallback(
    (cwd?: string) => {
      const dir = cwd || activeCwd || '';
      setTabs((prev) => {
        const next = makeTab(dir, osPreset, currentTheme, prev.length + 1);
        setActiveTabId(next.id);
        return [...prev, next];
      });
      try {
        localStorage.setItem(LAST_DIR_KEY, dir);
      } catch {
        /* ignore */
      }
    },
    [activeCwd, currentTheme, osPreset, setActiveTabId, setTabs]
  );

  const closeTab = useCallback(
    (id: string) => {
      fetch('/api/terminal/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      }).catch(() => undefined);
      setTabs((prev) => {
        if (prev.length === 1) return prev; // always keep one shell
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (id === activeTabId) {
          const fallback = next[Math.max(0, idx - 1)] || next[0];
          setActiveTabId(fallback.id);
        }
        return next;
      });
    },
    [activeTabId, setActiveTabId, setTabs]
  );

  const cycleTab = useCallback(
    (delta: number) => {
      const idx = tabs.findIndex((t) => t.id === activeTabId);
      const next = (idx + delta + tabs.length) % tabs.length;
      setActiveTabId(tabs[next].id);
    },
    [activeTabId, tabs, setActiveTabId]
  );

  // -------------------------------------------------------------- shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      // Tabs
      if (!e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        addTab();
        return;
      }
      if (!e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTab) closeTab(activeTab.id);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const target = tabs[Number(e.key) - 1];
        if (target) setActiveTabId(target.id);
        return;
      }
      // Font size
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setFontSize((s) => Math.min(28, s + 1));
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setFontSize((s) => Math.max(8, s - 1));
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        setFontSize(13);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, addTab, closeTab, cycleTab, setActiveTabId, tabs]);

  // ------------------------------------------------- folder autocomplete API
  useEffect(() => {
    if (!chooserOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/complete?path=${encodeURIComponent(chooserPath)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => setMatches(d.matches || []))
        .catch(() => undefined);
    }, 120);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [chooserPath, chooserOpen]);

  const openChooser = () => {
    setChooserPath(activeCwd || '~/');
    setChooserOpen(true);
  };

  const statusText = useMemo(() => {
    if (!repo) return 'checking…';
    if (!repo.isRepo) return 'not a git repository';
    const parts = [repo.branch || 'detached'];
    if (repo.changed) parts.push(`${repo.changed} changed`);
    if (repo.untracked) parts.push(`${repo.untracked} untracked`);
    return parts.join(' · ');
  }, [repo]);

  return (
    <div
      ref={rootRef}
      className="flex flex-col bg-[#0A0A0B]"
      style={{ height: rootH ? `${rootH}px` : 'calc(100vh - 200px)' }}
    >
      {/* ------------------------------------------------ tab bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#111113] border-b border-[#2A2A2E] select-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const label = (cwdByTab[tab.id] || tab.cwd || '~').replace(/\/+$/, '') || '/';
          const short = label.split('/').filter(Boolean).pop() || '/';
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-t text-xs cursor-pointer border-t border-x ${
                isActive
                  ? 'bg-[#0A0A0B] text-zinc-100 border-[#2A2A2E]'
                  : 'bg-[#151517] text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
              title={`${tab.title} — ${label}`}
            >
              <TerminalIcon className="w-3.5 h-3.5" style={{ color: isActive ? theme.green : undefined }} />
              <span className="font-mono">{short}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400"
                  title="Close tab (Ctrl+W)"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          onClick={() => addTab()}
          className="p-1.5 rounded hover:bg-[#1F1F23] text-zinc-500 hover:text-green-400"
          title="New shell in current directory (Ctrl+T)"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={openChooser}
          className="p-1.5 rounded hover:bg-[#1F1F23] text-zinc-500 hover:text-green-400"
          title="New shell in a different directory"
        >
          <Folder className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500 pr-1">
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" /> {statusText}
          </span>
          <span className="flex items-center gap-1">
            <Container className="w-3 h-3" />
            {docker ? (docker.available ? `${docker.running} running` : 'docker unavailable') : '…'}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setFontSize((s) => Math.max(8, s - 1))} title="Smaller (Ctrl+-)">
              <Minus className="w-3 h-3 hover:text-zinc-200" />
            </button>
            <button onClick={() => setFontSize(13)} className="hover:text-zinc-200 font-mono" title="Reset (Ctrl+0)">
              {fontSize}
            </button>
            <button onClick={() => setFontSize((s) => Math.min(28, s + 1))} title="Larger (Ctrl+=)">
              <Plus className="w-3 h-3 hover:text-zinc-200" />
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ terminals */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ visibility: tab.id === activeTabId ? 'visible' : 'hidden' }}
          >
            <TerminalPane
              sessionId={tab.id}
              cwd={cwdByTab[tab.id] || tab.cwd}
              theme={TERMINAL_THEMES[tab.colorTheme] || theme}
              fontSize={fontSize}
              active={tab.id === activeTabId}
              onReady={(info) => {
                shellInfo.current[tab.id] = { shell: info.shell, pid: info.pid };
                setPtyBackend({ available: true, error: null });
                setCwdByTab((prev) => ({ ...prev, [tab.id]: info.cwd }));
              }}
              onCwdChange={(cwd) => setCwdByTab((prev) => ({ ...prev, [tab.id]: cwd }))}
            />
          </div>
        ))}

        {ptyBackend && !ptyBackend.available && (
          <div className="absolute inset-x-0 top-0 z-10 bg-[#2A1616] border-b border-red-900/60 px-4 py-2 text-xs text-red-200">
            The interactive terminal backend could not start ({ptyBackend.error}). Run a shell from the
            API or reinstall OmniTerm.
          </div>
        )}
      </div>

      {/* ------------------------------------------------ directory chooser */}
      {chooserOpen && (
        <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-6">
          <div className="w-[34rem] bg-[#131316] border border-[#2A2A2E] rounded-lg shadow-2xl">
            <div className="px-4 py-3 border-b border-[#2A2A2E] text-sm text-zinc-200 flex items-center gap-2">
              <Folder className="w-4 h-4 text-green-400" /> New shell — pick a directory
            </div>
            <div className="p-4 space-y-2">
              <input
                autoFocus
                value={chooserPath}
                onChange={(e) => setChooserPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && matches[0]) {
                    e.preventDefault();
                    setChooserPath(matches[0].path.replace('~', '') || matches[0].path);
                  }
                  if (e.key === 'Enter') {
                    addTab(chooserPath);
                    setChooserOpen(false);
                  }
                  if (e.key === 'Escape') setChooserOpen(false);
                }}
                placeholder="/var/log  ·  ~/projects  ·  Tab completes"
                className="w-full bg-[#0E0E10] border border-[#33333A] rounded px-3 py-2 text-sm font-mono text-zinc-100 outline-none focus:border-green-600"
              />
              <div className="max-h-56 overflow-auto border border-[#232328] rounded divide-y divide-[#1D1D21]">
                {matches.length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-600">
                    No matches. Type a path and press Enter — folders complete as you type.
                  </div>
                )}
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
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-zinc-400 hover:bg-[#1C1C20] hover:text-zinc-100 flex items-center gap-2"
                  >
                    {m.type === 'directory' ? (
                      <Folder className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5 text-zinc-600" />
                    )}
                    {m.path}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#2A2A2E]">
              <button
                onClick={() => setChooserOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  addTab(chooserPath);
                  setChooserOpen(false);
                }}
                className="px-3 py-1.5 text-xs bg-green-700 hover:bg-green-600 text-white rounded"
              >
                Open shell
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ key hints */}
      <div className="px-3 py-1 bg-[#0A0A0B] border-t border-[#1D1D21] text-[10px] text-zinc-600 flex items-center gap-4 select-none">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-green-700" /> real PTY · your shell ({shellInfo.current[activeTab?.id]?.shell?.split('/').pop() || 'shell'})
          {shellInfo.current[activeTab?.id]?.pid ? ` · pid ${shellInfo.current[activeTab?.id]?.pid}` : ''}
        </span>
        <span>Ctrl+T new · Ctrl+W close · Ctrl+Tab switch · Ctrl± size · Ctrl+Shift+C/V copy/paste · Ctrl+Shift+F search</span>
      </div>
    </div>
  );
}
