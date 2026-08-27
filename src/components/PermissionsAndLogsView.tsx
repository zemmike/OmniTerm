import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserCheck,
  FileText,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Users,
} from 'lucide-react';
import { UserRole, ActivityLog, SystemAlert, UserAccount } from '../types';

interface PermissionsAndLogsViewProps {
  currentRole: UserRole;
}

export const PermissionsAndLogsView: React.FC<PermissionsAndLogsViewProps> = ({ currentRole }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const [users] = useState<UserAccount[]>([
    {
      id: 'usr-1',
      username: 'admin_sys',
      email: 'admin@devterminal.io',
      role: 'admin',
      permissions: {
        canExecuteSudo: true,
        canEditSystemFiles: true,
        canManageBackups: true,
        canManageUsers: true,
        canInstallPlugins: true,
        canAccessAiCopilot: true,
        canSyncCloudStorage: true,
      },
      lastLogin: '2026-08-12 07:15',
      status: 'active',
      avatarColor: 'bg-red-500',
    },
    {
      id: 'usr-2',
      username: 'dev_alex',
      email: 'alex.code@devterminal.io',
      role: 'developer',
      permissions: {
        canExecuteSudo: false,
        canEditSystemFiles: true,
        canManageBackups: false,
        canManageUsers: false,
        canInstallPlugins: true,
        canAccessAiCopilot: true,
        canSyncCloudStorage: false,
      },
      lastLogin: '2026-08-12 07:40',
      status: 'active',
      avatarColor: 'bg-emerald-500',
    },
    {
      id: 'usr-3',
      username: 'sec_auditor',
      email: 'audit@devterminal.io',
      role: 'auditor',
      permissions: {
        canExecuteSudo: false,
        canEditSystemFiles: false,
        canManageBackups: false,
        canManageUsers: false,
        canInstallPlugins: false,
        canAccessAiCopilot: true,
        canSyncCloudStorage: false,
      },
      lastLogin: '2026-08-11 18:20',
      status: 'active',
      avatarColor: 'bg-amber-500',
    },
    {
      id: 'usr-4',
      username: 'guest_user',
      email: 'guest@external.com',
      role: 'viewer',
      permissions: {
        canExecuteSudo: false,
        canEditSystemFiles: false,
        canManageBackups: false,
        canManageUsers: false,
        canInstallPlugins: false,
        canAccessAiCopilot: false,
        canSyncCloudStorage: false,
      },
      lastLogin: '2026-08-12 06:10',
      status: 'active',
      avatarColor: 'bg-blue-500',
    },
  ]);

  const fetchLogsAndAlerts = async () => {
    try {
      const [logsRes, alertsRes] = await Promise.all([
        fetch('/api/activity-logs'),
        fetch('/api/alerts'),
      ]);
      const logsData = await logsRes.json();
      const alertsData = await alertsRes.json();
      setLogs(logsData);
      setAlerts(alertsData);
    } catch (err) {
      console.error('Failed to fetch logs and alerts:', err);
    }
  };

  useEffect(() => {
    fetchLogsAndAlerts();
  }, []);

  const permissionMatrix = [
    { key: 'canExecuteSudo', label: 'Execute Elevated Commands (sudo / root)' },
    { key: 'canEditSystemFiles', label: 'Modify System Files & Scripts' },
    { key: 'canManageBackups', label: 'Trigger & Configure Cloud Backups' },
    { key: 'canManageUsers', label: 'User & Role Permission Management' },
    { key: 'canInstallPlugins', label: 'Install Custom Terminal Plugins' },
    { key: 'canAccessAiCopilot', label: 'Query Gemini & Claude Coder AI' },
    { key: 'canSyncCloudStorage', label: 'Sync AWS S3 / GCS Buckets' },
  ];

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-4">
        <div>
          <h1 className="text-lg font-bold text-[#E0E0E5] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#00FF41]" />
            <span>ROLE-BASED ACCESS CONTROL (RBAC) & AUDIT LOGS</span>
          </h1>
          <p className="text-xs text-[#88888E]">
            Granular permission management, active user roster, and real-time administrative oversight logs.
          </p>
        </div>

        <div className="px-3 py-1.5 rounded bg-[#161618] border border-[#2A2A2E] text-xs flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#00FF41]" />
          <span>Active Session Role: <strong className="text-[#00FF41] uppercase">{currentRole}</strong></span>
        </div>
      </div>

      {/* RBAC Permission Matrix Table */}
      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
          <span className="font-bold text-xs text-[#E0E0E5] flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#00FF41]" />
            <span>RBAC PERMISSION GUARD CAPABILITIES MATRIX</span>
          </span>
          <span className="text-[11px] text-[#55555E] font-mono">Enforced at Express API Gateway</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-[#E0E0E5]">
            <thead>
              <tr className="border-b border-[#2A2A2E] text-[11px] text-[#55555E] uppercase">
                <th className="py-2 px-3">System Permission Capability</th>
                <th className="py-2 px-3 text-center text-[#FF5555]">Admin</th>
                <th className="py-2 px-3 text-center text-[#00FF41]">Developer</th>
                <th className="py-2 px-3 text-center text-[#FFBD2E]">Auditor</th>
                <th className="py-2 px-3 text-center text-[#3B82F6]">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2E]/60">
              {permissionMatrix.map((item) => (
                <tr key={item.key} className="hover:bg-[#202024]">
                  <td className="py-2.5 px-3 font-semibold text-[#E0E0E5]">{item.label}</td>
                  <td className="py-2.5 px-3 text-center">
                    <CheckCircle2 className="w-4 h-4 text-[#00FF41] inline" />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {['canEditSystemFiles', 'canInstallPlugins', 'canAccessAiCopilot'].includes(item.key) ? (
                      <CheckCircle2 className="w-4 h-4 text-[#00FF41] inline" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#55555E] inline" />
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {['canAccessAiCopilot'].includes(item.key) ? (
                      <CheckCircle2 className="w-4 h-4 text-[#00FF41] inline" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#55555E] inline" />
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <XCircle className="w-4 h-4 text-[#55555E] inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Roster */}
      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
          <span className="font-bold text-xs text-[#E0E0E5] flex items-center gap-2">
            <Users className="w-4 h-4 text-[#3B82F6]" />
            <span>ACTIVE SYSTEM USER ROSTER</span>
          </span>
          <span className="text-[11px] text-[#55555E]">{users.length} Active Accounts</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {users.map((u) => (
            <div key={u.id} className="p-3 rounded bg-[#0A0A0B] border border-[#2A2A2E] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${u.avatarColor}`} />
                  <span className="font-bold text-[#E0E0E5] font-mono text-xs">{u.username}</span>
                </div>
                <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-[#202024] border border-[#2A2A2E] text-[#E0E0E5]">
                  {u.role}
                </span>
              </div>
              <div className="text-[11px] text-[#88888E] font-mono truncate">{u.email}</div>
              <div className="text-[10px] text-[#55555E] flex justify-between">
                <span>Last login:</span>
                <span>{u.lastLogin}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Activity Logs Table */}
      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2A2A2E] pb-3">
          <span className="font-bold text-xs text-[#E0E0E5] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#00FF41]" />
            <span>ADMINISTRATIVE ACTIVITY AUDIT TRAIL</span>
          </span>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#55555E]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user, action, details..."
                className="bg-[#0A0A0B] border border-[#2A2A2E] rounded px-2.5 py-1 pl-8 text-xs text-[#E0E0E5] focus:outline-none focus:border-[#00FF41] font-mono"
              />
            </div>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-[#0A0A0B] border border-[#2A2A2E] rounded px-2.5 py-1 text-xs text-[#E0E0E5] focus:outline-none focus:border-[#00FF41]"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="security_alert">Security Alert</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-[#E0E0E5]">
            <thead>
              <tr className="border-b border-[#2A2A2E] text-[11px] text-[#55555E] uppercase">
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">User</th>
                <th className="py-2 px-3">Role</th>
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Log Details</th>
                <th className="py-2 px-3">IP Address</th>
                <th className="py-2 px-3">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2E]/60">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#202024]">
                  <td className="py-2 px-3 text-[#55555E] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="py-2 px-3 font-bold text-[#E0E0E5]">{log.username}</td>
                  <td className="py-2 px-3 text-[#88888E] capitalize">{log.role}</td>
                  <td className="py-2 px-3 font-bold text-[#00FF41]">{log.action}</td>
                  <td className="py-2 px-3 text-[#E0E0E5]">{log.details}</td>
                  <td className="py-2 px-3 text-[#55555E]">{log.ip}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        log.severity === 'security_alert'
                          ? 'bg-[#FF5555]/10 text-[#FF5555] border border-[#FF5555]/30'
                          : log.severity === 'warning'
                          ? 'bg-[#FFBD2E]/10 text-[#FFBD2E] border border-[#FFBD2E]/30'
                          : 'bg-[#202024] text-[#88888E] border border-[#2A2A2E]'
                      }`}
                    >
                      {log.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
