/** @vitest-environment jsdom */
/**
 * Accessibility regression guard for the OmniTerm UI.
 *
 * ~215 aria attributes, roles and tabIndex values went into src/components recently,
 * with nothing to stop them silently disappearing again. This file renders the
 * components in jsdom, stubs the local API so each one shows its real populated
 * state, and runs axe against the result.
 *
 * WHAT IS COVERED
 *   • HeaderNavbar   — skip link, tablist/roving tabindex, theme menu, alerts drawer
 *   • SettingsView   — theme grid, custom colour pickers, behaviour toggles, shortcut map
 *   • FileManagerView— breadcrumb nav, filter chips, file rows (role=button), editor, create-file modal
 *   • ServerHealthView — metric cards, progressbars, RAM/mount/process tables
 *
 * WHAT IS NOT COVERED, DELIBERATELY
 *   TerminalPane (the xterm.js host) and therefore TerminalView/App: xterm needs a
 *   real canvas. jsdom has no canvas implementation — importing the xterm chain
 *   alone makes jsdom log "Not implemented: HTMLCanvasElement's getContext()",
 *   and `Terminal.open()` cannot produce a character grid there, so any axe run
 *   over it would be auditing an empty div and claiming success. That gap is
 *   real and is called out here rather than papered over.
 *
 * The suite also asserts its own precision: the last describe block runs the
 * same helper against fixtures with an aria-label / role removed and requires it
 * to fail, so a green run means something.
 *
 * The environment is set per file (`@vitest-environment jsdom`) rather than in
 * vitest.config.ts, whose global environment is 'node' for the API suites. The
 * JSX fixtures live in tests/helpers/a11y-fixtures.tsx (helpers are imported,
 * not discovered); this file keeps to React.createElement so it stays readable
 * either way.
 */
import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AxeResults } from 'axe-core';
import { axe } from 'vitest-axe';
import * as vitestAxeMatchers from 'vitest-axe/matchers';

// vitest-axe@0.1.0 ships a 0-byte dist/extend-expect.js, so importing
// 'vitest-axe/extend-expect' registers nothing at runtime; the matcher has to be
// extended explicitly. Its bundled .d.ts also targets the pre-vitest-3 `Vi`
// namespace, so declare the matcher on the modern target here.
declare module 'vitest' {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

const toHaveNoViolations = (
  vitestAxeMatchers as unknown as {
    toHaveNoViolations: (results: AxeResults) => { pass: boolean; message: () => string };
  }
).toHaveNoViolations;

import { installBrowserApiStubs } from './helpers/a11y-env';
import { installApiStub, TEST_HOME, type ApiStub } from './helpers/a11y-api';
import {
  A11Y_ALERTS,
  AppShellFixture,
  BrokenIconButtonFixture,
  BrokenRowLabelFixture,
  BrokenTabRoleFixture,
} from './helpers/a11y-fixtures';
import { FileManagerView } from '../src/components/FileManagerView';
import { ServerHealthView } from '../src/components/ServerHealthView';
import { SettingsView } from '../src/components/SettingsView';
import { resetSettings } from '../src/settings';

// jsdom has no matchMedia / ResizeObserver / clipboard. Installed before any
// component renders; no vitest.config.ts change needed.
installBrowserApiStubs();

// vitest-axe@0.1.0's runtime extend-expect entry point is empty (the matcher is
// exported from 'vitest-axe/matchers'), so register it explicitly.
expect.extend({ toHaveNoViolations });

const h = React.createElement;

/* ------------------------------------------------------------- axe helpers */

/**
 * vitest's default reporter swallows console.log/console.error from *passing*
 * tests (they only surface for failures), and this suite's most useful output —
 * the rule table and the documented violations — belongs to passing tests too.
 * Writing to the process streams is not intercepted, so it always shows up in
 * `npx vitest run`.
 */
function report(text: string, stream: 'out' | 'err' = 'out'): void {
  const sink = stream === 'out' ? process.stdout : process.stderr;
  sink.write(`${text}\n`);
}

/** Labels whose full known-violation report has already been printed. */
const reportedKnown = new Set<string>();

function formatViolations(label: string, results: AxeResults): string {
  const lines = [`[a11y] ${label} — ${results.violations.length} axe violation(s):`];
  for (const v of results.violations) {
    lines.push(`  • ${v.id} [${v.impact ?? 'n/a'}] ${v.help} — ${v.helpUrl}`);
    for (const node of v.nodes) {
      lines.push(`      target: ${node.target.join(' ')}`);
      lines.push(`      html:   ${node.html}`);
      lines.push(`      why:    ${(node.failureSummary ?? '').split('\n').join(' ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * A violation that is already in src/**, is outside this file's remit (tests/
 * only), and therefore cannot be fixed here. The assertion stays strict for
 * everything else: these allowances are matched on rule id AND node target, so
 * any other violation, or the same rule on another element, still fails.
 */
interface KnownViolation {
  rule: string;
  target: string;
  why: string;
}

/**
 * `aria-allowed-role` (minor) on <main id="main-content">.
 *
 * HeaderNavbar's effect (src/components/HeaderNavbar.tsx, the one that labels the
 * panel) sets role="tabpanel" on the first <main> it finds, and src/App.tsx
 * renders the panel as <main>. HTML-ARIA does not let <main>'s landmark role be
 * overridden, so axe reports the role as inappropriate for the element.
 * FIX (in src/, one line, either side works): render the switched panel as
 * <div role="tabpanel"> in App.tsx, or stop overriding <main>'s role in the
 * header and expose the panel relationship some other way.
 */
const KNOWN_MAIN_TABPANEL: KnownViolation = {
  rule: 'aria-allowed-role',
  target: '#main-content',
  why: 'role="tabpanel" is set on <main> by HeaderNavbar; <main> may not have its role overridden',
};

/** Runs axe and prints a one-line summary (+ the full report when it fails). */
async function audit(container: HTMLElement, label: string): Promise<AxeResults> {
  const results = await axe(container);
  const needsReview = [...new Set(results.incomplete.map((r) => r.id))];
  report(
    `[a11y] ${label}: ${results.passes.length} passed, ${results.violations.length} violations, ` +
      `${results.incomplete.length} need review${needsReview.length ? ` (${needsReview.join(', ')})` : ''}`,
  );
  if (results.violations.length > 0) report(formatViolations(label, results), 'err');
  return results;
}

/**
 * The assertion every real component test uses: axe must report zero
 * violations. Kept deliberately strict — no rules are filtered out wholesale.
 * `known` is only for violations that already exist in src/** (this file may not
 * touch src/**), and each entry pins one rule to one node target; anything else
 * fails with the full report.
 */
async function expectNoViolations(
  container: HTMLElement,
  label: string,
  known: KnownViolation[] = [],
): Promise<AxeResults> {
  const results = await audit(container, label);
  const fired = results.violations.flatMap((v) =>
    v.nodes.map((node) => ({
      rule: v.id,
      impact: v.impact ?? 'n/a',
      target: node.target.join(' '),
    })),
  );

  const unexplained = fired.filter(
    (f) => !known.some((k) => k.rule === f.rule && f.target.includes(k.target)),
  );
  expect(
    unexplained.map((u) => `${u.rule} (${u.impact}) → ${u.target}`),
    `${label}: axe reported accessibility violations — ${unexplained
      .map((u) => `${u.rule} (${u.impact}) → ${u.target}`)
      .join(', ')}\n` + formatViolations(label, results),
  ).toEqual([]);

  if (known.length === 0) {
    // Canonical vitest-axe matcher, with its own html/failureSummary report.
    expect(results).toHaveNoViolations();
  } else {
    // The tree is NOT clean — say so loudly with the matcher's own report (full
    // report once per label so the run stays readable), and notice when a
    // documented violation disappears so the allowance gets deleted instead of
    // quietly hiding a fixed defect.
    const matcher = toHaveNoViolations(results);
    const knownNames = known.map((k) => k.rule).join(', ');
    if (!matcher.pass) {
      if (reportedKnown.has(label)) {
        report(`[a11y] ${label}: known violation(s) still present (${knownNames}).`, 'err');
      } else {
        reportedKnown.add(label);
        report(
          `[a11y] ${label}: known violation(s) scoped out (${knownNames}):\n${matcher.message()}`,
          'err',
        );
      }
    }
    const stale = known.filter(
      (k) => !fired.some((f) => f.rule === k.rule && f.target.includes(k.target)),
    );
    if (stale.length > 0) {
      report(
        `[a11y] ${label}: documented violation(s) no longer reported (${stale
          .map((s) => s.rule)
          .join(', ')}) — it looks fixed; delete the allowance so the rule is enforced again.`,
        'err',
      );
    }
  }
  return results;
}

/** Renders a full-page view the way src/App.tsx does: inside the main landmark. */
function renderInMain(ui: React.ReactElement) {
  return render(h('main', { className: 'flex-1 overflow-hidden' }, ui));
}

let stub: ApiStub;

beforeAll(() => {
  stub = installApiStub();
});

beforeEach(() => {
  stub.reset();
  localStorage.clear();
  resetSettings();
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  stub.restore();
});

/* ------------------------------------------------------------ HeaderNavbar */

/**
 * The header is the one component with a documented, pre-existing violation (see
 * KNOWN_MAIN_TABPANEL). Everything else about it is asserted strictly: the only
 * tolerated entry is `aria-allowed-role` on `#main-content`, and the matcher's
 * full report for it is printed on every run so the defect stays visible.
 */
describe('HeaderNavbar', () => {
  it('app shell: tablist with roving tabindex + main tabpanel, no violations', async () => {
    const { container } = render(h(AppShellFixture, { activeTab: 'health' }));

    const tablist = screen.getByRole('tablist', { name: 'Primary' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeTruthy();

    // The header's effect labels <main> as the tabpanel for the active tab —
    // which is exactly what axe flags as aria-allowed-role (see KNOWN_MAIN_TABPANEL).
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('main-content');
    expect(panel.getAttribute('aria-labelledby')).toBe('nav-tab-health');

    await expectNoViolations(container, 'HeaderNavbar (menus closed)', [KNOWN_MAIN_TABPANEL]);
  });

  it('theme menu (role=menu / role=menuitem) has no new violations', async () => {
    const { container } = render(h(AppShellFixture, {}));

    const trigger = screen.getByRole('button', { name: 'Choose terminal theme' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Terminal themes' });
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(3);
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .filter((m) => m.getAttribute('aria-current') === 'true'),
    ).toHaveLength(1);

    await expectNoViolations(container, 'HeaderNavbar (theme menu open)', [KNOWN_MAIN_TABPANEL]);
  });

  it('alerts drawer shows the populated alert list, no new violations', async () => {
    const { container } = render(h(AppShellFixture, { alerts: A11Y_ALERTS }));

    const trigger = screen.getByRole('button', { name: /^System alerts, 1 unread$/ });
    fireEvent.click(trigger);

    const drawer = screen.getByRole('dialog', { name: 'System alerts' });
    expect(within(drawer).getByText('CPU above 92%')).toBeTruthy();
    expect(within(drawer).getByText('Command denied')).toBeTruthy();
    expect(within(drawer).getByText(`${A11Y_ALERTS.length} total`)).toBeTruthy();

    await expectNoViolations(container, 'HeaderNavbar (alerts drawer open)', [KNOWN_MAIN_TABPANEL]);
  });
});

/* ------------------------------------------------------------ SettingsView */

describe('SettingsView', () => {
  it('default settings screen has no violations', async () => {
    const { container } = renderInMain(h(SettingsView));

    expect(screen.getByRole('heading', { name: 'SETTINGS' })).toBeTruthy();
    expect(screen.getByLabelText('Font')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reset everything/ })).toBeTruthy();

    await expectNoViolations(container, 'SettingsView (default theme)');
  });

  it('custom colour pickers have no violations', async () => {
    const { container } = renderInMain(h(SettingsView));

    fireEvent.click(screen.getByRole('button', { name: 'Custom colours' }));
    expect(screen.getByLabelText('Background colour')).toBeTruthy();
    expect(screen.getByLabelText('Background hex colour value')).toBeTruthy();

    await expectNoViolations(container, 'SettingsView (custom colours shown)');
  });

  it('shortcut recording state has no violations', async () => {
    const { container } = renderInMain(h(SettingsView));

    fireEvent.click(screen.getByRole('button', { name: 'Record a shortcut for New tab' }));
    expect(screen.getByRole('button', { name: /Recording a shortcut for New tab/ })).toBeTruthy();
    expect(screen.getByText(/press keys/)).toBeTruthy();

    await expectNoViolations(container, 'SettingsView (recording a shortcut)');
  });
});

/* -------------------------------------------------------- FileManagerView */

describe('FileManagerView', () => {
  it('directory listing renders every entry and has no violations', async () => {
    const { container } = renderInMain(h(FileManagerView));

    await screen.findByText('REAL FILESYSTEM');
    // Populated, not an empty shell: 8 stubbed entries reached the filter box.
    expect(screen.getByPlaceholderText('Filter 8 entries...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open directory src' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open file notes.md' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open file release.tar.gz' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh directory listing' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy();
    expect(stub.paths()).toContain('/api/files');

    await expectNoViolations(container, 'FileManagerView (directory listing)');
  });

  it('open file / editor state has no violations', async () => {
    const { container } = renderInMain(h(FileManagerView));

    fireEvent.click(await screen.findByRole('button', { name: 'Open file notes.md' }));

    const editor = await screen.findByRole('textbox', {
      name: `Contents of ${TEST_HOME}/projects/notes.md`,
    });
    expect((editor as HTMLTextAreaElement).value).toContain('Accessibility regression guard');
    expect(stub.paths()).toContain('/api/files/read');
    expect(screen.getByRole('button', { name: /Save/ })).toBeTruthy();

    await expectNoViolations(container, 'FileManagerView (file open in the editor)');
  });

  it('create-file modal has no violations', async () => {
    const { container } = renderInMain(h(FileManagerView));

    fireEvent.click(await screen.findByRole('button', { name: 'New' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('CREATE FILE ON DISK')).toBeTruthy();
    expect(within(dialog).getByLabelText('Absolute path')).toBeTruthy();
    expect(within(dialog).getByLabelText('Initial content')).toBeTruthy();

    await expectNoViolations(container, 'FileManagerView (create-file modal)');
  });
});

/* ------------------------------------------------------- ServerHealthView */

describe('ServerHealthView', () => {
  it('live health dashboard renders the stubbed metrics and has no violations', async () => {
    const { container } = renderInMain(h(ServerHealthView));

    await screen.findByRole('heading', { name: /THIS MACHINE/ });
    expect(screen.getByText('omniterm-dev')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'CPU usage' }).getAttribute('aria-valuenow'),
    ).toBe('37');
    expect(
      screen.getByRole('progressbar', { name: 'RAM usage' }).getAttribute('aria-valuenow'),
    ).toBe('58');
    expect(screen.getByRole('progressbar', { name: 'Swap usage' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Top processes by CPU usage' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Top processes by memory (RSS)' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Mounted filesystems' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Memory breakdown/ })).toBeTruthy();
    expect(stub.paths()).toContain('/api/health');

    await expectNoViolations(container, 'ServerHealthView (live metrics)');
  });
});

/* ------------------------------------------------------------- API stubs */

describe('the /api/* stub is populated for every endpoint the UI reads', () => {
  const endpoints = [
    '/api/health',
    '/api/files',
    '/api/env',
    '/api/repo/status',
    '/api/docker/status',
    '/api/terminal/status',
    '/api/backups',
    '/api/alerts',
    '/api/activity-logs',
  ];

  it.each(endpoints)('GET %s answers 200 with a populated JSON body', async (endpoint) => {
    const res = await fetch(endpoint);
    expect(res.ok, `${endpoint} must be stubbed`).toBe(true);
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown;
    if (Array.isArray(body)) expect(body.length).toBeGreaterThan(0);
    else expect(Object.keys(body as Record<string, unknown>).length).toBeGreaterThan(0);
  });

  it('POST /api/files/save answers with success (create-file modal path)', async () => {
    const res = await fetch('/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${TEST_HOME}/projects/new.txt`, content: 'x' }),
    });
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchObject({ success: true });
  });
});

/* -------------------------------------- proof that the guard can actually fail */

describe('the guard fails on deliberately broken fixtures (no src/** involved)', () => {
  it('flags a button whose aria-label was removed (button-name)', async () => {
    const { container } = render(h(BrokenIconButtonFixture));
    const results = await audit(container, 'BrokenIconButtonFixture');
    expect(results.violations.map((v) => v.id)).toContain('button-name');
  });

  it('flags a clickable row whose aria-label was removed (aria-command-name)', async () => {
    const { container } = render(h(BrokenRowLabelFixture));
    const results = await audit(container, 'BrokenRowLabelFixture');
    expect(results.violations.map((v) => v.id)).toContain('aria-command-name');
  });

  it('flags a tablist whose tab lost its role (aria-required-children)', async () => {
    const { container } = render(h(BrokenTabRoleFixture));
    const results = await audit(container, 'BrokenTabRoleFixture');
    expect(results.violations.map((v) => v.id)).toContain('aria-required-children');
  });

  it('the shared expectNoViolations() helper throws with a readable report', async () => {
    const { container } = render(h(BrokenIconButtonFixture));
    await expect(expectNoViolations(container, 'BrokenIconButtonFixture')).rejects.toThrow(
      /button-name/,
    );
  });
});

/* ------------------------------------------------------------ stub sanity */

describe('network stub coverage', () => {
  it('no rendered component made a request the stub could not answer', () => {
    // Every earlier test ran against the same stub; an unmatched request means a
    // component started calling a new endpoint and rendered an error state
    // instead of real data (which would make the axe run worthless).
    expect(stub.unmatched, `unstubbed API request(s): ${stub.unmatched.join(', ')}`).toEqual([]);
  });
});
