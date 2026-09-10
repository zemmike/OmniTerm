import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Network,
  Key,
  RefreshCw,
  FileClock,
  Users,
  AlertCircle,
} from 'lucide-react';

interface Listening {
  proto: string;
  address: string;
  port: string;
  process: string;
  exposed: boolean;
}

interface Posture {
  firewall: string;
  apparmor: string;
  sudoGroups: string;
  sshKeys: number;
  authorizedKeys: number;
  sshService: string;
  worldWritableEtcFiles: number;
  listening: Listening[];
  exposedPorts: number;
  auditFile: string;
  auditEntries: number;
}

const Card: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; tone?: 'ok' | 'warn' | 'neutral' }> = ({
  title,
  icon,
  children,
  tone = 'neutral',
}) => (
  <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-2">
    <div
      className={`flex items-center gap-2 font-bold uppercase text-[11px] tracking-wide ${
        tone === 'ok' ? 'text-[#00FF41]' : tone === 'warn' ? 'text-[#FFBD2E]' : 'text-[#BB86FC]'
      }`}
    >
      {icon}
      <span>{title}</span>
    </div>
    <div className="text-[#E0E0E5] text-xs space-y-1">{children}</div>
  </div>
);

export const SecurityEncryptionView: React.FC = () => {
  const [posture, setPosture] = useState<Posture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/security');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to read security posture');
      setPosture(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const firewallActive = /active/i.test(posture?.firewall || '') && !/inactive/i.test(posture?.firewall || '');

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#00FF41]" />
          <h2 className="font-bold">SYSTEM SECURITY — reported from this machine</h2>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="bg-[#FF5555]/10 border border-[#FF5555]/30 text-[#FF5555] px-4 py-2 rounded flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card
          title="Host firewall"
          icon={<ShieldCheck className="w-4 h-4" />}
          tone={firewallActive ? 'ok' : 'warn'}
        >
          <div className={firewallActive ? 'text-[#00FF41]' : 'text-[#FFBD2E]'}>{posture?.firewall || '—'}</div>
          <div className="text-[#88888E]">
            {firewallActive ? 'Inbound traffic is filtered.' : 'No active ufw/nft ruleset detected — check `ufw status`.'}
          </div>
        </Card>

        <Card title="Mandatory access control" icon={<Lock className="w-4 h-4" />} tone={posture?.apparmor === 'enabled' ? 'ok' : 'warn'}>
          <div>AppArmor: {posture?.apparmor || '—'}</div>
          <div className="text-[#88888E]">Linux Security Module confinement for services and apps.</div>
        </Card>

        <Card title="Remote access" icon={<Key className="w-4 h-4" />} tone={posture?.sshService === 'active' ? 'warn' : 'ok'}>
          <div>sshd service: <span className="font-bold">{posture?.sshService || '—'}</span></div>
          <div>Local private keys: {posture?.sshKeys ?? 0}</div>
          <div>Authorized keys: {posture?.authorizedKeys ?? 0}</div>
        </Card>

        <Card title="Privileged accounts" icon={<Users className="w-4 h-4" />} tone="warn">
          <div className="break-words">{posture?.sudoGroups || 'no sudo group found'}</div>
          <div className="text-[#88888E]">Members can escalate to root — review this list.</div>
        </Card>

        <Card
          title="Filesystem hygiene"
          icon={<ShieldAlert className="w-4 h-4" />}
          tone={(posture?.worldWritableEtcFiles ?? 0) > 0 ? 'warn' : 'ok'}
        >
          <div>World-writable files in /etc: {posture?.worldWritableEtcFiles ?? 0}</div>
          <div className="text-[#88888E]">Anyone on the box could edit these.</div>
        </Card>

        <Card title="Command audit trail" icon={<FileClock className="w-4 h-4" />} tone="ok">
          <div>{posture?.auditEntries ?? 0} recent entries</div>
          <div className="text-[#88888E] break-all">{posture?.auditFile || '—'}</div>
          <a
            href="/api/audit/export"
            className="inline-block mt-1 px-2 py-1 rounded bg-[#00FF41] text-black font-bold uppercase text-[10px]"
          >
            Export JSONL evidence
          </a>
        </Card>
      </div>

      <div className="bg-[#161618] border border-[#2A2A2E] rounded">
        <div className="p-3 border-b border-[#2A2A2E] flex items-center justify-between">
          <span className="font-bold flex items-center gap-2 text-[11px] uppercase tracking-wide">
            <Network className="w-4 h-4 text-[#BB86FC]" />
            Listening sockets ({posture?.listening.length ?? 0})
          </span>
          <span className={(posture?.exposedPorts ?? 0) > 0 ? 'text-[#FFBD2E]' : 'text-[#00FF41]'}>
            {posture?.exposedPorts ?? 0} reachable from the network
          </span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-[#55555E] sticky top-0 bg-[#161618]">
              <tr>
                <th className="p-2">proto</th>
                <th className="p-2">address</th>
                <th className="p-2">port</th>
                <th className="p-2">process</th>
                <th className="p-2">scope</th>
              </tr>
            </thead>
            <tbody>
              {(posture?.listening || []).map((l, idx) => (
                <tr key={idx} className="border-t border-[#2A2A2E]/60">
                  <td className="p-2 text-[#88888E]">{l.proto}</td>
                  <td className="p-2">{l.address}</td>
                  <td className="p-2 text-[#00FF41]">{l.port}</td>
                  <td className="p-2 text-[#88888E] truncate max-w-[16rem]">{l.process}</td>
                  <td className={`p-2 font-bold ${l.exposed ? 'text-[#FFBD2E]' : 'text-[#55555E]'}`}>
                    {l.exposed ? 'network' : 'loopback'}
                  </td>
                </tr>
              ))}
              {!posture?.listening.length && (
                <tr>
                  <td colSpan={5} className="p-3 text-[#55555E]">No listening sockets reported.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
