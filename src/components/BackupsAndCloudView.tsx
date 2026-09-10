import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  Play,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Terminal,
} from 'lucide-react';

interface Snapshot {
  id: string;
  name: string;
  path: string;
  schedule: string;
  lastRun: string;
  targetCloud: string;
  status: string;
  sizeMb: number;
}

export const BackupsAndCloudView: React.FC = () => {
  const [dir, setDir] = useState<string>('');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [source, setSource] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to list snapshots');
      setDir(data.dir);
      setSnapshots(data.backups || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    fetch('/api/env')
      .then((r) => r.json())
      .then((env) => setSource((prev) => prev || env.home || ''))
      .catch(() => undefined);
  }, []);

  const runSnapshot = async () => {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/backups/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Snapshot failed');
      setMessage(`Snapshot written: ${data.path} (${data.sizeMb} MB)`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const totalMb = snapshots.reduce((sum, s) => sum + s.sizeMb, 0);

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-[#00FF41]" />
          <h2 className="font-bold">SNAPSHOTS — real tar.gz archives on disk</h2>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="md:col-span-2">
            <label className="block text-[#88888E] mb-1 font-bold uppercase text-[10px] tracking-wide">
              Directory to snapshot
            </label>
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#00FF41]" />
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="/home/you/project"
                className="flex-1 bg-[#0A0A0B] border border-[#2A2A2E] rounded px-2.5 py-1.5 focus:outline-none focus:border-[#00FF41]"
              />
            </div>
            <p className="text-[10px] text-[#55555E] mt-1">
              Backups are plain <code>tar.gz</code> files — nothing is uploaded anywhere.
            </p>
          </div>
          <div className="flex items-end">
            <button
              onClick={runSnapshot}
              disabled={running || !source}
              className="w-full px-3 py-2 rounded bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              <span>{running ? 'Creating snapshot…' : 'Create snapshot now'}</span>
            </button>
          </div>
        </div>

        <div className="text-[11px] text-[#88888E]">
          Archive directory: <span className="text-[#E0E0E5] break-all">{dir || '—'}</span>
        </div>

        {message && (
          <div className="bg-[#00FF41]/10 border border-[#00FF41]/30 text-[#00FF41] px-3 py-2 rounded flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4" />
            <span className="break-all">{message}</span>
          </div>
        )}
        {error && (
          <div className="bg-[#FF5555]/10 border border-[#FF5555]/30 text-[#FF5555] px-3 py-2 rounded flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4" />
            <span className="break-all">{error}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#88888E]">
        <span>{snapshots.length} snapshot(s) · {totalMb.toFixed(1)} MB total</span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          newest first
        </span>
      </div>

      <div className="bg-[#161618] border border-[#2A2A2E] rounded divide-y divide-[#2A2A2E]">
        {snapshots.map((snap) => (
          <div key={snap.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="font-bold text-[#E0E0E5] truncate">{snap.name}</div>
              <div className="text-[10px] text-[#55555E] break-all">{snap.path}</div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[#88888E]">{snap.lastRun}</span>
              <span className="text-[#00FF41] font-bold">{snap.sizeMb} MB</span>
              <span className="px-2 py-0.5 rounded bg-[#202024] border border-[#2A2A2E] text-[10px] text-[#88888E]">
                local
              </span>
            </div>
            <div className="w-full flex items-center gap-2 text-[10px] text-[#55555E]">
              <Terminal className="w-3 h-3" />
              <code className="break-all">tar -xzf &quot;{snap.path}&quot; -C /restore/target</code>
            </div>
          </div>
        ))}
        {!snapshots.length && (
          <div className="p-6 text-center text-[#55555E] text-xs">
            No snapshots yet — create one above, or run <code>backup run</code> in the terminal.
          </div>
        )}
      </div>
    </div>
  );
};
