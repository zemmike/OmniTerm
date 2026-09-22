/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../src/components/TerminalView', () => ({
  default: ({ visible }: { visible?: boolean }) => {
    const [screenRevision, setScreenRevision] = useState(0);
    return (
      <div data-testid="terminal-view" data-visible={String(visible)}>
        <button type="button" onClick={() => setScreenRevision((value) => value + 1)}>
          Terminal screen {screenRevision}
        </button>
      </div>
    );
  },
}));
vi.mock('../src/components/FileManagerView', () => ({ FileManagerView: () => <div>files</div> }));
vi.mock('../src/components/ServerHealthView', () => ({
  ServerHealthView: () => <div>health</div>,
}));
vi.mock('../src/components/SettingsView', () => ({ SettingsView: () => <div>settings</div> }));

import App from '../src/App';
import { resetSettings } from '../src/settings';

describe('terminal app-tab lifecycle', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    resetSettings();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input), 'http://omniterm.test').pathname;
        if (path === '/api/env') {
          return new Response(JSON.stringify({ cwd: '/work', home: '/home/test' }), {
            status: 200,
          });
        }
        if (path === '/api/health') {
          return new Response(JSON.stringify({ memoryUsage: { usedMb: 1, totalMb: 2 } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps the terminal renderer mounted while Settings is open', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Terminal screen 0' }));
    expect(screen.getByRole('button', { name: 'Terminal screen 1' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByTestId('terminal-view').getAttribute('data-visible')).toBe('false');

    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }));
    expect(screen.getByRole('button', { name: 'Terminal screen 1' })).toBeTruthy();
    expect(screen.getByTestId('terminal-view').getAttribute('data-visible')).toBe('true');
  });
});
