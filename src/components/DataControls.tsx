import React, { useState } from 'react';
import { Trash2, ShieldAlert } from 'lucide-react';

type Status = { kind: 'idle' | 'busy' | 'done' | 'error'; message: string };

/**
 * Deleting your own data.
 *
 * Both actions are irreversible, so each one states exactly what will be removed
 * before it happens and reports exactly what was removed afterwards. There is no
 * "are you sure?" loop and no undo — the copy is specific instead, which is what
 * actually helps someone decide.
 */
export default function DataControls() {
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });

  async function removeHistory() {
    const ok = window.confirm(
      'Delete the local command history?\n\n' +
        'This removes ~/.local/share/omniterm/activity.jsonl, the audit trail of every command ' +
        'run through OmniTerm (one-shot and interactive). Snapshots are not touched. ' +
        'This cannot be undone.',
    );
    if (!ok) return;
    setStatus({ kind: 'busy', message: 'Deleting the audit trail…' });
    try {
      const res = await fetch('/api/audit-log', { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setStatus({
        kind: 'done',
        message: `Removed ${body.removed} audit ${body.removed === 1 ? 'entry' : 'entries'}. The deletion itself was recorded.`,
      });
    } catch (err: any) {
      setStatus({ kind: 'error', message: `Could not delete the history: ${err.message}` });
    }
  }

  async function removeBackups() {
    const ok = window.confirm(
      'Delete every snapshot?\n\n' +
        'This removes every .tar.gz under the OmniTerm backup directory. Your working ' +
        'directories are untouched — only the snapshots OmniTerm created. This cannot be undone.',
    );
    if (!ok) return;
    setStatus({ kind: 'busy', message: 'Deleting snapshots…' });
    try {
      const res = await fetch('/api/backups', { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setStatus({
        kind: 'done',
        message: `Deleted ${body.removed} snapshot${body.removed === 1 ? '' : 's'} (${(body.freedBytes / 1048576).toFixed(1)} MB freed).`,
      });
    } catch (err: any) {
      setStatus({ kind: 'error', message: `Could not delete the snapshots: ${err.message}` });
    }
  }

  return (
    <div className="border border-[#2A2A2E] rounded bg-[#0F0F11] p-3 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert aria-hidden="true" className="w-3.5 h-3.5 text-[#FF9D5C]" />
        <h2 className="text-[12px] font-semibold text-[#E0E0E5]">Your data</h2>
      </div>

      <p className="text-[11px] text-[#9A9AA3] leading-relaxed">
        OmniTerm keeps everything on this machine: the audit trail in{' '}
        <code className="rounded bg-[#1E1E22] px-1">~/.local/share/omniterm/activity.jsonl</code>{' '}
        and snapshots under <code className="rounded bg-[#1E1E22] px-1">backups/</code>. Nothing is
        sent anywhere. You can delete either one here.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void removeHistory()}
          disabled={status.kind === 'busy'}
          className="px-2.5 py-1.5 text-[11px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#FF5555]/60 disabled:opacity-40 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
        >
          <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
          Delete command history
        </button>
        <button
          type="button"
          onClick={() => void removeBackups()}
          disabled={status.kind === 'busy'}
          className="px-2.5 py-1.5 text-[11px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#FF5555]/60 disabled:opacity-40 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
        >
          <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
          Delete all snapshots
        </button>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={`text-[11px] ${status.kind === 'error' ? 'text-[#FF8888]' : 'text-[#9A9AA3]'}`}
      >
        {status.message}
      </p>
    </div>
  );
}
