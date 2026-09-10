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
  Thermometer,
  MemoryStick,
  Database,
  HardDriveDownload,
} from 'lucide-react';
import { ServerHealth } from '../types';

const CARD = 'bg-[#161618] border border-[#2A2A2E] rounded';
const BAR_BG = 'w-full bg-[#0A0A0B] rounded overflow-hidden border border-[#2A2A2E]';

const fmtMb = (mb: number): string =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;

const usageColor = (pct: number): string =>
  pct > 85 ? '#FF5555' : pct > 65 ? '#FFBD2E' : '#00FF41';

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
    void fetchHealth();
    const interval = setInterval(() => {
      void fetchHealth();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!health) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center h-[calc(100vh-125px)] bg-[#0F0F10] text-[#00FF41] font-mono"
      >
        <div className="flex items-center gap-3">
          <RefreshCw aria-hidden="true" className="w-6 h-6 animate-spin text-[#00FF41]" />
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

  const mem = health.memoryBreakdown ?? null;
  const memProcs = health.topMemoryProcesses ?? [];
  const memGroups = health.memoryByGroup ?? [];
  const swap = health.swapUsage ?? null;
  const mounts = health.mounts ?? [];
  const diskIO = health.diskIO ?? null;
  const perCore = health.perCoreCpu ?? [];
  const temp = typeof health.cpuTemperature === 'number' ? health.cpuTemperature : null;

  // Three slices that always sum to the physical RAM total:
  // used (not reclaimable) + cache/buffers (reclaimable) + free-available.
  // The cache slice is clamped to MemAvailable so the arithmetic still adds up
  // when reclaimable cache exceeds what the kernel reports as available.
  const cacheMb = mem ? mem.buffers + mem.cached : 0;
  const usedSegMb = mem ? Math.max(0, mem.total - mem.available) : 0;
  const cacheSegMb = mem ? Math.min(cacheMb, mem.available) : 0;
  const freeSegMb = mem ? Math.max(0, mem.available - cacheSegMb) : 0;
  const segTotal = mem ? mem.total || usedSegMb + cacheSegMb + freeSegMb || 1 : 1;
  const segPct = (mb: number) => `${(mb / segTotal) * 100}%`;

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-6">
      {/* Dashboard Top Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2A2E] pb-4">
        <div>
          <h1 className="text-lg font-bold text-[#E0E0E5] flex items-center gap-2">
            <Activity aria-hidden="true" className="w-5 h-5 text-[#00FF41]" />
            <span>THIS MACHINE — LIVE HEALTH & PROCESS METRICS</span>
          </h1>
          <p className="text-xs text-[#88888E]">
            Read live from{' '}
            <span className="font-mono text-[#00FF41]">{health.systemInfo.hostname}</span> — the
            machine OmniTerm is running on ({health.systemInfo.os} · {health.systemInfo.arch}) — via
            /proc, statfs and ps.
          </p>
        </div>

        <button
          onClick={fetchHealth}
          aria-busy={isRefreshing}
          className="px-3 py-1.5 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] text-xs font-bold flex items-center gap-2 transition-all text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
        >
          <RefreshCw
            aria-hidden="true"
            className={`w-3.5 h-3.5 text-[#00FF41] ${isRefreshing ? 'animate-spin' : ''}`}
          />
          <span>REFRESH METRICS</span>
        </button>
      </div>

      {/* Primary 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Utilization */}
        <div className={`${CARD} p-4 space-y-3 relative overflow-hidden`}>
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <Cpu aria-hidden="true" className="w-4 h-4 text-[#00FF41]" />
              <span>CPU Usage ({health.cpuCores} Cores)</span>
            </span>
            <span className="font-mono font-bold text-[#00FF41]">{health.cpuUsage}%</span>
          </div>

          <div
            role="progressbar"
            aria-label="CPU usage"
            aria-valuenow={health.cpuUsage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${health.cpuUsage}%`}
            className={`${BAR_BG} h-2.5`}
          >
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

          <div className="text-[11px] text-[#55555E] flex justify-between font-mono gap-2">
            <span className="whitespace-nowrap">
              Load: {health.loadAverage.one}, {health.loadAverage.five},{' '}
              {health.loadAverage.fifteen}
            </span>
            {/* Only rendered when /sys/class/thermal gave a real reading. */}
            {temp !== null && (
              <span
                className="text-[#FFBD2E] whitespace-nowrap flex items-center gap-1"
                title="CPU temperature (thermal_zone)"
              >
                <Thermometer aria-hidden="true" className="w-3 h-3" />
                {temp.toFixed(1)}°C
              </span>
            )}
            <span className="truncate max-w-[45%] text-right" title={health.cpuModel || ''}>
              {health.cpuModel
                ? health.cpuModel.replace(/\s+/g, ' ').slice(0, 22)
                : `${health.systemInfo.arch}`}
            </span>
          </div>
        </div>

        {/* Memory Consumption */}
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <Zap aria-hidden="true" className="w-4 h-4 text-[#3B82F6]" />
              <span>RAM Memory</span>
            </span>
            <span className="font-mono font-bold text-[#3B82F6]">
              {health.memoryUsage.percent}%
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="RAM usage"
            aria-valuenow={health.memoryUsage.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${health.memoryUsage.percent}%`}
            className={`${BAR_BG} h-2.5`}
          >
            <div
              className="h-full bg-[#3B82F6] transition-all duration-500 rounded"
              style={{ width: `${health.memoryUsage.percent}%` }}
            />
          </div>

          <div className="text-[11px] text-[#55555E] flex justify-between font-mono">
            <span>Used: {(health.memoryUsage.usedMb / 1024).toFixed(1)} GB</span>
            <span>Free: {(health.memoryUsage.availableMb / 1024).toFixed(1)} GB</span>
          </div>
        </div>

        {/* Disk Space Storage */}
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <HardDrive aria-hidden="true" className="w-4 h-4 text-[#BB86FC]" />
              <span>Disk usage ({health.diskUsage.path || '/'})</span>
            </span>
            <span className="font-mono font-bold text-[#BB86FC]">{health.diskUsage.percent}%</span>
          </div>

          <div
            role="progressbar"
            aria-label={`Disk usage on ${health.diskUsage.path || '/'}`}
            aria-valuenow={health.diskUsage.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${health.diskUsage.percent}%`}
            className={`${BAR_BG} h-2.5`}
          >
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
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <Network aria-hidden="true" className="w-4 h-4 text-[#FFBD2E]" />
              <span>Network Traffic</span>
            </span>
            <span className="font-mono text-[#E0E0E5] font-bold">
              {health.networkIO.interface || health.networkInterface || 'no active interface'}
            </span>
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

      {/* Memory Breakdown — stacked bar + raw /proc/meminfo values */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
          <span className="font-bold text-[#E0E0E5] text-xs flex items-center gap-2">
            <MemoryStick aria-hidden="true" className="w-4 h-4 text-[#3B82F6]" />
            <span>MEMORY BREAKDOWN (/proc/meminfo)</span>
          </span>
          <span className="text-[11px] text-[#55555E] font-mono">
            {mem ? `${mem.usedPercent}% of RAM in use (total − available)` : 'unavailable'}
          </span>
        </div>

        {!mem ? (
          <div className="text-xs text-[#88888E]">
            Memory detail is unavailable — could not read /proc/meminfo.
          </div>
        ) : (
          <>
            {/* Single stacked bar: used | cache+buffers | free-available */}
            <div
              role="img"
              aria-label={`Memory breakdown: ${fmtMb(usedSegMb)} used, ${fmtMb(cacheSegMb)} cache and buffers, ${fmtMb(freeSegMb)} free`}
              className={`${BAR_BG} h-4 flex`}
            >
              <div
                className="h-full bg-[#3B82F6]"
                style={{ width: segPct(usedSegMb) }}
                title={`Used (not reclaimable): ${fmtMb(usedSegMb)}`}
              />
              <div
                className="h-full bg-[#FFBD2E]"
                style={{ width: segPct(cacheSegMb) }}
                title={`Cache + buffers (reclaimable): ${fmtMb(cacheMb)} total, ${fmtMb(cacheSegMb)} within available`}
              />
              <div
                className="h-full bg-[#00FF41]"
                style={{ width: segPct(freeSegMb) }}
                title={`Free / available: ${fmtMb(freeSegMb)}`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-[#88888E]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#3B82F6] inline-block" />
                Used · not reclaimable <span className="text-[#E0E0E5]">{fmtMb(usedSegMb)}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[#88888E]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#FFBD2E] inline-block" />
                Cache + buffers · reclaimable{' '}
                <span className="text-[#E0E0E5]">{fmtMb(cacheSegMb)}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[#88888E]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#00FF41] inline-block" />
                Free / available <span className="text-[#E0E0E5]">{fmtMb(freeSegMb)}</span>
              </span>
            </div>

            {/* Raw numbers, unit-labelled */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 text-[11px] font-mono pt-1">
              {[
                ['Total', mem.total, '#E0E0E5'],
                ['Available', mem.available, '#00FF41'],
                ['Free (MemFree)', mem.free, '#88888E'],
                ['Buffers', mem.buffers, '#FFBD2E'],
                ['Cached', mem.cached, '#FFBD2E'],
                ['Shared (Shmem)', mem.shared, '#88888E'],
                ['Slab', mem.slab, '#88888E'],
                ['Dirty', mem.dirty, '#88888E'],
                ['Swap total', mem.swapTotal, '#3B82F6'],
                ['Swap free', mem.swapFree, '#3B82F6'],
              ].map(([label, value, color]) => (
                <div key={label as string} className="flex flex-col">
                  <span className="text-[10px] text-[#55555E] uppercase">{label as string}</span>
                  <span style={{ color: color as string }}>{fmtMb(value as number)}</span>
                </div>
              ))}
            </div>

            {/* Swap row — hidden when there is no swap at all */}
            {swap && swap.totalMb > 0 ? (
              <div className="pt-2 border-t border-[#2A2A2E] space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#88888E]">
                    Swap — {fmtMb(swap.usedMb)} used of {fmtMb(swap.totalMb)} ({fmtMb(swap.freeMb)}{' '}
                    free)
                  </span>
                  <span style={{ color: usageColor(swap.percent) }}>{swap.percent}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Swap usage"
                  aria-valuenow={swap.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={`${swap.percent}%`}
                  className={`${BAR_BG} h-2`}
                >
                  <div
                    className="h-full rounded"
                    style={{ width: `${swap.percent}%`, backgroundColor: usageColor(swap.percent) }}
                  />
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-[#2A2A2E] text-[11px] font-mono text-[#55555E]">
                {swap ? 'Swap — no swap configured on this machine (0 MB).' : 'Swap — unavailable.'}
              </div>
            )}
          </>
        )}
      </div>

      {/* What is using your RAM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Per-process table */}
        <div className={`${CARD} p-4 space-y-3 lg:col-span-2`}>
          <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
            <span className="font-bold text-[#E0E0E5] text-xs flex items-center gap-2">
              <MemoryStick aria-hidden="true" className="w-4 h-4 text-[#3B82F6]" />
              <span>WHAT IS USING YOUR RAM — TOP PROCESSES BY RSS</span>
            </span>
            <span className="text-[11px] text-[#55555E] font-mono">ps --sort=-rss</span>
          </div>

          {memProcs.length === 0 ? (
            <div className="text-xs text-[#88888E]">Process memory data is unavailable.</div>
          ) : (
            <div className="overflow-x-auto">
              <table
                aria-label="Top processes by memory (RSS)"
                className="w-full text-left font-mono text-xs text-[#E0E0E5]"
              >
                <thead>
                  <tr className="border-b border-[#2A2A2E] text-[11px] text-[#55555E] uppercase">
                    <th scope="col" className="py-2 px-2">
                      PID
                    </th>
                    <th scope="col" className="py-2 px-2">
                      Command
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      RSS MB
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      %MEM
                    </th>
                    <th scope="col" className="py-2 px-2">
                      Owner
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A2E]/60">
                  {memProcs.map((p) => (
                    <tr key={p.pid} className="hover:bg-[#202024]">
                      <td className="py-1.5 px-2 text-[#00FF41] font-bold">{p.pid}</td>
                      <td className="py-1.5 px-2 font-bold text-[#E0E0E5]">{p.name}</td>
                      <td className="py-1.5 px-2 text-right text-[#3B82F6]">{p.rssMb}</td>
                      <td className="py-1.5 px-2 text-right text-[#FFBD2E]">{p.percent}</td>
                      <td className="py-1.5 px-2 text-[#88888E]">{p.user}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* By-program rollup — the headline answer */}
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
            <span className="font-bold text-[#E0E0E5] text-xs flex items-center gap-2">
              <Database aria-hidden="true" className="w-4 h-4 text-[#BB86FC]" />
              <span>BY PROGRAM (RSS summed)</span>
            </span>
            <span className="text-[11px] text-[#55555E] font-mono">top 10</span>
          </div>

          {memGroups.length === 0 ? (
            <div className="text-xs text-[#88888E]">Grouped memory data is unavailable.</div>
          ) : (
            <div className="space-y-2">
              {memGroups.map((g) => (
                <div key={g.name} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[#E0E0E5] font-bold truncate max-w-[45%]" title={g.name}>
                      {g.name}
                    </span>
                    <span className="text-[#55555E] whitespace-nowrap">
                      {g.processes}× · <span className="text-[#3B82F6]">{fmtMb(g.rssMb)}</span> ·{' '}
                      <span className="text-[#FFBD2E]">{g.percentOfRam}%</span>
                    </span>
                  </div>
                  <div className={`${BAR_BG} h-1.5`}>
                    <div
                      className="h-full rounded bg-[#BB86FC]"
                      style={{ width: `${Math.min(100, g.percentOfRam)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mounts table */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
          <span className="font-bold text-[#E0E0E5] text-xs flex items-center gap-2">
            <HardDrive aria-hidden="true" className="w-4 h-4 text-[#BB86FC]" />
            <span>MOUNTED FILESYSTEMS (statfs on /proc/mounts)</span>
          </span>
          <span className="text-[11px] text-[#55555E] font-mono">device-backed only</span>
        </div>

        {mounts.length === 0 ? (
          <div className="text-xs text-[#88888E]">No device-backed filesystems detected.</div>
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label="Mounted filesystems"
              className="w-full text-left font-mono text-xs text-[#E0E0E5]"
            >
              <thead>
                <tr className="border-b border-[#2A2A2E] text-[11px] text-[#55555E] uppercase">
                  <th scope="col" className="py-2 px-2">
                    Mount
                  </th>
                  <th scope="col" className="py-2 px-2">
                    Device
                  </th>
                  <th scope="col" className="py-2 px-2">
                    FS
                  </th>
                  <th scope="col" className="py-2 px-2 text-right">
                    Used / Total
                  </th>
                  <th scope="col" className="py-2 px-2 w-[26%]">
                    Usage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2E]/60">
                {mounts.map((m) => (
                  <tr key={m.device} className="hover:bg-[#202024]">
                    <td className="py-2 px-2 font-bold text-[#E0E0E5]">{m.path}</td>
                    <td className="py-2 px-2 text-[#88888E]">{m.device}</td>
                    <td className="py-2 px-2 text-[#55555E]">{m.fs}</td>
                    <td className="py-2 px-2 text-right text-[#E0E0E5] whitespace-nowrap">
                      {m.usedGb} / {m.totalGb} GB
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <div className={`${BAR_BG} h-1.5 flex-1`}>
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${Math.min(100, m.percent)}%`,
                              backgroundColor: usageColor(m.percent),
                            }}
                          />
                        </div>
                        <span
                          className="text-[11px] w-10 text-right"
                          style={{ color: usageColor(m.percent) }}
                        >
                          {m.percent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disk I/O + Per-core CPU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Disk I/O */}
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center justify-between text-xs text-[#88888E]">
            <span className="font-bold flex items-center gap-1.5">
              <HardDriveDownload aria-hidden="true" className="w-4 h-4 text-[#BB86FC]" />
              <span>Disk I/O (live)</span>
            </span>
            <span className="font-mono text-[#E0E0E5] font-bold">
              {diskIO ? diskIO.device || 'no device' : 'unavailable'}
            </span>
          </div>

          {!diskIO ? (
            <div className="text-xs text-[#88888E]">Disk I/O counters are unavailable.</div>
          ) : (
            <div className="flex items-center justify-around text-xs font-mono pt-1">
              <div className="text-[#00FF41] text-center">
                <span className="text-[10px] text-[#55555E] block">READ</span>
                <span>{diskIO.readKbps} KB/s</span>
              </div>
              <div className="text-[#3B82F6] text-center">
                <span className="text-[10px] text-[#55555E] block">WRITE</span>
                <span>{diskIO.writeKbps} KB/s</span>
              </div>
            </div>
          )}
        </div>

        {/* Per-core CPU */}
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
            <span className="font-bold text-[#E0E0E5] text-xs flex items-center gap-2">
              <Cpu aria-hidden="true" className="w-4 h-4 text-[#00FF41]" />
              <span>PER-CORE CPU ({health.cpuCores} cores)</span>
            </span>
            <span className="text-[11px] text-[#55555E] font-mono">/proc/stat · 150ms</span>
          </div>

          {perCore.length === 0 ? (
            <div className="text-xs text-[#88888E]">Per-core CPU data is unavailable.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {perCore.map((c) => (
                <div key={c.core} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="w-10 text-[#55555E]">cpu{c.core}</span>
                  <div className={`${BAR_BG} h-1.5 flex-1`}>
                    <div
                      className="h-full rounded"
                      style={{ width: `${c.usage}%`, backgroundColor: usageColor(c.usage) }}
                    />
                  </div>
                  <span className="w-9 text-right" style={{ color: usageColor(c.usage) }}>
                    {c.usage}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System Info Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${CARD} p-4 flex items-center gap-3`}>
          <div className="p-2.5 bg-[#202024] rounded text-[#00FF41] border border-[#2A2A2E]">
            <Server aria-hidden="true" className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-[#88888E] font-bold">OPERATING SYSTEM</div>
            <div className="font-mono text-xs font-bold text-[#E0E0E5]">{health.systemInfo.os}</div>
          </div>
        </div>

        <div className={`${CARD} p-4 flex items-center gap-3`}>
          <div className="p-2.5 bg-[#202024] rounded text-[#3B82F6] border border-[#2A2A2E]">
            <Clock aria-hidden="true" className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-[#88888E] font-bold">MACHINE UPTIME</div>
            <div className="font-mono text-xs font-bold text-[#E0E0E5]">
              {formatUptime(health.uptimeSeconds)}
            </div>
          </div>
        </div>

        <div className={`${CARD} p-4 flex items-center gap-3`}>
          <div className="p-2.5 bg-[#202024] rounded text-[#BB86FC] border border-[#2A2A2E]">
            <Layers aria-hidden="true" className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-[#88888E] font-bold">ACTIVE PROCESSES</div>
            <div className="font-mono text-xs font-bold text-[#E0E0E5]">
              {health.processCount} processes | {health.activeConnections} established TCP
              connections
            </div>
          </div>
        </div>
      </div>

      {/* Process Monitor Table */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
          <span className="font-bold text-[#E0E0E5] text-xs flex items-center gap-2">
            <Cpu aria-hidden="true" className="w-4 h-4 text-[#00FF41]" />
            <span>TOP PROCESSES ON THIS MACHINE (ps)</span>
          </span>
          <span className="text-[11px] text-[#55555E] font-mono">Sorted by CPU %</span>
        </div>

        <div className="overflow-x-auto">
          <table
            aria-label="Top processes by CPU usage"
            className="w-full text-left font-mono text-xs text-[#E0E0E5]"
          >
            <thead>
              <tr className="border-b border-[#2A2A2E] text-[11px] text-[#55555E] uppercase">
                <th scope="col" className="py-2 px-3">
                  PID
                </th>
                <th scope="col" className="py-2 px-3">
                  Process Command
                </th>
                <th scope="col" className="py-2 px-3">
                  CPU %
                </th>
                <th scope="col" className="py-2 px-3">
                  Memory (MB)
                </th>
                <th scope="col" className="py-2 px-3">
                  Owner
                </th>
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
