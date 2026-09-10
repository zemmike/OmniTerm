import React, { useState, useEffect } from 'react';
import { HeaderNavbar } from './components/HeaderNavbar';
import TerminalView from './components/TerminalView';
import { FileManagerView } from './components/FileManagerView';
import { ServerHealthView } from './components/ServerHealthView';
import { SettingsView } from './components/SettingsView';
import { useSettings } from './settings';
import { applyUiTheme } from './themes';

import { TerminalTab, OSPreset, UserRole, SystemAlert } from './types';

export default function App() {
  // Deep link: the desktop shell can open a specific tab (?tab=backups).
  const [activeTab, setActiveTab] = useState<string>(
    () => new URLSearchParams(window.location.search).get('tab') || 'terminal'
  );
  const [osPreset, setOsPreset] = useState<OSPreset>('macos');
  const [userRole, setUserRole] = useState<UserRole>('developer');
  const [settings] = useSettings();
  const [currentTheme, setCurrentTheme] = useState<string>(settings.theme);
  // Publish the theme to CSS variables so chrome and terminal agree.
  useEffect(() => {
    applyUiTheme(settings);
  }, [settings]);
  // The header selector writes through to the same store the Settings tab uses.
  useEffect(() => {
    if (settings.theme !== currentTheme) setCurrentTheme(settings.theme);
  }, [settings.theme, currentTheme]);
  // Real footer figures: host memory from /api/health and the measured
  // round-trip time of that very request.
  const [mem, setMem] = useState<{ usedMb: number; totalMb: number; percent: number } | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

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
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Terminal Tabs State
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [tabs, setTabs] = useState<TerminalTab[]>([
    {
      id: 'tab-1',
      title: 'Main Session (macOS)',
      osPreset: 'macos',
      environment: 'local',
      cwd: '/home/user',
      history: [
        {
          id: 'cmd-init-1',
          timestamp: new Date().toLocaleTimeString(),
          command: 'welcome',
          output: `DevTerminal Pro v2.4.0 (macOS Run Engine)\nConnected as 'developer' with TLS 1.3 encryption.\nType 'help' for available CLI commands.`,
          status: 'success',
          executionTimeMs: 4,
          cwd: '/home/user',
          userRole: 'developer',
          os: 'macos',
        },
      ],
      colorTheme: 'matrix',
      activePluginIds: ['plugin-git', 'plugin-docker', 'plugin-sec'],
    },
  ]);

  // Alerts come from the host; there are none until something real happens.
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);


  // Adopt the real host environment on startup: real home directory, real
  // platform preset and a shell banner that reflects this machine.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/env')
      .then((r) => (r.ok ? r.json() : null))
      .then((env) => {
        if (!env || cancelled) return;
        const preset = (env.osPreset || 'linux') as OSPreset;
        setOsPreset(preset);
        setTabs((prev) =>
          prev.map((t, idx) =>
            idx === 0
              ? {
                  ...t,
                  osPreset: preset,
                  title: `Main Session (${String(preset).toUpperCase()})`,
                  cwd: env.cwd,
                  history: t.history.map((h) => ({
                    ...h,
                    cwd: env.cwd,
                    os: preset,
                    output:
                      `OmniTerm v${env.version} — real shell engine on ${env.hostname}\n` +
                      `User: ${env.user}  |  Shell: ${env.shell}\n` +
                      `Working directory: ${env.cwd}\n` +
                      `Type 'help' for OmniTerm built-ins — everything else runs for real.`,
                  })),
                }
              : t,
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const markAlertsAsRead = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  // Helper to send generated AI script straight to the active terminal

  return (
    <div className="min-h-screen bg-[#0F0F10] text-[#E0E0E5] flex flex-col font-mono selection:bg-[#00FF41] selection:text-black">
      {/* Top Navbar */}
      <HeaderNavbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        osPreset={osPreset}
        setOsPreset={setOsPreset}
        userRole={userRole}
        setUserRole={setUserRole}
        currentTheme={currentTheme}
        setCurrentTheme={setCurrentTheme}
        alerts={alerts}
        markAlertsAsRead={markAlertsAsRead}
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-hidden bg-[#0F0F10]">
        {activeTab === 'terminal' && (
          <TerminalView
            tabs={tabs}
            setTabs={setTabs}
            activeTabId={activeTabId}
            setActiveTabId={setActiveTabId}
            osPreset={osPreset}
            userRole={userRole}
            currentTheme={currentTheme}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'files' && <FileManagerView userRole={userRole} />}

        {activeTab === 'health' && <ServerHealthView />}




        {activeTab === 'settings' && <SettingsView />}

      </main>

      {/* Persistent OmniTerm OS Status Footer */}
      <footer className="h-7 bg-[#161618] border-t border-[#2A2A2E] flex items-center justify-between px-4 text-[11px] text-[#88888E] font-mono select-none z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[#00FF41]">
            <span className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse" />
            <span className="font-bold">CONNECTED</span>
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
            <span className={latency !== null && latency < 50 ? 'text-[#00FF41]' : 'text-[#EAB308]'}>
              {latency !== null ? `${latency}ms` : '—'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
