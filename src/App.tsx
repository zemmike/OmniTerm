import React, { useState, useEffect } from 'react';
import { HeaderNavbar } from './components/HeaderNavbar';
import TerminalView from './components/TerminalView';
import { FileManagerView } from './components/FileManagerView';
import { ServerHealthView } from './components/ServerHealthView';
import { SettingsView } from './components/SettingsView';
import { useSettings } from './settings';
import { applyUiTheme } from './themes';
import { loadWorkspace } from './workspace';

import { TerminalTab, SystemAlert } from './types';

export default function App() {
  const [initialWorkspace] = useState(() => loadWorkspace());
  // Deep link: the desktop shell can open a specific tab (?tab=backups).
  const [activeTab, setActiveTab] = useState<string>(
    () => new URLSearchParams(window.location.search).get('tab') || 'terminal',
  );
  const [settings] = useSettings();
  // Publish the theme to CSS variables so chrome and terminal agree.
  useEffect(() => {
    applyUiTheme(settings);
  }, [settings]);
  // Real footer figures: host memory from /api/health and the measured
  // round-trip time of that very request.
  const [mem, setMem] = useState<{ usedMb: number; totalMb: number; percent: number } | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [home, setHome] = useState('');
  const [fileTarget, setFileTarget] = useState<{ path: string; requestId: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        // Latency is measured on a cheap endpoint so it reflects the API, not
        // how long the host-wide health scan takes.
        const started = performance.now();
        await fetch('/api/terminal/status').then((r) => r.json());
        if (cancelled) return;
        setLatency(Math.max(1, Math.round(performance.now() - started)));

        const data = await fetch('/api/health').then((r) => r.json());
        if (cancelled) return;
        const m = data?.memoryUsage;
        if (m && typeof m.usedMb === 'number') {
          const usedMb = Math.round(m.usedMb);
          const totalMb = Math.round(m.totalMb);
          setMem({ usedMb, totalMb, percent: totalMb ? Math.round((usedMb / totalMb) * 100) : 0 });
        }
      } catch {
        if (!cancelled) setLatency(null);
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Terminal Tabs State
  const [activeTabId, setActiveTabId] = useState<string>(
    () => initialWorkspace?.activeTabId || 'tab-1',
  );
  const [tabs, setTabs] = useState<TerminalTab[]>(
    () =>
      initialWorkspace?.tabs || [
        {
          id: 'tab-1',
          title: 'Terminal',
          osPreset: 'linux',
          environment: 'local',
          cwd: '',
          // Nothing is pre-seeded: the shell, its working directory and everything it
          // prints come from the real PTY session.
          history: [],
          colorTheme: 'matrix',
          activePluginIds: [],
        },
      ],
  );

  // Alerts come from the host; there are none until something real happens.
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/alerts')
      .then((response) => (response.ok ? response.json() : []))
      .then((next: SystemAlert[]) => {
        if (!cancelled && Array.isArray(next)) setAlerts(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Adopt the real host environment on startup: real home directory, real
  // platform preset and a shell banner that reflects this machine.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/env')
      .then((r) => (r.ok ? r.json() : null))
      .then((env) => {
        if (!env || cancelled) return;
        // The host reports its real working directory. Nothing is written into
        // the scrollback here: the PTY session produces that for real.
        const realCwd = typeof env.cwd === 'string' ? env.cwd : '';
        if (typeof env.home === 'string') setHome(env.home);
        if (initialWorkspace) return;
        setTabs((prev) =>
          prev.map((t, idx) =>
            idx === 0 ? { ...t, osPreset: 'linux', title: 'Terminal', cwd: realCwd } : t,
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialWorkspace]);

  const markAlertsAsRead = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    void fetch('/api/alerts/mark-read', { method: 'POST' }).catch(() => undefined);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#0F0F10] text-[#E0E0E5] flex flex-col font-mono selection:bg-[#00FF41] selection:text-black">
      {/* Top Navbar */}
      <HeaderNavbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        alerts={alerts}
        markAlertsAsRead={markAlertsAsRead}
      />

      {/* Main View Area */}
      <main className="flex-1 min-h-0 overflow-hidden bg-[#0F0F10]">
        <div
          id="main-content"
          role="tabpanel"
          aria-labelledby={`nav-tab-${activeTab}`}
          tabIndex={-1}
          className="h-full min-h-0 overflow-hidden"
        >
          {activeTab === 'terminal' && (
            <TerminalView
              tabs={tabs}
              setTabs={setTabs}
              activeTabId={activeTabId}
              setActiveTabId={setActiveTabId}
              currentTheme={settings.theme}
              onOpenSettings={() => setActiveTab('settings')}
              home={home}
              onOpenFilePath={(path) => {
                setFileTarget({ path, requestId: Date.now() });
                setActiveTab('files');
              }}
            />
          )}

          {activeTab === 'files' && <FileManagerView openTarget={fileTarget} />}

          {activeTab === 'health' && <ServerHealthView />}

          {activeTab === 'settings' && <SettingsView />}
        </div>
      </main>

      {/* Persistent OmniTerm OS Status Footer */}
      {/* One bottom bar, not two. On the Terminal tab this app-level footer was
          stacked directly above the terminal's own status row, which is where the
          "two panels" impression came from; the terminal row already reports the
          connection and the shell, so this one is hidden there and kept for the
          tabs that have nothing of their own. */}
      <footer
        className={`h-7 shrink-0 bg-[#161618] border-t border-[#2A2A2E] flex items-center justify-between px-4 text-[11px] text-[#88888E] font-mono select-none z-40 ${
          activeTab === 'terminal' ? 'hidden' : ''
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-1.5 ${latency === null ? 'text-[#FF5555]' : 'text-[#00FF41]'}`}
            role="status"
          >
            <span
              className={`w-2 h-2 rounded-full ${latency === null ? 'bg-[#FF5555]' : 'bg-[#00FF41] animate-pulse'}`}
            />
            <span className="font-bold">{latency === null ? 'OFFLINE' : 'CONNECTED'}</span>
          </div>
          <span className="text-[#2A2A2E]">|</span>
          <div>
            <span className="text-[#55555E]">ENCODING: </span>
            <span className="text-[#E0E0E5]">UTF-8</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:block">
            <span className="text-[#55555E]">MEM: </span>
            <span className="text-[#E0E0E5]">
              {mem ? `${mem.usedMb}MB / ${mem.totalMb}MB (${mem.percent}%)` : '—'}
            </span>
          </div>
          <span className="text-[#2A2A2E] hidden md:inline">|</span>
          <div>
            <span className="text-[#55555E]">API: </span>
            <span
              className={latency !== null && latency < 50 ? 'text-[#00FF41]' : 'text-[#EAB308]'}
            >
              {latency !== null ? `${latency}ms` : '—'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
