import React, { useEffect, useState } from 'react';
import {
  FileClock,
  Search,
  Download,
  ShieldAlert,
  AlertTriangle,
  Info,
  RefreshCw,
  Lock,
  Users,
} from 'lucide-react';
import { UserRole } from '../types';

interface PermissionsAndLogsViewProps {
  currentRole: UserRole;
}

interface LogEntry {
  id: string;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  details: string;
  severity: 'info' | 'warning' | 'error' | 'security_alert';
  cwd?: string;
  exitCode?: number | null;
  durationMs?: number;
  command?: string;
}

const GUARD_RULES = [
  'Commands run with your own user rights — no privilege escalation is performed by OmniTerm.',
  'The “viewer” role is read-only: sudo, rm, chmod, chown, touch and shell redirection are refused.',
  'Every command, its exit code and its working directory are appended to the audit trail.',
  'File edits from the Files tab are written through a temp file + rename, and logged as FILE_SAVE.',
  'The API listens on 127.0.0.1 only and requires the per-launch session token.',
];

const severityStyle = (severity: LogEntry['severity']) => {
  switch (severity) {
    case 'security_alert':
      return 'bg-[#FF5555]/10 text-[#FF5555] border-[#FF5555]/30';
    case 'error':
      return 'bg-[#FFBD2E]/10 text-[#FFBD2E] border-[#FFBD2E]/30';
    case 'warning':
      return 'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/30';
    default:
      return 'bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]/30';
  }
};

export const PermissionsAndLogsView: React.FC<PermissionsAndLogsViewProps> = ({ currentRole }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [auditFile, setAuditFile] = useState('');
  const [sudoGroups, setSudoGroups] = useState('');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<'all' | LogEntry['severity']>('all');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [logsRes, secRes] = await Promise.all([fetch('/api/activity-logs'), fetch('/api/security')]);
      const logsData = await logsRes.json();
      const secData = await secRes.json();
      setLogs(logsData.entries || []);
      setAuditFile(logsData.auditFile || '');
      setSudoGroups(secData.sudoGroups || '');
    } catch {
      /* keep whatever we already display */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = logs.filter((log) => {
    const haystack = `${log.username} ${log.action} ${log.details} ${log.command || ''}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesSeverity = severity === 'all' || log.severity === severity;
    return matchesSearch && matchesSeverity;
  });

  const counts = {
    total: logs.length,
    security: logs.filter((l) => l.severity === 'security_alert').length,
    errors: logs.filter((l) => l.severity === 'error').length,
  };

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileClock className="w-5 h-5 text-[#00FF41]" />
          <h2 className="font-bold">COMMAND LOG — real audit trail</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-3 py-1.5 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <a
            href="/api/audit/export"
            className="px-3 py-1.5 rounded bg-[#00FF41] hover:bg-[#00D035] text-black font-bold uppercase flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSONL</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-3">
          <div className="text-[#88888E] uppercase text-[10px] tracking-wide">Entries</div>
          <div className="text-2xl font-bold text-[#E0E0E5]">{counts.total}</div>
        </div>
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-3">
          <div className="text-[#88888E] uppercase text-[10px] tracking-wide">Blocked / security</div>
          <div className="text-2xl font-bold text-[#FF5555]">{counts.security}</div>
        </div>
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-3">
          <div className="text-[#88888E] uppercase text-[10px] tracking-wide">Failed commands</div>
          <div className="text-2xl font-bold text-[#FFBD2E]">{counts.errors}</div>
        </div>
      </div>

      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#55555E]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands, actions, users…"
            className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded px-2.5 py-1.5 pl-8 focus:outline-none focus:border-[#00FF41]"
          />
        </div>
        {(['all', 'info', 'warning', 'error', 'security_alert'] as const).map((level) => (
          <button
            key={level}
            onClick={() => setSeverity(level)}
            className={`px-2.5 py-1 rounded border uppercase text-[10px] ${
              severity === level
                ? 'bg-[#202024] border-[#00FF41] text-[#00FF41] font-bold'
                : 'bg-[#0A0A0B] border-[#2A2A2E] text-[#88888E]'
            }`}
          >
            {level.replace('_', ' ')}
          </button>
        ))}
        <span className="text-[10px] text-[#55555E] break-all">trail: {auditFile || '—'}</span>
      </div>

      <div className="bg-[#161618] border border-[#2A2A2E] rounded overflow-hidden">
        <div className="max-h-[26rem] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="text-[#55555E] sticky top-0 bg-[#161618]">
              <tr>
                <th className="p-2">time</th>
                <th className="p-2">severity</th>
                <th className="p-2">action</th>
                <th className="p-2">user / role</th>
                <th className="p-2">details</th>
                <th className="p-2 text-right">exit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-t border-[#2A2A2E]/60 hover:bg-[#202024]/40">
                  <td className="p-2 text-[#88888E] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="p-2">
                    <span className={`px-1.5 py-0.5 rounded border uppercase text-[10px] ${severityStyle(log.severity)}`}>
                      {log.severity.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-2 text-[#E0E0E5] whitespace-nowrap">{log.action}</td>
                  <td className="p-2 text-[#88888E] whitespace-nowrap">
                    {log.username} / {log.role}
                  </td>
                  <td className="p-2 text-[#00FF41] break-all">{log.details}</td>
                  <td className={`p-2 text-right ${log.exitCode === 0 ? 'text-[#00FF41]' : 'text-[#FF5555]'}`}>
                    {log.exitCode === null || log.exitCode === undefined ? '—' : log.exitCode}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-[#55555E]">
                    No entries yet — run something in the Terminal tab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-2">
          <div className="flex items-center gap-2 font-bold uppercase text-[10px] tracking-wide text-[#BB86FC]">
            <Lock className="w-4 h-4" />
            <span>Command Guard rules</span>
          </div>
          <ul className="space-y-1.5 text-[#88888E]">
            {GUARD_RULES.map((rule) => (
              <li key={rule} className="flex gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#55555E]" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <div className="text-[10px] text-[#55555E]">Active role: {currentRole}</div>
        </div>

        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-2">
          <div className="flex items-center gap-2 font-bold uppercase text-[10px] tracking-wide text-[#FFBD2E]">
            <Users className="w-4 h-4" />
            <span>Accounts that can escalate</span>
          </div>
          <div className="break-words text-[#E0E0E5]">{sudoGroups || 'no sudo group entries found'}</div>
          <div className="flex items-start gap-2 text-[#88888E] text-[10px]">
            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              OmniTerm never elevates privileges itself. Anything run as root comes from your own sudo session and is
              recorded in the trail above.
            </span>
          </div>
          <div className="flex items-start gap-2 text-[#88888E] text-[10px]">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              The audit file is plain JSONL with mode 0600 in your home directory — copy it off-box if you need
              tamper-evident retention.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
