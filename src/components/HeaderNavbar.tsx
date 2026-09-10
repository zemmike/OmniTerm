import React, { useEffect, useRef, useState } from 'react';
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
  SlidersHorizontal,
} from 'lucide-react';
import { OSPreset, UserRole, SystemAlert } from '../types';
import { TERMINAL_THEMES } from '../lib/themeUtils';

interface HeaderNavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setUserRole: (role: UserRole) => void;
  currentTheme: string;
  setCurrentTheme: (theme: string) => void;
  alerts: SystemAlert[];
  markAlertsAsRead: () => void;
}

export const HeaderNavbar: React.FC<HeaderNavbarProps> = ({
  activeTab,
  setActiveTab,
  setUserRole,
  currentTheme,
  setCurrentTheme,
  alerts,
  markAlertsAsRead,
}) => {
  const [showAlertsMenu, setShowAlertsMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const alertsButtonRef = useRef<HTMLButtonElement>(null);

  const unreadAlerts = alerts.filter((a) => !a.read);

  const primaryNavItems = [
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'files', label: 'Files', icon: FolderTree },
    { id: 'health', label: 'System Health', icon: Activity },
    { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
  ];

  // The panel switched by the primary tabs lives in App.tsx, which we do not
  // own. To complete the tablist -> tab -> tabpanel relationship (and to give
  // the skip link a real target) the header labels the existing <main> as the
  // tabpanel. This only sets ARIA attributes / an id: no layout or behaviour.
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    main.setAttribute('role', 'tabpanel');
    main.setAttribute('aria-labelledby', `nav-tab-${activeTab}`);
    main.setAttribute('tabindex', '-1');
  }, [activeTab]);

  // Escape closes whichever header popover is open and returns focus to its
  // trigger, so keyboard users are never stranded behind a menu.
  useEffect(() => {
    if (!showThemeMenu && !showAlertsMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showThemeMenu) {
        setShowThemeMenu(false);
        themeButtonRef.current?.focus();
      }
      if (showAlertsMenu) {
        setShowAlertsMenu(false);
        alertsButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showThemeMenu, showAlertsMenu]);

  // Left/Right move between tabs, Home/End jump to the ends (roving tabindex).
  const onNavKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ids = primaryNavItems.map((item) => item.id);
    const current = Math.max(0, ids.indexOf(activeTab));
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
    const nextId = ids[next];
    setActiveTab(nextId);
    window.requestAnimationFrame(() => document.getElementById(`nav-tab-${nextId}`)?.focus());
  };

  return (
    <header className="bg-[#161618] border-b border-[#2A2A2E] sticky top-0 z-50 text-[#E0E0E5] font-mono select-none">
      {/* Skip link: first element of the shell, slides into view on focus. */}
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById('main-content') || document.querySelector('main');
          if (!main) return;
          main.setAttribute('tabindex', '-1');
          (main as HTMLElement).focus();
        }}
        className="absolute left-2 top-2 z-[60] -translate-y-24 transition-transform bg-[#0A0A0B] text-[#00FF41] border border-[#00FF41] rounded px-3 py-1.5 text-xs font-bold focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
      >
        Skip to content
      </a>

      {/* Top Branding & Main Controls Bar */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 bg-[#161618] border-b border-[#2A2A2E] text-xs">
        {/* Brand Logo & Minimal Mode Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-sm text-[#00FF41] uppercase tracking-wider">
            <Terminal aria-hidden="true" className="w-4 h-4 text-[#00FF41]" />
            <span>OmniTerm</span>
          </div>

          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0A0A0B] border border-[#2A2A2E] text-[10px] text-[#88888E]"
            role="status"
          >
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-pulse" />
            <span className="text-[#00FF41]">ONLINE</span>
          </div>
        </div>

        {/* System Settings Controls */}
        <div className="flex items-center gap-2">
          {/* Theme Selector Dropdown */}
          <div className="relative">
            <button
              ref={themeButtonRef}
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-1 rounded bg-[#202024] border border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5] text-[11px] flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
              title="Theme"
              aria-label="Choose terminal theme"
              aria-haspopup="menu"
              aria-expanded={showThemeMenu}
            >
              <Monitor aria-hidden="true" className="w-3.5 h-3.5 text-[#00FF41]" />
            </button>

            {showThemeMenu && (
              <div
                role="menu"
                aria-label="Terminal themes"
                className="absolute right-0 mt-1 w-40 bg-[#161618] border border-[#2A2A2E] rounded shadow-xl py-1 z-50 text-xs font-mono"
              >
                {Object.entries(TERMINAL_THEMES).map(([key, t]) => (
                  <button
                    key={key}
                    role="menuitem"
                    aria-current={currentTheme === key ? 'true' : undefined}
                    onClick={() => {
                      setCurrentTheme(key);
                      setShowThemeMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#202024] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00FF41] ${
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
              ref={alertsButtonRef}
              onClick={() => {
                setShowAlertsMenu(!showAlertsMenu);
                if (unreadAlerts.length > 0) markAlertsAsRead();
              }}
              className="relative p-1 rounded bg-[#202024] border border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
              aria-label={
                unreadAlerts.length > 0
                  ? `System alerts, ${unreadAlerts.length} unread`
                  : 'System alerts'
              }
              aria-haspopup="dialog"
              aria-expanded={showAlertsMenu}
            >
              <Bell aria-hidden="true" className="w-3.5 h-3.5" />
              {unreadAlerts.length > 0 && (
                <span aria-hidden="true" className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF5555] rounded-full" />
              )}
            </button>

            {showAlertsMenu && (
              <div
                role="dialog"
                aria-label="System alerts"
                className="absolute right-0 mt-2 w-80 bg-[#161618] border border-[#2A2A2E] rounded shadow-2xl p-3 z-50 text-xs font-mono"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2E] mb-2 font-bold text-[#E0E0E5]">
                  <span className="flex items-center gap-1.5">
                    <Shield aria-hidden="true" className="w-3.5 h-3.5 text-[#00FF41]" />
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
                            <AlertTriangle aria-hidden="true" className="w-3 h-3 text-[#FF5555]" />
                          ) : (
                            <CheckCircle2 aria-hidden="true" className="w-3 h-3 text-[#00FF41]" />
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
      <div
        role="tablist"
        aria-label="Primary"
        onKeyDown={onNavKeyDown}
        className="px-4 flex items-center gap-1 overflow-x-auto no-scrollbar bg-[#161618]"
      >
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls="main-content"
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(item.id)}
              className={`px-3 py-1.5 border-b-2 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41] ${
                isActive
                  ? 'border-[#00FF41] text-[#00FF41] bg-[#0A0A0B]'
                  : 'border-transparent text-[#88888E] hover:text-[#E0E0E5] hover:bg-[#202024]'
              }`}
            >
              <Icon aria-hidden="true" className={`w-3.5 h-3.5 ${isActive ? 'text-[#00FF41]' : 'text-[#55555E]'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
