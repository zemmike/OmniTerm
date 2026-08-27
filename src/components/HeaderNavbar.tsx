import React, { useState } from 'react';
import {
  Terminal,
  FolderTree,
  Activity,
  Bot,
  Settings,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Monitor,
  UserCheck,
  ChevronDown,
} from 'lucide-react';
import { OSPreset, UserRole, SystemAlert } from '../types';
import { TERMINAL_THEMES } from '../lib/themeUtils';

interface HeaderNavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  osPreset: OSPreset;
  setOsPreset: (os: OSPreset) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  currentTheme: string;
  setCurrentTheme: (theme: string) => void;
  alerts: SystemAlert[];
  markAlertsAsRead: () => void;
}

export const HeaderNavbar: React.FC<HeaderNavbarProps> = ({
  activeTab,
  setActiveTab,
  osPreset,
  setOsPreset,
  userRole,
  setUserRole,
  currentTheme,
  setCurrentTheme,
  alerts,
  markAlertsAsRead,
}) => {
  const [showAlertsMenu, setShowAlertsMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const unreadAlerts = alerts.filter((a) => !a.read);

  const primaryNavItems = [
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'files', label: 'Files', icon: FolderTree },
    { id: 'ai-cli', label: 'AI Copilot', icon: Bot },
    { id: 'health', label: 'Server Health', icon: Activity },
    { id: 'system', label: 'System & Security', icon: Settings },
  ];

  return (
    <header className="bg-[#161618] border-b border-[#2A2A2E] sticky top-0 z-50 text-[#E0E0E5] font-mono select-none">
      {/* Top Branding & Main Controls Bar */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 bg-[#161618] border-b border-[#2A2A2E] text-xs">
        {/* Brand Logo & Minimal Mode Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-sm text-[#00FF41] uppercase tracking-wider">
            <Terminal className="w-4 h-4 text-[#00FF41]" />
            <span>OmniTerm</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0A0A0B] border border-[#2A2A2E] text-[10px] text-[#88888E]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-pulse" />
            <span className="text-[#00FF41]">ONLINE</span>
          </div>
        </div>

        {/* System Settings Controls */}
        <div className="flex items-center gap-2">
          {/* OS Preset Selector */}
          <div className="flex items-center bg-[#0A0A0B] rounded p-0.5 border border-[#2A2A2E]">
            <button
              onClick={() => setOsPreset('macos')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                osPreset === 'macos'
                  ? 'bg-[#202024] text-[#00FF41]'
                  : 'text-[#88888E] hover:text-[#E0E0E5]'
              }`}
            >
              macOS
            </button>
            <button
              onClick={() => setOsPreset('linux')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                osPreset === 'linux'
                  ? 'bg-[#202024] text-[#00FF41]'
                  : 'text-[#88888E] hover:text-[#E0E0E5]'
              }`}
            >
              Linux
            </button>
            <button
              onClick={() => setOsPreset('windows')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                osPreset === 'windows'
                  ? 'bg-[#202024] text-[#00FF41]'
                  : 'text-[#88888E] hover:text-[#E0E0E5]'
              }`}
            >
              Win
            </button>
          </div>

          {/* User Role Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="px-2 py-1 rounded border flex items-center gap-1 font-bold text-[10px] uppercase bg-[#202024] border-[#2A2A2E] text-[#3B82F6]"
            >
              <UserCheck className="w-3 h-3 text-[#3B82F6]" />
              <span>{userRole}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-[#161618] border border-[#2A2A2E] rounded shadow-xl py-1 z-50 text-xs font-mono">
                {(['admin', 'developer', 'auditor', 'viewer'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setUserRole(r);
                      setShowRoleMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 uppercase text-[11px] hover:bg-[#202024] transition-colors ${
                      userRole === r ? 'text-[#00FF41] font-bold' : 'text-[#88888E]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theme Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-1 rounded bg-[#202024] border border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5] text-[11px] flex items-center gap-1"
              title="Theme"
            >
              <Monitor className="w-3.5 h-3.5 text-[#00FF41]" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-[#161618] border border-[#2A2A2E] rounded shadow-xl py-1 z-50 text-xs font-mono">
                {Object.entries(TERMINAL_THEMES).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setCurrentTheme(key);
                      setShowThemeMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#202024] transition-colors ${
                      currentTheme === key ? 'text-[#00FF41] font-bold' : 'text-[#88888E]'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Alerts Drawer */}
          <div className="relative">
            <button
              onClick={() => {
                setShowAlertsMenu(!showAlertsMenu);
                if (unreadAlerts.length > 0) markAlertsAsRead();
              }}
              className="relative p-1 rounded bg-[#202024] border border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5]"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF5555] rounded-full" />
              )}
            </button>

            {showAlertsMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-[#161618] border border-[#2A2A2E] rounded shadow-2xl p-3 z-50 text-xs font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2E] mb-2 font-bold text-[#E0E0E5]">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#00FF41]" />
                    <span>System Alerts</span>
                  </span>
                  <span className="text-[10px] text-[#88888E]">{alerts.length} total</span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {alerts.map((a) => (
                    <div
                      key={a.id}
                      className="p-2 rounded bg-[#0A0A0B] border border-[#2A2A2E] text-[11px] space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-bold text-[#E0E0E5]">
                        <span className="flex items-center gap-1">
                          {a.type === 'security_denied' ? (
                            <AlertTriangle className="w-3 h-3 text-[#FF5555]" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-[#00FF41]" />
                          )}
                          {a.title}
                        </span>
                      </div>
                      <p className="text-[#88888E]">{a.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Simplified Primary Navigation Tabs Bar */}
      <div className="px-4 flex items-center gap-1 overflow-x-auto no-scrollbar bg-[#161618]">
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeTab === item.id ||
            (item.id === 'system' && ['rbac-logs', 'plugins', 'backups', 'security', 'api-tests'].includes(activeTab));
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'system' && !['rbac-logs', 'plugins', 'backups', 'security', 'api-tests'].includes(activeTab)) {
                  setActiveTab('rbac-logs');
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`px-3 py-1.5 border-b-2 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 whitespace-nowrap transition-all ${
                isActive
                  ? 'border-[#00FF41] text-[#00FF41] bg-[#0A0A0B]'
                  : 'border-transparent text-[#88888E] hover:text-[#E0E0E5] hover:bg-[#202024]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#00FF41]' : 'text-[#55555E]'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};

