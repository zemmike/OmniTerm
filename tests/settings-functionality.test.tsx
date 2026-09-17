/** @vitest-environment jsdom */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HeaderNavbar } from '../src/components/HeaderNavbar';
import { SettingsView } from '../src/components/SettingsView';
import {
  DEFAULT_SETTINGS,
  FONT_STACKS,
  getSettings,
  resetSettings,
  useSettings,
} from '../src/settings';

vi.mock('../src/components/DataControls', () => ({ default: () => null }));
vi.mock('../src/components/ShortcutsCheatsheet', () => ({ default: () => null }));

function SettingsShell() {
  const [settings] = useSettings();
  return (
    <>
      <HeaderNavbar
        activeTab="settings"
        setActiveTab={() => undefined}
        alerts={[]}
        markAlertsAsRead={() => undefined}
      />
      <SettingsView />
      <output aria-label="stored theme">{settings.theme}</output>
    </>
  );
}

describe('settings functionality', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    resetSettings();
  });

  it('uses one persisted theme for the header and Settings view', () => {
    render(<SettingsShell />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose terminal theme' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dracula' }));

    expect(screen.getByLabelText('stored theme').textContent).toBe('dracula');
    expect(screen.getByRole('button', { name: 'Dracula' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(JSON.parse(localStorage.getItem('omniterm_settings_v1') || '{}').theme).toBe('dracula');
  });

  it('offers useful font stacks on Windows, macOS, and Linux', () => {
    expect(FONT_STACKS.map((font) => font.label)).toEqual(
      expect.arrayContaining(['System monospace', 'Cascadia Mono', 'SF Mono', 'DejaVu Sans Mono']),
    );
    for (const font of FONT_STACKS) expect(font.value).toMatch(/monospace/i);
  });

  it('wires and persists every terminal settings control', () => {
    render(<SettingsView />);

    fireEvent.change(screen.getByLabelText('Font'), {
      target: { value: FONT_STACKS.find((font) => font.label === 'Cascadia Mono')?.value },
    });
    fireEvent.change(screen.getByLabelText(/Size/), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Line height'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('Scrollback'), { target: { value: '24000' } });
    fireEvent.change(screen.getByLabelText('Cursor'), { target: { value: 'bar' } });
    fireEvent.click(screen.getByLabelText('Blinking cursor'));
    fireEvent.click(screen.getByRole('checkbox', { name: /Copy as soon as text is selected/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Middle click pastes/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Prefix history search/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Experimental: WebGL renderer/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Show exit code and duration/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Right click opens a menu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a shortcut for New tab' }));
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true, shiftKey: true });

    const settings = getSettings();
    expect(settings).toMatchObject({
      fontFamily: FONT_STACKS.find((font) => font.label === 'Cascadia Mono')?.value,
      fontSize: 18,
      lineHeight: 1.5,
      scrollback: 24000,
      cursorStyle: 'bar',
      cursorBlink: false,
      copyOnSelect: false,
      middleClickPaste: false,
      prefixHistory: false,
      webglRenderer: true,
      commandDecorations: false,
      contextMenu: false,
      shortcuts: { newTab: 'Ctrl+Shift+N' },
    });
    expect(JSON.parse(localStorage.getItem('omniterm_settings_v1') || '{}')).toMatchObject(
      settings,
    );
  });

  it('persists custom colours and reset restores all defaults', () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom colours' }));
    fireEvent.change(screen.getByLabelText('Background hex colour value'), {
      target: { value: '#123456' },
    });
    expect(getSettings().custom.background).toBe('#123456');

    fireEvent.click(screen.getByRole('button', { name: /Reset everything/ }));
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem('omniterm_settings_v1')).toBeNull();
  });
});
