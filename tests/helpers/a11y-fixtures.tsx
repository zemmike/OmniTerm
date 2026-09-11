/**
 * Fixtures for the accessibility regression guard (tests/a11y.test.ts).
 *
 * Two kinds live here:
 *
 *  1. Real shell fixtures — the landmark structure src/App.tsx builds (header +
 *     <main>), so the components are audited the way they actually render in
 *     the app rather than as a bare fragment floating outside any landmark.
 *
 *  2. Deliberately broken fixtures — markup with an aria-label or a role
 *     removed by hand. Nothing in src/** is touched; these exist so the suite
 *     proves its own guard can fail (see the last describe block).
 */
import React from 'react';
import { HeaderNavbar } from '../../src/components/HeaderNavbar';
import type { SystemAlert } from '../../src/types';

/** Realistic alert list: one unread (drives the "N unread" label + badge). */
export const A11Y_ALERTS: SystemAlert[] = [
  {
    id: 'alert-1',
    timestamp: '2026-09-11 00:04',
    title: 'CPU above 92%',
    message: 'load average 8.4 on 4 cores for 5 minutes',
    type: 'cpu_high',
    read: false,
  },
  {
    id: 'alert-2',
    timestamp: '2026-09-10 23:51',
    title: 'Command denied',
    message: 'sudo systemctl stop sshd was refused by the read-only guard',
    type: 'security_denied',
    read: true,
  },
];

export interface AppShellFixtureProps {
  activeTab?: string;
  currentTheme?: string;
  alerts?: SystemAlert[];
  onTabChange?: (tab: string) => void;
}

/**
 * Mirrors src/App.tsx: <HeaderNavbar> followed by the <main> panel it labels as
 * the tabpanel (the header's own effect sets role/id on the first <main>).
 */
export const AppShellFixture: React.FC<AppShellFixtureProps> = ({
  activeTab = 'health',
  currentTheme = 'matrix',
  alerts = A11Y_ALERTS,
  onTabChange,
}) => (
  <>
    <HeaderNavbar
      activeTab={activeTab}
      setActiveTab={onTabChange ?? (() => undefined)}
      setUserRole={() => undefined}
      currentTheme={currentTheme}
      setCurrentTheme={() => undefined}
      alerts={alerts}
      markAlertsAsRead={() => undefined}
    />
    <main className="flex-1 overflow-hidden bg-[#0F0F10]">
      <p>Panel content for {activeTab}</p>
    </main>
  </>
);

/* ------------------------------------------------------------------ *
 * Deliberately broken fixtures — each one drops exactly one ARIA bit *
 * that a real component in src/components/ has today.               *
 * ------------------------------------------------------------------ */

/** Same shape as HeaderNavbar's icon-only theme button, with aria-label removed
 *  — and no `title` either, since a title would still supply a name. */
export const BrokenIconButtonFixture: React.FC = () => (
  <div>
    <button className="p-1 rounded">
      <span aria-hidden="true">▢</span>
    </button>
  </div>
);

/** Same shape as FileManagerView's file row, with its aria-label removed and only
 *  a decorative icon inside, so nothing can supply a name from content. */
export const BrokenRowLabelFixture: React.FC = () => (
  <div role="group" aria-label="Directory contents">
    <div role="button" tabIndex={0} className="p-2 rounded">
      <span aria-hidden="true">▢</span>
    </div>
  </div>
);

/** Same shape as HeaderNavbar's tablist, with one tab's role removed. */
export const BrokenTabRoleFixture: React.FC = () => (
  <div role="tablist" aria-label="Primary">
    <button id="nav-tab-health" role="tab" aria-selected={true} aria-controls="main-content">
      System Health
    </button>
    <button id="nav-tab-files">Files</button>
  </div>
);
