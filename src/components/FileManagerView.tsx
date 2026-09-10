import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderTree,
  Folder,
  FileCode,
  FileText,
  Image as ImageIcon,
  Archive,
  Link2,
  FileBox,
  FileAudio,
  FileVideoCamera,
  FileCog,
  FileTerminal,
  FileSpreadsheet,
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

/* ------------------------------------------------------------------ *
 * File-type colour coding                                             *
 *                                                                     *
 * Every entry is classified into exactly ONE kind. FILE_KINDS is the  *
 * single source of truth for the legend, and fileStyle() resolves the *
 * same kind -> colour/badge table for the listing rows, so the table  *
 * and the legend can never drift apart.                               *
 * ------------------------------------------------------------------ */

type FileKind =
  | 'directory'
  | 'symlink'
  | 'executable'
  | 'code'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'config'
  | 'document'
  | 'notebook'
  | 'binary';

interface FileKindMeta {
  kind: FileKind;
  label: string;
  colour: string;
  badge: string;
}

interface FileStyle extends FileKindMeta {
  iconColor: string;
  textColor: string;
  badgeClass: string;
  bold: boolean;
}

// The one table the legend is built from.
const FILE_KINDS: FileKindMeta[] = [
  { kind: 'directory', label: 'Directory', colour: '#3B82F6', badge: 'DIR' },
  { kind: 'symlink', label: 'Symlink', colour: '#22D3EE', badge: 'LNK' },
  { kind: 'executable', label: 'Executable', colour: '#00FF41', badge: 'EXE' },
  { kind: 'code', label: 'Code', colour: '#86EFAC', badge: 'CODE' },
  { kind: 'image', label: 'Image', colour: '#BB86FC', badge: 'IMG' },
  { kind: 'video', label: 'Video', colour: '#F472B6', badge: 'VID' },
  { kind: 'audio', label: 'Audio', colour: '#FB923C', badge: 'AUD' },
  { kind: 'archive', label: 'Archive', colour: '#FFBD2E', badge: 'ARC' },
  { kind: 'config', label: 'Config', colour: '#94A3B8', badge: 'CFG' },
  { kind: 'document', label: 'Document', colour: '#EF4444', badge: 'DOC' },
  { kind: 'document', label: 'Text', colour: '#A1A1AA', badge: 'TXT' },
  { kind: 'notebook', label: 'Notebook', colour: '#7DD3FC', badge: 'NB' },
  { kind: 'binary', label: 'Binary', colour: '#6B7280', badge: 'BIN' },
];

// Literal Tailwind class strings. These must appear verbatim in this file so
// Tailwind's JIT compiler emits them — it cannot see names built at runtime.
const TEXT_CLASS: Record<string, string> = {
  '#3B82F6': 'text-[#3B82F6]',
  '#22D3EE': 'text-[#22D3EE]',
  '#00FF41': 'text-[#00FF41]',
  '#86EFAC': 'text-[#86EFAC]',
  '#BB86FC': 'text-[#BB86FC]',
  '#F472B6': 'text-[#F472B6]',
  '#FB923C': 'text-[#FB923C]',
  '#FFBD2E': 'text-[#FFBD2E]',
  '#94A3B8': 'text-[#94A3B8]',
  '#EF4444': 'text-[#EF4444]',
  '#A1A1AA': 'text-[#A1A1AA]',
  '#7DD3FC': 'text-[#7DD3FC]',
  '#6B7280': 'text-[#6B7280]',
  '#E3B341': 'text-[#E3B341]',
  '#4EC9B0': 'text-[#4EC9B0]',
  '#FF7A45': 'text-[#FF7A45]',
  '#67E8F9': 'text-[#67E8F9]',
  '#C084FC': 'text-[#C084FC]',
  '#F87171': 'text-[#F87171]',
};

const BADGE_CLASS: Record<string, string> = {
  '#3B82F6': 'bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30',
  '#22D3EE': 'bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/30',
  '#00FF41': 'bg-[#00FF41]/15 text-[#00FF41] border-[#00FF41]/30',
  '#86EFAC': 'bg-[#86EFAC]/15 text-[#86EFAC] border-[#86EFAC]/30',
  '#BB86FC': 'bg-[#BB86FC]/15 text-[#BB86FC] border-[#BB86FC]/30',
  '#F472B6': 'bg-[#F472B6]/15 text-[#F472B6] border-[#F472B6]/30',
  '#FB923C': 'bg-[#FB923C]/15 text-[#FB923C] border-[#FB923C]/30',
  '#FFBD2E': 'bg-[#FFBD2E]/15 text-[#FFBD2E] border-[#FFBD2E]/30',
  '#94A3B8': 'bg-[#94A3B8]/15 text-[#94A3B8] border-[#94A3B8]/30',
  '#EF4444': 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30',
  '#A1A1AA': 'bg-[#A1A1AA]/15 text-[#A1A1AA] border-[#A1A1AA]/30',
  '#7DD3FC': 'bg-[#7DD3FC]/15 text-[#7DD3FC] border-[#7DD3FC]/30',
  '#6B7280': 'bg-[#6B7280]/15 text-[#6B7280] border-[#6B7280]/30',
  '#E3B341': 'bg-[#E3B341]/15 text-[#E3B341] border-[#E3B341]/30',
  '#4EC9B0': 'bg-[#4EC9B0]/15 text-[#4EC9B0] border-[#4EC9B0]/30',
  '#FF7A45': 'bg-[#FF7A45]/15 text-[#FF7A45] border-[#FF7A45]/30',
  '#67E8F9': 'bg-[#67E8F9]/15 text-[#67E8F9] border-[#67E8F9]/30',
  '#C084FC': 'bg-[#C084FC]/15 text-[#C084FC] border-[#C084FC]/30',
  '#F87171': 'bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30',
};

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg', 'tiff', 'tif', 'avif', 'heic']);
const VIDEO_EXT = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', 'ogv', '3gp']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'wma', 'aiff', 'mid', 'midi']);
const ARCHIVE_EXT = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'deb', 'rpm', 'rar', 'zst', 'jar', 'lz', 'lzma']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'odt', 'rtf']);
const TXT_EXT = new Set(['txt', 'log', 'text', 'csv', 'tsv']);
const CONFIG_EXT = new Set(['conf', 'cfg', 'ini', 'rc', 'env', 'service', 'properties', 'editorconfig', 'npmrc']);
const CONFIG_LANG = new Set(['nginx', 'ini']);
const RC_NAMES = new Set([
  '.env', '.bashrc', '.bash_profile', '.bash_aliases', '.zshrc', '.zprofile', '.profile',
  '.vimrc', '.gitconfig', '.gitignore', '.dockerignore', '.editorconfig', '.npmrc',
  '.eslintrc', '.prettierrc', '.babelrc', '.tmux.conf',
]);
const CODE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'pyw', 'rs', 'go', 'json', 'jsonc', 'yaml', 'yml',
  'toml', 'md', 'mdx', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'sql', 'c',
  'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'java', 'rb', 'php', 'swift', 'kt', 'kts', 'sh', 'bash',
  'zsh', 'fish', 'lua', 'pl', 'pm', 'r', 'dart', 'scala', 'hs', 'ex', 'exs', 'xml', 'gradle',
  'groovy', 'clj', 'erl', 'vb', 'asm',
]);
const EXTENSIONLESS_CODE = new Set(['makefile', 'dockerfile', 'gemfile', 'rakefile', 'procfile']);

// code colour by language token (as reported by /api/files) or raw extension.
const CODE_COLOUR: Record<string, string> = {
  typescript: '#E3B341',
  javascript: '#E3B341',
  ts: '#E3B341', tsx: '#E3B341', js: '#E3B341', jsx: '#E3B341', mjs: '#E3B341', cjs: '#E3B341',
  python: '#4EC9B0', py: '#4EC9B0', pyw: '#4EC9B0',
  rust: '#FF7A45', rs: '#FF7A45',
  go: '#67E8F9',
  json: '#C084FC', jsonc: '#C084FC', yaml: '#C084FC', yml: '#C084FC', toml: '#C084FC',
  markdown: '#7DD3FC', md: '#7DD3FC', mdx: '#7DD3FC',
  html: '#F87171', htm: '#F87171', css: '#F87171', scss: '#F87171', sass: '#F87171',
  less: '#F87171', vue: '#F87171', svelte: '#F87171',
  sql: '#86EFAC',
  c: '#86EFAC', cpp: '#86EFAC', bash: '#86EFAC',
};
const CODE_FALLBACK_COLOUR = '#86EFAC';

function kindStyle(kind: FileKind, colour?: string, badge?: string): FileStyle {
  const meta =
    FILE_KINDS.find((k) => k.kind === kind && k.badge === badge) ||
    FILE_KINDS.find((k) => k.kind === kind) ||
    FILE_KINDS[FILE_KINDS.length - 1];
  const resolvedColour = colour || meta.colour;
  const bold = kind === 'directory' || kind === 'executable';
  const text = `${TEXT_CLASS[resolvedColour] || TEXT_CLASS['#6B7280']}${bold ? ' font-bold' : ''}`;
  return {
    kind,
    label: meta.label,
    colour: resolvedColour,
    badge: badge || meta.badge,
    iconColor: text,
    textColor: text,
    badgeClass: BADGE_CLASS[resolvedColour] || BADGE_CLASS['#6B7280'],
    bold,
  };
}

function isConfigFile(name: string, ext: string, lang: string): boolean {
  if (CONFIG_EXT.has(ext) || CONFIG_LANG.has(lang)) return true;
  if (RC_NAMES.has(name.toLowerCase())) return true;
  if (name.startsWith('.') && name.length > 1) return true; // dotfiles
  if (/(^|\.)env(\.|$)/i.test(name)) return true; // .env, .env.local, foo.env
  return false;
}

// Classify an entry into exactly one kind and resolve its colour/badge.
function fileStyle(entry: Entry): FileStyle {
  const name = entry.name || '';
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot > 0 ? lower.slice(dot + 1) : '';
  const lang = (entry.language || '').toLowerCase();
  const perms = entry.permissions || '';

  // 1. Directories win over everything.
  if (entry.type === 'directory') return kindStyle('directory');

  // 2. Symlinks ('l' permission prefix, or the isLink flag).
  if (entry.isLink || perms.startsWith('l')) return kindStyle('symlink');

  // 3. Executable bit (x anywhere in rwx bits).
  if (perms.includes('x')) return kindStyle('executable');

  // 4. Media / archives — the API already flags some of these.
  if (lang === 'image' || IMAGE_EXT.has(ext)) return kindStyle('image');
  if (VIDEO_EXT.has(ext)) return kindStyle('video');
  if (AUDIO_EXT.has(ext)) return kindStyle('audio');
  if (lang === 'archive' || ARCHIVE_EXT.has(ext)) return kindStyle('archive');

  // 5. Notebooks.
  if (ext === 'ipynb') return kindStyle('notebook');

  // 6. Config / dotfiles / rc / env.
  if (isConfigFile(name, ext, lang)) return kindStyle('config');

  // 7. Documents.
  if (DOC_EXT.has(ext)) return kindStyle('document');
  if (TXT_EXT.has(ext)) return kindStyle('document', '#A1A1AA', 'TXT');

  // 8. Code — language token first, then extension for files the API calls "text".
  if (CODE_COLOUR[lang]) return kindStyle('code', CODE_COLOUR[lang], 'CODE');
  if (CODE_EXT.has(ext)) return kindStyle('code', CODE_COLOUR[ext] || CODE_FALLBACK_COLOUR, 'CODE');
  if (EXTENSIONLESS_CODE.has(lower)) return kindStyle('code', CODE_FALLBACK_COLOUR, 'CODE');

  // 9. Anything left is unknown / binary.
  return kindStyle('binary');
}

function iconFor(style: FileStyle) {
  const cls = `w-4 h-4 shrink-0 ${style.iconColor}`;
  // Purely decorative: the file name is right next to the icon in text.
  switch (style.kind) {
    case 'directory': return <Folder aria-hidden="true" className={cls} />;
    case 'symlink': return <Link2 aria-hidden="true" className={cls} />;
    case 'executable': return <FileTerminal aria-hidden="true" className={cls} />;
    case 'code': return <FileCode aria-hidden="true" className={cls} />;
    case 'image': return <ImageIcon aria-hidden="true" className={cls} />;
    case 'video': return <FileVideoCamera aria-hidden="true" className={cls} />;
    case 'audio': return <FileAudio aria-hidden="true" className={cls} />;
    case 'archive': return <Archive aria-hidden="true" className={cls} />;
    case 'config': return <FileCog aria-hidden="true" className={cls} />;
    case 'notebook': return <FileSpreadsheet aria-hidden="true" className={cls} />;
    case 'document': return <FileText aria-hidden="true" className={cls} />;
    default: return <FileBox aria-hidden="true" className={cls} />;
  }
}

type FilterId = 'all' | 'code' | 'images' | 'archives' | 'docs' | 'config' | 'other';

// Filter chips reuse the same classifier, so a chip can never disagree with a row.
const FILE_FILTERS: { id: FilterId; label: string; match: (s: FileStyle) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'code', label: 'Code', match: (s) => s.kind === 'code' },
  { id: 'images', label: 'Images', match: (s) => s.kind === 'image' },
  { id: 'archives', label: 'Archives', match: (s) => s.kind === 'archive' },
  { id: 'docs', label: 'Docs', match: (s) => s.kind === 'document' || s.kind === 'notebook' },
  { id: 'config', label: 'Config', match: (s) => s.kind === 'config' },
  {
    id: 'other',
    label: 'Other',
    match: (s) => !['code', 'image', 'archive', 'document', 'notebook', 'config'].includes(s.kind),
  },
];


export const FileManagerView: React.FC<FileManagerViewProps> = () => {
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

  const [kindFilter, setKindFilter] = useState<FilterId>('all');
  const [showLegend, setShowLegend] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newContent, setNewContent] = useState('#!/usr/bin/env bash\n\n');
  // Element to hand focus back to when the create-file dialog closes.
  const newFileReturnRef = useRef<HTMLElement | null>(null);

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
      setReadOnly(Boolean(data.readOnly));
      setDirty(false);
    } catch (err: any) {
      setError(err.message);
      setContent('');
    }
  }, []);

  useEffect(() => {
    listDir();
  }, [listDir]);

  // The create-file overlay is a modal dialog: Escape closes it, and focus
  // returns to the button that opened it.
  useEffect(() => {
    if (!showNew) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNew(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const returnTo = newFileReturnRef.current;
      if (returnTo && returnTo.isConnected) returnTo.focus();
    };
  }, [showNew]);

  const saveFile = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected.path, content }),
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
        body: JSON.stringify({ path: newPath, content: newContent }),
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
  const activeFilter = FILE_FILTERS.find((f) => f.id === kindFilter) ?? FILE_FILTERS[0];
  const query = search.trim().toLowerCase();
  // One classification pass drives the rows, the badges and the chips.
  const filtered = entries
    .map((entry) => ({ entry, style: fileStyle(entry) }))
    .filter(({ entry, style }) => entry.name.toLowerCase().includes(query) && activeFilter.match(style));


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
                className="px-2 py-1 bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] rounded flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
                title="Refresh"
                aria-label="Refresh directory listing"
              >
                <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  newFileReturnRef.current = document.activeElement as HTMLElement | null;
                  setNewPath(`${cwd}/new-file.txt`);
                  setShowNew(true);
                }}
                disabled={readOnly}
                className="px-2 py-1 bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase rounded flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
                aria-haspopup="dialog"
              >
                <Plus aria-hidden="true" className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              onClick={() => listDir(parent || cwd)}
              disabled={!parent}
              className="p-1 rounded bg-[#202024] border border-[#2A2A2E] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
              title="Parent directory"
              aria-label="Go to parent directory"
            >
              <ArrowUp aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => listDir('~')}
              className="p-1 rounded bg-[#202024] border border-[#2A2A2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
              title="Home directory"
              aria-label="Go to home directory"
            >
              <Home aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap text-[#88888E]">
              <button onClick={() => listDir('/')} className="hover:text-[#00FF41]" aria-label="Go to root directory">/</button>
              {crumbs.map((part, idx) => (
                <span key={idx} className="flex items-center">
                  <button
                    onClick={() => listDir('/' + crumbs.slice(0, idx + 1).join('/'))}
                    className="hover:text-[#00FF41]"
                    aria-label={`Go to ${crumbs.slice(0, idx + 1).join('/')}`}
                  >
                    {part}
                  </button>
                  {idx < crumbs.length - 1 && <span aria-hidden="true" className="px-0.5">/</span>}
                </span>
              ))}
            </nav>
          </div>

          <div className="relative">
            <Search aria-hidden="true" className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#55555E]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filter ${entries.length} entries...`}
              aria-label="Filter entries by name"
              className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded px-2.5 py-1 pl-8 focus:outline-none focus:border-[#00FF41] focus-visible:ring-1 focus-visible:ring-[#00FF41] font-mono"
            />
          </div>

          {/* Filter chips — classified with the same helper as the rows */}
          <div role="group" aria-label="Filter by file type" className="flex flex-wrap items-center gap-1">
            {FILE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setKindFilter(f.id)}
                aria-pressed={kindFilter === f.id}
                className={`px-2 py-0.5 rounded border text-[10px] uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41] ${
                  kindFilter === f.id
                    ? 'bg-[#00FF41]/15 border-[#00FF41]/50 text-[#00FF41] font-bold'
                    : 'bg-[#202024] border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5] hover:border-[#3A3A3E]'
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setShowLegend((v) => !v)}
              aria-expanded={showLegend}
              className={`ml-auto px-2 py-0.5 rounded border text-[10px] uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41] ${
                showLegend
                  ? 'bg-[#202024] border-[#3A3A3E] text-[#E0E0E5]'
                  : 'bg-[#202024] border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5]'
              }`}
              title="Toggle colour legend"
            >
              {showLegend ? 'Legend ▲' : 'Legend ▼'}
            </button>
          </div>

          {/* Legend — built from FILE_KINDS, the same table the rows classify with */}
          {showLegend && (
            <div className="flex flex-wrap items-center gap-1">
              {FILE_KINDS.map((k, i) => (
                <span
                  key={`${k.kind}-${k.badge}-${i}`}
                  className={`px-1.5 py-0.5 rounded border text-[10px] ${BADGE_CLASS[k.colour] || BADGE_CLASS['#6B7280']}`}
                >
                  <span className="font-bold">{k.label}</span>
                  <span className="opacity-70 ml-1">{k.badge}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div role="group" aria-label="Directory contents" className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.map(({ entry, style }) => {
            const isSelected = selected?.path === entry.path;
            return (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                aria-label={entry.type === 'directory' ? `Open directory ${entry.name}` : `Open file ${entry.name}`}
                onClick={() => (entry.type === 'directory' ? listDir(entry.path) : openFile(entry))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (entry.type === 'directory') listDir(entry.path);
                    else openFile(entry);
                  }
                }}
                className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41] ${
                  isSelected
                    ? 'bg-[#202024] border-[#2A2A2E] border-l-2 border-l-[#00FF41]'
                    : 'bg-[#161618] border-[#2A2A2E]/60 hover:bg-[#202024]'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {entry.isLink && style.kind !== 'symlink' && (
                    <Link2 className="w-3 h-3 text-[#22D3EE] shrink-0" title={entry.target || 'symbolic link'} />
                  )}
                  {iconFor(style)}
                  <div className="truncate">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`truncate ${style.textColor}`}>{entry.name}</span>
                      <span
                        className={`px-1 py-px rounded border text-[9px] font-bold tracking-wider uppercase shrink-0 ${style.badgeClass}`}
                      >
                        {style.badge}
                      </span>
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
            <div className="p-4 text-center text-[#55555E]">
              {query || kindFilter !== 'all' ? (
                <>
                  No entries match
                  {query ? <> “{search}”</> : null}
                  {kindFilter !== 'all' ? (
                    <>
                      {' '}in <span className="text-[#88888E]">{activeFilter.label}</span>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                'This directory is empty.'
              )}
            </div>
          )}
        </div>
      </div>

      {/* Viewer / editor */}
      <div className="flex-1 flex flex-col bg-[#0A0A0B] overflow-hidden">
        {selected && selected.type === 'file' ? (
          <>
            <div className="bg-[#161618] border-b border-[#2A2A2E] p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText aria-hidden="true" className="w-4 h-4 text-[#00FF41] shrink-0" />
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
                  className="px-3 py-1.5 rounded bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
                  title="Save to disk (Ctrl+S)"
                >
                  <Save aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>{busy ? 'Saving…' : 'Save'}</span>
                </button>
              </div>
            </div>

            {status && (
              <div role="status" aria-live="polite" className="bg-[#00FF41]/10 border-b border-[#00FF41]/30 text-[#00FF41] px-4 py-2 flex items-center gap-2">
                <CheckCircle aria-hidden="true" className="w-4 h-4" />
                <span>{status}</span>
              </div>
            )}
            {error && (
              <div role="alert" className="bg-[#FF5555]/10 border-b border-[#FF5555]/30 text-[#FF5555] px-4 py-2 flex items-center gap-2">
                <AlertCircle aria-hidden="true" className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            {readOnly && (
              <div className="bg-[#FFBD2E]/10 border-b border-[#FFBD2E]/30 text-[#FFBD2E] px-4 py-2 text-[11px]">
                Read-only — either the role selector is set to “viewer”, or this file is binary / too large to edit here.
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
              <div aria-hidden="true" className="w-10 bg-[#161618] border-r border-[#2A2A2E] py-3 text-right pr-2 text-[#55555E] select-none overflow-hidden">
                {content.split('\n').map((_, idx) => (
                  <div key={idx} className="leading-relaxed">{idx + 1}</div>
                ))}
              </div>
              <textarea
                value={content}
                aria-label={`Contents of ${selected.path}`}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
                readOnly={readOnly}
                spellCheck={false}
                className="flex-1 bg-[#0A0A0B] p-3 text-[#00FF41] focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#00FF41] resize-none leading-relaxed font-mono"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-[#88888E] space-y-2 text-center">
            <Code2 aria-hidden="true" className="w-12 h-12 text-[#55555E]" />
            <p className="font-bold">{cwd || 'Loading…'}</p>
            <p>Pick a file to view or edit it. Changes are written straight to disk.</p>
            {error && <p className="text-[#FF5555]">{error}</p>}
          </div>
        )}
      </div>

      {/* New file modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-mono">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="omniterm-create-file-title"
            className="bg-[#161618] border border-[#2A2A2E] rounded max-w-md w-full p-4 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
              <span className="font-bold flex items-center gap-2">
                <Plus aria-hidden="true" className="w-4 h-4 text-[#00FF41]" />
                <span id="omniterm-create-file-title">CREATE FILE ON DISK</span>
              </span>
              <button
                onClick={() => setShowNew(false)}
                className="text-[#55555E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
                aria-label="Close dialog"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="omniterm-new-path" className="block text-[#88888E] mb-1 font-bold">Absolute path</label>
                <input
                  id="omniterm-new-path"
                  type="text"
                  autoFocus
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded px-3 py-1.5 focus:outline-none focus:border-[#00FF41] focus-visible:ring-1 focus-visible:ring-[#00FF41]"
                />
              </div>
              <div>
                <label htmlFor="omniterm-new-content" className="block text-[#88888E] mb-1 font-bold">Initial content</label>
                <textarea
                  id="omniterm-new-content"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded p-2 text-[#00FF41] focus:outline-none focus:border-[#00FF41] focus-visible:ring-1 focus-visible:ring-[#00FF41]"
                />
              </div>
              {error && <p className="text-[#FF5555]">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#2A2A2E]">
              <button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded bg-[#202024] text-[#88888E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]">
                Cancel
              </button>
              <button
                onClick={createFile}
                disabled={busy}
                className="px-3 py-1.5 rounded bg-[#00FF41] font-bold text-black uppercase disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
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
