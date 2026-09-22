import React, { useCallback, useEffect, useState } from 'react';
import { Terminal, RefreshCw, Undo2 } from 'lucide-react';

type Status = { kind: 'idle' | 'busy' | 'done' | 'error'; message: string };

interface HerdrStatus {
  installed: boolean;
  binary: string | null;
  version: string | null;
  protocol: number | null;
  serverRunning: boolean;
  compatible: boolean;
  configPath: string;
  configExists: boolean;
  theme: { autoSwitch?: boolean; darkName?: string; lightName?: string };
  backupPath: string;
  backupExists: boolean;
}

/**
 * Match Herdr's own interface to this OmniTerm theme.
 *
 * This edits a config file that belongs to another program, so it says exactly which keys it
 * will write, keeps one backup, and offers the way back. It never runs on its own: Herdr
 * following OmniTerm's light/dark switch is only useful if the person asked for it.
 */
export default function HerdrThemeCard({ themeId }: { themeId: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const [herdr, setHerdr] = useState<HerdrStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/herdr/status');
      const body = (await res.json()) as HerdrStatus;
      if (!res.ok)
        throw new Error((body as unknown as { error?: string })?.error || `HTTP ${res.status}`);
      setHerdr(body);
    } catch (err: any) {
      setStatus({ kind: 'error', message: `Could not read Herdr's state: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function match() {
    setStatus({ kind: 'busy', message: 'Writing the theme keys and asking Herdr to reload…' });
    try {
      const res = await fetch('/api/herdr/theme', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themeId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      const wrote = body.wrote as { darkName: string; lightName: string } | undefined;
      setStatus({
        kind: 'done',
        message:
          `Wrote auto_switch = true, dark_name = ${wrote?.darkName}, light_name = ${wrote?.lightName}. ${body.note || ''}`.trim(),
      });
      await load();
    } catch (err: any) {
      setStatus({ kind: 'error', message: err.message });
      await load();
    }
  }

  async function revert() {
    const ok = window.confirm(
      `Restore your Herdr config from OmniTerm's backup?\n\n` +
        `This puts back the file as it was before OmniTerm first changed it, and reloads Herdr. ` +
        `The backup is kept, so this can be repeated.`,
    );
    if (!ok) return;
    setStatus({ kind: 'busy', message: 'Restoring your Herdr config…' });
    try {
      const res = await fetch('/api/herdr/theme/revert', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setStatus({ kind: 'done', message: body.note || 'Restored.' });
      await load();
    } catch (err: any) {
      setStatus({ kind: 'error', message: err.message });
    }
  }

  const tone =
    status.kind === 'error'
      ? 'text-[#FF7A7A]'
      : status.kind === 'done'
        ? 'text-[#7CE38B]'
        : 'text-[#9A9AA3]';

  return (
    <div className="border border-[#2A2A2E] rounded bg-[#0F0F11] p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Terminal aria-hidden="true" className="w-3.5 h-3.5 text-[#8AB4F8]" />
        <h2 className="text-[12px] font-semibold text-[#E0E0E5]">Herdr</h2>
        {herdr?.version ? (
          <span className="text-[10px] text-[#66666E]">
            {herdr.version}
            {herdr.protocol ? ` · protocol ${herdr.protocol}` : ''}
            {herdr.serverRunning ? '' : ' · server not running'}
            {herdr.compatible ? '' : ' · incompatible'}
          </span>
        ) : null}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Reload Herdr state"
          className="rounded p-0.5 text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && !herdr ? (
        <p className="text-[11px] text-[#9A9AA3]">Looking for Herdr…</p>
      ) : !herdr?.installed ? (
        <p className="text-[11px] text-[#9A9AA3] leading-relaxed">
          Herdr is not installed on this machine, so there is nothing to match. OmniTerm's own
          terminals are unaffected. Install Herdr from{' '}
          <span className="text-[#8AB4F8]">herdr.dev</span> and reload this card.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-[#9A9AA3] leading-relaxed">
            Herdr's interface can follow this theme: it takes the terminal's palette and switches
            with the light/dark scheme. OmniTerm writes three keys into{' '}
            <code className="rounded bg-[#1E1E22] px-1">{herdr.configPath}</code> — nothing else in
            that file is touched, and one backup is kept before the first change.
          </p>
          <p className="text-[11px] text-[#9A9AA3]">
            Will write: <code className="rounded bg-[#1E1E22] px-1">auto_switch = true</code>{' '}
            <code className="rounded bg-[#1E1E22] px-1">dark_name = &quot;terminal&quot;</code>{' '}
            <code className="rounded bg-[#1E1E22] px-1">light_name = &quot;terminal&quot;</code>
            {herdr.theme.autoSwitch !== undefined ? (
              <span className="text-[#66666E]">
                {' '}
                (currently auto_switch = {String(herdr.theme.autoSwitch)})
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void match()}
              disabled={status.kind === 'busy'}
              className="px-2.5 py-1.5 text-[11px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#8AB4F8]/60 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
            >
              Match Herdr to this theme
            </button>
            {herdr.backupExists ? (
              <button
                type="button"
                onClick={() => void revert()}
                disabled={status.kind === 'busy'}
                className="px-2.5 py-1.5 text-[11px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#FF9D5C]/60 disabled:opacity-40 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              >
                <Undo2 aria-hidden="true" className="w-3 h-3" />
                Restore my config
              </button>
            ) : null}
          </div>
        </>
      )}

      {status.kind !== 'idle' ? <p className={`text-[11px] ${tone}`}>{status.message}</p> : null}
      {!herdr?.installed && status.kind === 'error' ? (
        <p className="text-[11px] text-[#FF7A7A]">{status.message}</p>
      ) : null}
    </div>
  );
}
