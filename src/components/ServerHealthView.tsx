import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  Clock,
  Layers,
  Server,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { ServerHealth } from '../types';

export const ServerHealthView: React.FC = () => {
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHealth = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error('Failed to fetch health metrics:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!health) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-125px)] bg-[#0F0F10] text-[#00FF41] font-mono">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-[#00FF41]" />
          <span>Connecting to Telemetry Stream...</span>
        </div>
      </div>
    );
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-6">
      {/* Dashboard Top Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2A2E] pb-4">
        <div>
          <h1 className="text-lg font-bold text-[#E0E0E5] flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#00FF41]" />
            <span>REAL-TIME SERVER HEALTH & PROCESS METRICS</span>
          </h1>
          <p className="text-xs text-[#88888E]">
            Live telemetry stream from Cloud Run instance on <span className="font-mono text-[#00FF41]">{health.systemInfo.hostname}</span>
          </p>
        </div>

        <button
          onClick={fetchHealth}
          className="px-3 py-1.5 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] text-xs font-bold flex items-center gap-2 transition-all text-[#E0E0E5]"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#00FF41] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>REFRESH METRICS</span>
        </button>
      </div>

      {/* Primary 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Utilization */}
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[#00FF41]" />
              <span>CPU Usage ({health.cpuCores} Cores)</span>
            </span>
            <span className="font-mono font-bold text-[#00FF41]">{health.cpuUsage}%</span>
          </div>

          <div className="w-full bg-[#0A0A0B] h-2.5 rounded overflow-hidden border border-[#2A2A2E]">
            <div
              className={`h-full transition-all duration-500 rounded ${
                health.cpuUsage > 80
                  ? 'bg-[#FF5555]'
                  : health.cpuUsage > 50
                  ? 'bg-[#FFBD2E]'
                  : 'bg-[#00FF41]'
              }`}
              style={{ width: `${health.cpuUsage}%` }}
            />
          </div>

          <div className="text-[11px] text-[#55555E] flex justify-between font-mono">
            <span>Load: 0.42, 0.38</span>
            <span>3.20 GHz</span>
          </div>
        </div>

        {/* Memory Consumption */}
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[#3B82F6]" />
              <span>RAM Memory</span>
            </span>
            <span className="font-mono font-bold text-[#3B82F6]">
              {health.memoryUsage.percent}%
            </span>
          </div>

          <div className="w-full bg-[#0A0A0B] h-2.5 rounded overflow-hidden border border-[#2A2A2E]">
            <div
              className="h-full bg-[#3B82F6] transition-all duration-500 rounded"
              style={{ width: `${health.memoryUsage.percent}%` }}
            />
          </div>

          <div className="text-[11px] text-[#55555E] flex justify-between font-mono">
            <span>Used: {(health.memoryUsage.usedMb / 1024).toFixed(1)} GB</span>
            <span>Total: {(health.memoryUsage.totalMb / 1024).toFixed(0)} GB</span>
          </div>
        </div>

        {/* Disk Space Storage */}
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-[#BB86FC]" />
              <span>Disk Partition (/)</span>
            </span>
            <span className="font-mono font-bold text-[#BB86FC]">
              {health.diskUsage.percent}%
            </span>
          </div>

          <div className="w-full bg-[#0A0A0B] h-2.5 rounded overflow-hidden border border-[#2A2A2E]">
            <div
              className="h-full bg-[#BB86FC] transition-all duration-500 rounded"
              style={{ width: `${health.diskUsage.percent}%` }}
            />
          </div>

          <div className="text-[11px] text-[#55555E] flex justify-between font-mono">
            <span>{health.diskUsage.usedGb} GB Used</span>
            <span>{health.diskUsage.totalGb} GB Total</span>
          </div>
        </div>

        {/* Network I/O */}
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <Network className="w-4 h-4 text-[#FFBD2E]" />
              <span>Network Traffic</span>
            </span>
            <span className="font-mono text-[#E0E0E5] font-bold">1 Gbps Interface</span>
          </div>

          <div className="flex items-center justify-between text-xs font-mono pt-1">
            <div className="text-[#00FF41]">
              <span className="text-[10px] text-[#55555E] block">RX Inbound</span>
              <span>{health.networkIO.rxKbps} KB/s</span>
            </div>
            <div className="text-[#3B82F6]">
              <span className="text-[10px] text-[#55555E] block">TX Outbound</span>
              <span>{health.networkIO.txKbps} KB/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* System Info Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 flex items-center gap-3">
          <div className="p-2.5 bg-[#202024] rounded text-[#00FF41] border border-[#2A2A2E]">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-[#88888E] font-bold">OPERATING SYSTEM</div>
            <div className="font-mono text-xs font-bold text-[#E0E0E5]">{health.systemInfo.os}</div>
          </div>
        </div>

        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 flex items-center gap-3">
          <div className="p-2.5 bg-[#202024] rounded text-[#3B82F6] border border-[#2A2A2E]">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-[#88888E] font-bold">SERVER UPTIME</div>
            <div className="font-mono text-xs font-bold text-[#E0E0E5]">{formatUptime(health.uptimeSeconds)}</div>
          </div>
        </div>

        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 flex items-center gap-3">
          <div className="p-2.5 bg-[#202024] rounded text-[#BB86FC] border border-[#2A2A2E]">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-[#88888E] font-bold">ACTIVE PROCESSES</div>
            <div className="font-mono text-xs font-bold text-[#E0E0E5]">
              {health.processCount} processes | {health.activeConnections} HTTP/WS clients
            </div>
          </div>
        </div>
      </div>

      {/* Process Monitor Table */}
      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
          <span className="font-bold text-[#E0E0E5] text-xs flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#00FF41]" />
            <span>TOP ACTIVE SERVER PROCESSES (top / ps)</span>
          </span>
          <span className="text-[11px] text-[#55555E] font-mono">Sorted by CPU %</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-[#E0E0E5]">
            <thead>
              <tr className="border-b border-[#2A2A2E] text-[11px] text-[#55555E] uppercase">
                <th className="py-2 px-3">PID</th>
                <th className="py-2 px-3">Process Command</th>
                <th className="py-2 px-3">CPU %</th>
                <th className="py-2 px-3">Memory (MB)</th>
                <th className="py-2 px-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2E]/60">
              {health.topProcesses.map((p) => (
                <tr key={p.pid} className="hover:bg-[#202024]">
                  <td className="py-2 px-3 text-[#00FF41] font-bold">{p.pid}</td>
                  <td className="py-2 px-3 font-bold text-[#E0E0E5]">{p.name}</td>
                  <td className="py-2 px-3 text-[#FFBD2E]">{p.cpu}%</td>
                  <td className="py-2 px-3 text-[#3B82F6]">{p.memory} MB</td>
                  <td className="py-2 px-3 text-[#88888E]">{p.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
