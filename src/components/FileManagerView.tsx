import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderTree,
  Folder,
  FileCode,
  FileText,
  Image as ImageIcon,
  Archive,
  Link2,
  Save,
  Plus,
  Home,
  ArrowUp,
  Search,
  CheckCircle,
  AlertCircle,
  Code2,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { UserRole } from '../types';

interface FileManagerViewProps {
  userRole: UserRole;
}

interface Entry {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  owner: string;
  permissions: string;
  language: string;
  isLink?: boolean;
  target?: string | null;
}

function humanSize(bytes: number, type: 'file' | 'directory') {
  if (type === 'directory') return 'dir';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function iconFor(entry: Entry) {
  if (entry.type === 'directory') return <Folder className="w-4 h-4 shrink-0 text-[#3B82F6]" />;
  if (entry.language === 'image') return <ImageIcon className="w-4 h-4 shrink-0 text-[#BB86FC]" />;
  if (entry.language === 'archive') return <Archive className="w-4 h-4 shrink-0 text-[#FFBD2E]" />;
  if (['typescript', 'javascript', 'python', 'rust', 'go', 'c', 'cpp', 'bash'].includes(entry.language))
    return <FileCode className="w-4 h-4 shrink-0 text-[#00FF41]" />;
  return <FileText className="w-4 h-4 shrink-0 text-[#88888E]" />;
}

export const FileManagerView: React.FC<FileManagerViewProps> = ({ userRole }) => {
  const [cwd, setCwd] = useState<string>('');
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [content, setContent] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newContent, setNewContent] = useState('#!/usr/bin/env bash\n\n');

  const listDir = useCallback(async (path?: string) => {
    setError(null);
    try {
      const url = path ? `/api/files?path=${encodeURIComponent(path)}` : '/api/files';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to read directory');
      setCwd(data.path);
      setParent(data.parent);
      setEntries(data.entries || []);
      setNewPath(`${data.path}/new-file.txt`);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const openFile = useCallback(async (entry: Entry) => {
    setSelected(entry);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(entry.path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to read file');
      setContent(data.content ?? '');
      setReadOnly(Boolean(data.readOnly) || userRole === 'viewer');
      setDirty(false);
    } catch (err: any) {
      setError(err.message);
      setContent('');
    }
  }, [userRole]);

  useEffect(() => {
    listDir();
  }, [listDir]);

  const saveFile = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected.path, content, userRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setDirty(false);
      setStatus(`Saved ${data.path} (${data.size} bytes) to disk`);
      setTimeout(() => setStatus(null), 4000);
      listDir(cwd);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createFile = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath, content: newContent, userRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not create file');
      setShowNew(false);
      setStatus(`Created ${data.path}`);
      await listDir(cwd);
      const created = { ...selected, path: data.path, name: data.path.split('/').pop() } as Entry;
      setSelected(created);
      setContent(newContent);
      setDirty(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Ctrl+S / Cmd+S saves the open file.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!readOnly && dirty) saveFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const crumbs = cwd.split('/').filter(Boolean);
  const filtered = entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-125px)] bg-[#0F0F10] text-[#E0E0E5] font-mono text-xs">
      {/* Explorer */}
      <div className="w-full md:w-96 bg-[#161618] border-r border-[#2A2A2E] flex flex-col">
        <div className="p-3 border-b border-[#2A2A2E] space-y-2">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#00FF41]" />
              <span>REAL FILESYSTEM</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => listDir(cwd)}
                className="px-2 py-1 bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] rounded flex items-center gap-1"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setNewPath(`${cwd}/new-file.txt`);
                  setShowNew(true);
                }}
                disabled={userRole === 'viewer'}
                className="px-2 py-1 bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase rounded flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              onClick={() => listDir(parent || cwd)}
              disabled={!parent}
              className="p-1 rounded bg-[#202024] border border-[#2A2A2E] disabled:opacity-30"
              title="Parent directory"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => listDir('~')}
              className="p-1 rounded bg-[#202024] border border-[#2A2A2E]"
              title="Home directory"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap text-[#88888E]">
              <button onClick={() => listDir('/')} className="hover:text-[#00FF41]">/</button>
              {crumbs.map((part, idx) => (
                <span key={idx} className="flex items-center">
                  <button
                    onClick={() => listDir('/' + crumbs.slice(0, idx + 1).join('/'))}
                    className="hover:text-[#00FF41]"
                  >
                    {part}
                  </button>
                  {idx < crumbs.length - 1 && <span className="px-0.5">/</span>}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#55555E]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filter ${entries.length} entries...`}
              className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded px-2.5 py-1 pl-8 focus:outline-none focus:border-[#00FF41] font-mono"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.map((entry) => {
            const isSelected = selected?.path === entry.path;
            return (
              <div
                key={entry.id}
                onClick={() => (entry.type === 'directory' ? listDir(entry.path) : openFile(entry))}
                className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-[#202024] border-[#2A2A2E] border-l-2 border-l-[#00FF41]'
                    : 'bg-[#161618] border-[#2A2A2E]/60 hover:bg-[#202024]'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {entry.isLink && <Link2 className="w-3 h-3 text-[#BB86FC] shrink-0" />}
                  {iconFor(entry)}
                  <div className="truncate">
                    <div className={`truncate ${isSelected ? 'text-[#00FF41] font-bold' : 'text-[#E0E0E5]'}`}>
                      {entry.name}
                    </div>
                    <div className="text-[10px] text-[#55555E]">{entry.modified}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-[#88888E]">{entry.permissions}</div>
                  <div className="text-[10px] text-[#55555E]">{humanSize(entry.size, entry.type)}</div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-[#55555E]">No entries match “{search}”.</div>
          )}
        </div>
      </div>

      {/* Viewer / editor */}
      <div className="flex-1 flex flex-col bg-[#0A0A0B] overflow-hidden">
        {selected && selected.type === 'file' ? (
          <>
            <div className="bg-[#161618] border-b border-[#2A2A2E] p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#00FF41] shrink-0" />
                <span className="font-bold truncate">{selected.path}</span>
                <span className="px-2 py-0.5 rounded bg-[#202024] border border-[#2A2A2E] text-[10px] text-[#88888E] uppercase">
                  {selected.language}
                </span>
                {dirty && (
                  <span className="px-2 py-0.5 rounded bg-[#FFBD2E]/10 border border-[#FFBD2E]/40 text-[10px] text-[#FFBD2E]">
                    unsaved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#55555E] hidden sm:inline">
                  uid {selected.owner} · {selected.permissions}
                </span>
                <button
                  onClick={saveFile}
                  disabled={busy || readOnly || !dirty}
                  className="px-3 py-1.5 rounded bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase flex items-center gap-1.5"
                  title="Save to disk (Ctrl+S)"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{busy ? 'Saving…' : 'Save'}</span>
                </button>
              </div>
            </div>

            {status && (
              <div className="bg-[#00FF41]/10 border-b border-[#00FF41]/30 text-[#00FF41] px-4 py-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>{status}</span>
              </div>
            )}
            {error && (
              <div className="bg-[#FF5555]/10 border-b border-[#FF5555]/30 text-[#FF5555] px-4 py-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            {readOnly && (
              <div className="bg-[#FFBD2E]/10 border-b border-[#FFBD2E]/30 text-[#FFBD2E] px-4 py-2 text-[11px]">
                Read-only — either the role selector is set to “viewer”, or this file is binary / too large to edit here.
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
              <div className="w-10 bg-[#161618] border-r border-[#2A2A2E] py-3 text-right pr-2 text-[#55555E] select-none overflow-hidden">
                {content.split('\n').map((_, idx) => (
                  <div key={idx} className="leading-relaxed">{idx + 1}</div>
                ))}
              </div>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
                readOnly={readOnly}
                spellCheck={false}
                className="flex-1 bg-[#0A0A0B] p-3 text-[#00FF41] focus:outline-none resize-none leading-relaxed font-mono"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-[#88888E] space-y-2 text-center">
            <Code2 className="w-12 h-12 text-[#55555E]" />
            <p className="font-bold">{cwd || 'Loading…'}</p>
            <p>Pick a file to view or edit it. Changes are written straight to disk.</p>
            {error && <p className="text-[#FF5555]">{error}</p>}
          </div>
        )}
      </div>

      {/* New file modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-mono">
          <div className="bg-[#161618] border border-[#2A2A2E] rounded max-w-md w-full p-4 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
              <span className="font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#00FF41]" />
                <span>CREATE FILE ON DISK</span>
              </span>
              <button onClick={() => setShowNew(false)} className="text-[#55555E] hover:text-[#E0E0E5]">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[#88888E] mb-1 font-bold">Absolute path</label>
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded px-3 py-1.5 focus:outline-none focus:border-[#00FF41]"
                />
              </div>
              <div>
                <label className="block text-[#88888E] mb-1 font-bold">Initial content</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded p-2 text-[#00FF41] focus:outline-none focus:border-[#00FF41]"
                />
              </div>
              {error && <p className="text-[#FF5555]">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#2A2A2E]">
              <button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded bg-[#202024] text-[#88888E]">
                Cancel
              </button>
              <button
                onClick={createFile}
                disabled={busy}
                className="px-3 py-1.5 rounded bg-[#00FF41] font-bold text-black uppercase disabled:opacity-40"
              >
                {busy ? 'Writing…' : 'Create file'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
