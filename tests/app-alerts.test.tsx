/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../src/components/TerminalView', () => ({ default: () => <div>terminal</div> }));
vi.mock('../src/components/FileManagerView', () => ({ FileManagerView: () => <div>files</div> }));
vi.mock('../src/components/ServerHealthView', () => ({
  ServerHealthView: () => <div>health</div>,
}));
vi.mock('../src/components/SettingsView', () => ({ SettingsView: () => <div>settings</div> }));

import App from '../src/App';
import { resetSettings } from '../src/settings';

describe('App alerts', () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = new URL(String(input), 'http://omniterm.test').pathname;
    if (path === '/api/alerts') {
      return new Response(
        JSON.stringify([
          {
            id: 'alert-1',
            timestamp: '2026-09-17T12:00:00Z',
            title: 'CPU high',
            message: 'CPU is above threshold',
            type: 'cpu_high',
            read: false,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (path === '/api/alerts/mark-read') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path === '/api/terminal/status') {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path === '/api/health') {
      return new Response(JSON.stringify({ memoryUsage: { usedMb: 1, totalMb: 2 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path === '/api/env') {
      return new Response(JSON.stringify({ cwd: 'C:\\work', home: 'C:\\Users\\test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404 });
  });

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    resetSettings();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('loads alerts and marks unread alerts through the API', async () => {
    render(<App />);

    const button = await screen.findByRole('button', { name: 'System alerts, 1 unread' });
    fireEvent.click(button);
    expect(await screen.findByText('CPU high')).toBeTruthy();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/alerts/mark-read',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'System alerts' })).toBeTruthy();
  });
});
