import React, { useState, useEffect } from 'react';
import { HeaderNavbar } from './components/HeaderNavbar';
import { TerminalView } from './components/TerminalView';
import { FileManagerView } from './components/FileManagerView';
import { ServerHealthView } from './components/ServerHealthView';
import { AiCliSuiteView } from './components/AiCliSuiteView';
import { PermissionsAndLogsView } from './components/PermissionsAndLogsView';
import { BackupsAndCloudView } from './components/BackupsAndCloudView';
import { SecurityEncryptionView } from './components/SecurityEncryptionView';

import { TerminalTab, OSPreset, UserRole, SystemAlert } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('terminal');
  // Note: UI-only modules (fake plugins, fake API test runner) were removed on
  // purpose — every tab now shows real data from this machine.
  const [osPreset, setOsPreset] = useState<OSPreset>('macos');
  const [userRole, setUserRole] = useState<UserRole>('developer');
  const [currentTheme, setCurrentTheme] = useState<string>('matrix');

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

  // Real-Time System Alerts State
  const [alerts, setAlerts] = useState<SystemAlert[]>([
    {
      id: 'alt-1',
      timestamp: new Date(Date.now() - 600000).toISOString(),
      title: 'Security Alert: Unauthorized Sudo',
      message: 'Viewer role attempted elevated command execution (sudo rm)',
      type: 'security_denied',
      read: false,
    },
    {
      id: 'alt-2',
      timestamp: new Date(Date.now() - 1200000).toISOString(),
      title: 'Backup Scheduled Completed',
      message: 'Automated snapshot backup #2026-0812 succeeded (1.2 GB)',
      type: 'backup_failed',
      read: true,
    },
  ]);


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
  const handleSendAiToTerminal = (cmdToRun: string) => {
    setActiveTab('terminal');
    // Find active tab and append to history
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          return {
            ...t,
            history: [
              ...t.history,
              {
                id: `cmd-ai-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString(),
                command: 'AI Copilot Injection',
                output: `[AI Generated Script Injected]:\n\n${cmdToRun}\n\nExecute in terminal via 'Run'`,
                status: 'success',
                executionTimeMs: 10,
                cwd: t.cwd,
                userRole,
                os: osPreset,
              },
            ],
          };
        }
        return t;
      })
    );
  };

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

      {/* Secondary Sub-Header for System & Security Section */}
      {['rbac-logs', 'backups', 'security'].includes(activeTab) && (
        <div className="bg-[#161618] border-b border-[#2A2A2E] px-4 py-1.5 flex items-center gap-2 overflow-x-auto text-xs font-mono">
          <span className="text-[#55555E] font-bold text-[10px] uppercase tracking-wider mr-1">System Module:</span>
          <button
            onClick={() => setActiveTab('rbac-logs')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              activeTab === 'rbac-logs' ? 'bg-[#202024] text-[#00FF41] font-bold border border-[#2A2A2E]' : 'text-[#88888E] hover:text-[#E0E0E5]'
            }`}
          >
            Command Log & Guard
          </button>
          <button
            onClick={() => setActiveTab('backups')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              activeTab === 'backups' ? 'bg-[#202024] text-[#00FF41] font-bold border border-[#2A2A2E]' : 'text-[#88888E] hover:text-[#E0E0E5]'
            }`}
          >
            Snapshots
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              activeTab === 'security' ? 'bg-[#202024] text-[#00FF41] font-bold border border-[#2A2A2E]' : 'text-[#88888E] hover:text-[#E0E0E5]'
            }`}
          >
            Security Posture
          </button>
        </div>
      )}

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
          />
        )}

        {activeTab === 'files' && <FileManagerView userRole={userRole} />}

        {activeTab === 'health' && <ServerHealthView />}

        {activeTab === 'ai-cli' && <AiCliSuiteView onSendToTerminal={handleSendAiToTerminal} />}

        {activeTab === 'rbac-logs' && <PermissionsAndLogsView currentRole={userRole} />}

        {activeTab === 'backups' && <BackupsAndCloudView />}

        {activeTab === 'security' && <SecurityEncryptionView />}

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
          <span className="text-[#2A2A2E] hidden sm:inline">|</span>
          <div className="hidden sm:block">
            <span className="text-[#55555E]">ROLE: </span>
            <span className="text-[#3B82F6] font-bold uppercase">{userRole}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:block">
            <span className="text-[#55555E]">MEM: </span>
            <span className="text-[#E0E0E5]">1.42GB / 8.00GB</span>
          </div>
          <span className="text-[#2A2A2E] hidden md:inline">|</span>
          <div>
            <span className="text-[#55555E]">LATENCY: </span>
            <span className="text-[#00FF41]">12ms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
