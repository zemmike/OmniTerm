import React, { useEffect, useState } from 'react';
import {
  Palette,
  Type,
  MousePointer2,
  Keyboard,
  RotateCcw,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';
import { useSettings, resetSettings, FONT_STACKS, TerminalSettings } from '../settings';
import DataControls from './DataControls';
import ShortcutsCheatsheet from './ShortcutsCheatsheet';
import { THEMES, themeById } from '../themes';
import {
  ACTIONS,
  bindingFor,
  bindingFromEvent,
  formatBinding,
  conflictsFor,
  isDefault,
} from '../keys';

/**
 * Settings — themes, typography, mouse/terminal behaviour and the keyboard map.
 * Everything is applied live through the settings store; nothing here needs a
 * restart or a reconnect.
 */
export const SettingsView: React.FC = () => {
  const [settings, update] = useSettings();
  const [recording, setRecording] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [saved]);

  // Capture the next key combination for the action being recorded.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        update({ shortcuts: { ...settings.shortcuts, [recording]: '' } });
        setRecording(null);
        setSaved(true);
        return;
      }
      const binding = bindingFromEvent(e);
      if (!binding) return; // modifier only, keep waiting
      update({ shortcuts: { ...settings.shortcuts, [recording]: binding } });
      setRecording(null);
      setSaved(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, settings.shortcuts, update]);

  const set = <K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) => {
    update({ [key]: value } as Partial<TerminalSettings>);
    setSaved(true);
  };

  const section = 'border border-[#2A2A2E] rounded bg-[#0F0F11] p-3 space-y-3';
  const label = 'block text-[10px] uppercase tracking-wider text-[#6B6B75] mb-1';
  const field =
    'w-full bg-[#0D0D0F] border border-[#2A2A2E] rounded px-2.5 py-1.5 text-xs text-[#E0E0E5] focus:outline-none focus:border-[var(--ui-accent)] focus-visible:ring-1 focus-visible:ring-[var(--ui-accent)]';
  const groups: Array<{ name: string; icon: React.ElementType }> = [
    { name: 'Tabs', icon: Keyboard },
    { name: 'Panes', icon: Keyboard },
    { name: 'Clipboard', icon: Keyboard },
    { name: 'Terminal', icon: Keyboard },
    { name: 'App', icon: Keyboard },
  ];

  return (
    <div
      className="p-4 md:p-5 space-y-4 text-[#E0E0E5] overflow-y-auto"
      style={{ height: 'calc(100vh - 120px)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-bold flex items-center gap-2">
          <Palette aria-hidden="true" className="w-4 h-4 text-[var(--ui-accent)]" />
          SETTINGS
        </h1>
        <div className="flex items-center gap-3">
          {saved && (
            <span
              role="status"
              aria-live="polite"
              className="text-[10px] text-[var(--ui-accent)] flex items-center gap-1"
            >
              <Check aria-hidden="true" className="w-3 h-3" /> saved
            </span>
          )}
          <button
            onClick={() => {
              resetSettings();
              setSaved(true);
            }}
            className="px-2.5 py-1.5 text-[11px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#FF5555]/60 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
          >
            <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" /> Reset everything
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ---------------------------------------------------------- appearance */}
        <div className={section}>
          <div className="text-[11px] uppercase tracking-wider text-[#6B6B75] flex items-center gap-2">
            <Palette aria-hidden="true" className="w-3.5 h-3.5" /> Theme
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => set('theme', t.id)}
                aria-pressed={settings.theme === t.id}
                className={`text-left rounded border p-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)] ${
                  settings.theme === t.id
                    ? 'border-[var(--ui-accent)]'
                    : 'border-[#2A2A2E] hover:border-[#3A3A40]'
                }`}
                style={{ background: t.terminal.background }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ background: t.terminal.foreground }}
                  />
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ background: t.terminal.green || t.accent }}
                  />
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ background: t.terminal.blue || t.accent }}
                  />
                  <span className="w-3 h-3 rounded-sm" style={{ background: t.accent }} />
                </div>
                <div
                  className="text-[10px] mt-1.5 font-bold"
                  style={{ color: t.terminal.foreground }}
                >
                  {t.label}
                </div>
              </button>
            ))}
          </div>

          {settings.theme === 'custom' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {(
                [
                  ['background', 'Background'],
                  ['foreground', 'Text'],
                  ['cursor', 'Cursor'],
                  ['selection', 'Selection'],
                  ['accent', 'UI accent'],
                ] as const
              ).map(([key, text]) => (
                <div key={key}>
                  <label className={label} htmlFor={`settings-color-${key}`}>
                    {text}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`settings-color-${key}`}
                      type="color"
                      value={settings.custom[key]}
                      aria-label={`${text} colour`}
                      onChange={(e) => set('custom', { ...settings.custom, [key]: e.target.value })}
                      className="w-8 h-7 bg-transparent border border-[#2A2A2E] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
                    />
                    <input
                      value={settings.custom[key]}
                      aria-label={`${text} hex colour value`}
                      onChange={(e) => set('custom', { ...settings.custom, [key]: e.target.value })}
                      className="flex-1 bg-[#0D0D0F] border border-[#2A2A2E] rounded px-2 py-1 text-[11px] font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ui-accent)]"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- typography */}
        <div className={section}>
          <div className="text-[11px] uppercase tracking-wider text-[#6B6B75] flex items-center gap-2">
            <Type aria-hidden="true" className="w-3.5 h-3.5" /> Text
          </div>
          <div>
            <label className={label} htmlFor="settings-font">
              Font
            </label>
            <select
              id="settings-font"
              value={settings.fontFamily}
              onChange={(e) => set('fontFamily', e.target.value)}
              className={field}
            >
              {FONT_STACKS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label} htmlFor="settings-font-size">
                Size ({settings.fontSize}px)
              </label>
              <input
                id="settings-font-size"
                type="range"
                min={8}
                max={28}
                value={settings.fontSize}
                aria-valuetext={`${settings.fontSize} pixels`}
                onChange={(e) => set('fontSize', Number(e.target.value))}
                className="w-full accent-[var(--ui-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              />
            </div>
            <div>
              <label className={label} htmlFor="settings-line-height">
                Line height
              </label>
              <input
                id="settings-line-height"
                type="number"
                step={0.05}
                min={1}
                max={2}
                value={settings.lineHeight}
                aria-valuetext={`${settings.lineHeight}x line height`}
                onChange={(e) => set('lineHeight', Number(e.target.value))}
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="settings-scrollback">
                Scrollback
              </label>
              <input
                id="settings-scrollback"
                type="number"
                step={1000}
                min={1000}
                max={200000}
                value={settings.scrollback}
                aria-valuetext={`${settings.scrollback} lines`}
                onChange={(e) => set('scrollback', Number(e.target.value))}
                className={field}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="settings-cursor">
                Cursor
              </label>
              <select
                id="settings-cursor"
                value={settings.cursorStyle}
                onChange={(e) =>
                  set('cursorStyle', e.target.value as TerminalSettings['cursorStyle'])
                }
                className={field}
              >
                <option value="block">Block</option>
                <option value="underline">Underline</option>
                <option value="bar">Bar</option>
              </select>
            </div>
            <label className="flex items-end gap-2 text-xs text-[#8A8A93] pb-1">
              <input
                type="checkbox"
                checked={settings.cursorBlink}
                onChange={(e) => set('cursorBlink', e.target.checked)}
                className="accent-[var(--ui-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              />
              Blinking cursor
            </label>
          </div>
          <div
            className="rounded border border-[#2A2A2E] p-2 font-mono text-xs"
            style={{
              background: themeById(settings.theme).terminal.background,
              color: themeById(settings.theme).terminal.foreground,
              fontFamily: settings.fontFamily,
              fontSize: settings.fontSize,
              lineHeight: settings.lineHeight,
            }}
          >
            root@ubuntu:~# echo "preview"{' '}
            <span style={{ color: themeById(settings.theme).terminal.green }}>preview</span>
          </div>
        </div>

        {/* ------------------------------------------------------------ behaviour */}
        <div className={section}>
          <div className="text-[11px] uppercase tracking-wider text-[#6B6B75] flex items-center gap-2">
            <MousePointer2 aria-hidden="true" className="w-3.5 h-3.5" /> Terminal behaviour
          </div>
          {(
            [
              [
                'copyOnSelect',
                'Copy as soon as text is selected',
                'Dragging over output puts it straight on the clipboard.',
              ],
              ['middleClickPaste', 'Middle click pastes', 'Classic X11 behaviour.'],
              [
                'prefixHistory',
                'Prefix history search',
                'Typing “git” then Up/Down cycles only commands starting with “git”.',
              ],
              [
                'commandDecorations',
                'Show exit code and duration',
                'Each prompt line is labelled with how the previous command ended.',
              ],
              [
                'contextMenu',
                'Right click opens a menu',
                'Copy, paste, split and clear without touching the keyboard.',
              ],
            ] as const
          ).map(([key, title, hint]) => (
            <label key={key} className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={settings[key] as boolean}
                onChange={(e) => set(key, e.target.checked as never)}
                className="accent-[var(--ui-accent)] mt-0.5"
              />
              <span>
                <span className="text-[#E0E0E5]">{title}</span>
                <span className="block text-[10px] text-[#6B6B75]">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        {/* ------------------------------------------------------------ shortcuts */}
        <div className={section}>
          <div className="text-[11px] uppercase tracking-wider text-[#6B6B75] flex items-center gap-2">
            <Keyboard aria-hidden="true" className="w-3.5 h-3.5" /> Keyboard shortcuts
          </div>
          <div className="text-[10px] text-[#6B6B75]">
            Click <em>Record</em>, then press the combination you want. Escape cancels, Backspace
            unbinds. Shortcuts are app-level; everything else (Ctrl+C, Tab, arrows …) goes straight
            to the shell.
          </div>
          <div className="space-y-3">
            {groups.map(({ name }) => {
              const items = ACTIONS.filter((a) => a.group === name);
              if (items.length === 0) return null;
              return (
                <div key={name}>
                  <div className="text-[10px] uppercase tracking-wider text-[#55555E] mb-1">
                    {name}
                  </div>
                  <div className="space-y-1">
                    {items.map((action) => {
                      const binding = bindingFor(action.id);
                      const conflicts = conflictsFor(action.id);
                      const isRec = recording === action.id;
                      return (
                        <div key={action.id} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1 text-[#C9C9CF]">{action.label}</span>
                          {conflicts.length > 0 && (
                            <span
                              role="img"
                              aria-label={`Also bound to ${conflicts.join(', ')}`}
                              className="text-[#EAB308] flex items-center gap-1"
                              title={`also used by ${conflicts.join(', ')}`}
                            >
                              <AlertTriangle aria-hidden="true" className="w-3 h-3" />
                            </span>
                          )}
                          <span
                            role="status"
                            aria-live="polite"
                            className={`font-mono px-2 py-0.5 rounded border min-w-[104px] text-center ${
                              isRec
                                ? 'border-[var(--ui-accent)] text-[var(--ui-accent)]'
                                : binding
                                  ? 'border-[#2A2A2E] text-[#E0E0E5]'
                                  : 'border-[#2A2A2E] text-[#55555E]'
                            }`}
                          >
                            {isRec ? 'press keys…' : binding ? formatBinding(binding) : 'unbound'}
                          </span>
                          <button
                            onClick={() => setRecording(action.id)}
                            aria-label={
                              isRec
                                ? `Recording a shortcut for ${action.label} — press the keys now`
                                : `Record a shortcut for ${action.label}`
                            }
                            aria-pressed={isRec}
                            className="px-2 py-0.5 text-[10px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[var(--ui-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
                          >
                            Record
                          </button>
                          <button
                            disabled={isDefault(action.id)}
                            onClick={() => {
                              const next = { ...settings.shortcuts };
                              delete next[action.id];
                              update({ shortcuts: next });
                              setSaved(true);
                            }}
                            className="px-2 py-0.5 text-[10px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#3A3A40] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
                            title="Back to the default binding"
                            aria-label={`Reset ${action.label} to its default binding`}
                          >
                            <X aria-hidden="true" className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <ShortcutsCheatsheet />
        <DataControls />
      </div>
    </div>
  );
};
