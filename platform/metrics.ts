import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';

const PROBE_TIMEOUT_MS = 4000;

export interface HealthCapabilities {
  memoryBreakdown: boolean;
  processDetails: boolean;
  mounts: boolean;
  diskIO: boolean;
  perCoreCpu: boolean;
  cpuTemperature: boolean;
  networkRates: boolean;
}

export interface MetricsDeps {
  platform: NodeJS.Platform;
  cpus: typeof os.cpus;
  totalmem: typeof os.totalmem;
  freemem: typeof os.freemem;
  uptime: typeof os.uptime;
  loadavg: typeof os.loadavg;
  homedir: typeof os.homedir;
  hostname: typeof os.hostname;
  type: typeof os.type;
  release: typeof os.release;
  arch: typeof os.arch;
  version: typeof os.version;
  readFile(path: string): string;
  readDir(path: string): string[];
  statfs(path: string): { blocks: number; bavail: number; bsize: number };
  run(command: string, args: string[], timeoutMs: number): Promise<string>;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface HealthSnapshot {
  status: 'healthy' | 'degraded';
  cpuUsage: number;
  cpuCores: number;
  loadAverage: { one: number; five: number; fifteen: number };
  cpuModel: string;
  memoryUsage: {
    usedMb: number;
    totalMb: number;
    freeMb: number;
    availableMb: number;
    percent: number;
  };
  diskUsage: { usedGb: number; totalGb: number; percent: number; path: string };
  networkIO: { rxKbps: number; txKbps: number; interface?: string };
  uptimeSeconds: number;
  processCount: number;
  activeConnections: number;
  topProcesses: Array<{ pid: number; name: string; cpu: number; memory: number; user: string }>;
  memoryBreakdown: null | Record<string, number>;
  topMemoryProcesses: Array<Record<string, string | number>>;
  memoryByGroup: Array<Record<string, string | number>>;
  swapUsage: null | { totalMb: number; freeMb: number; usedMb: number; percent: number };
  mounts: Array<{
    path: string;
    device: string;
    fs: string;
    usedGb: number;
    totalGb: number;
    percent: number;
  }>;
  diskIO: null | { readKbps: number; writeKbps: number; device: string };
  perCoreCpu: Array<{ core: number; usage: number }>;
  cpuTemperature: number | null;
  capabilities: HealthCapabilities;
  systemInfo: {
    os: string;
    arch: string;
    hostname: string;
    kernel: string;
    nodeVersion: string;
    distro: string;
  };
}

const runtimeDeps: MetricsDeps = {
  platform: process.platform,
  cpus: os.cpus,
  totalmem: os.totalmem,
  freemem: os.freemem,
  uptime: os.uptime,
  loadavg: os.loadavg,
  homedir: os.homedir,
  hostname: os.hostname,
  type: os.type,
  release: os.release,
  arch: os.arch,
  version: os.version,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  readDir: (dir) => fs.readdirSync(dir),
  statfs: (target) => fs.statfsSync(target),
  run: (command, args, timeoutMs) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`${command} timed out`));
      }, timeoutMs);
      child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `${command} exited ${code}`));
      });
    }),
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type CpuSample = { idle: number; total: number; cores: Array<{ idle: number; total: number }> };
function cpuSample(cpus: ReturnType<typeof os.cpus>): CpuSample {
  const cores = cpus.map(({ times }) => ({
    idle: times.idle,
    total: times.idle + times.user + times.nice + times.sys + times.irq,
  }));
  return {
    idle: cores.reduce((sum, core) => sum + core.idle, 0),
    total: cores.reduce((sum, core) => sum + core.total, 0),
    cores,
  };
}

function percent(before: { idle: number; total: number }, after: { idle: number; total: number }) {
  const total = after.total - before.total;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - (after.idle - before.idle) / total) * 100)));
}

function parseMeminfo(raw: string) {
  const values: Record<string, number> = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z()_]+):\s+(\d+)\s*kB/);
    if (match) values[match[1]] = Number(match[2]);
  }
  if (!values.MemTotal) throw new Error('MemTotal missing');
  const mb = (key: string) => Number(((values[key] ?? 0) / 1024).toFixed(1));
  const total = mb('MemTotal');
  const available = values.MemAvailable === undefined ? mb('MemFree') : mb('MemAvailable');
  const swapTotal = mb('SwapTotal');
  const swapFree = mb('SwapFree');
  return {
    breakdown: {
      total,
      free: mb('MemFree'),
      available,
      buffers: mb('Buffers'),
      cached: mb('Cached'),
      shared: mb('Shmem'),
      slab: mb('Slab'),
      dirty: mb('Dirty'),
      swapTotal,
      swapFree,
      usedPercent: Number((((total - available) / total) * 100).toFixed(1)),
      swapPercent: swapTotal ? Number((((swapTotal - swapFree) / swapTotal) * 100).toFixed(1)) : 0,
    },
    swap: {
      totalMb: swapTotal,
      freeMb: swapFree,
      usedMb: Number((swapTotal - swapFree).toFixed(1)),
      percent: swapTotal ? Number((((swapTotal - swapFree) / swapTotal) * 100).toFixed(1)) : 0,
    },
  };
}

function parsePs(raw: string, totalMb: number) {
  const rows = raw
    .trim()
    .split('\n')
    .slice(1)
    .map((row) => row.trim().split(/\s+/));
  const processes = rows.flatMap((cols) => {
    if (cols.length < 5) return [];
    const pid = Number(cols[0]);
    const user = cols.at(-1) || 'unknown';
    const memoryPercent = Number(cols.at(-2)) || 0;
    const cpu = Number(cols.at(-3)) || 0;
    const name = cols.slice(1, -3).join(' ') || 'unknown';
    if (!pid || /^(ps|awk|sort|head|cut|tr|sed)$/.test(name)) return [];
    const memory = Number(((memoryPercent / 100) * totalMb).toFixed(1));
    return [{ pid, name, cpu, memory, user, rssMb: memory, percent: memoryPercent }];
  });
  const groups = new Map<string, { processes: number; rssMb: number }>();
  for (const item of processes) {
    const group = groups.get(item.name) ?? { processes: 0, rssMb: 0 };
    group.processes += 1;
    group.rssMb += item.memory;
    groups.set(item.name, group);
  }
  return {
    top: processes.slice(0, 5),
    memory: processes
      .slice()
      .sort((a, b) => b.memory - a.memory)
      .slice(0, 8),
    groups: [...groups]
      .map(([name, group]) => ({
        name,
        ...group,
        percentOfRam: totalMb ? Number(((group.rssMb / totalMb) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.rssMb - a.rssMb)
      .slice(0, 10),
  };
}

function diskSpace(deps: MetricsDeps) {
  try {
    const stat = deps.statfs(deps.homedir());
    const totalGb = (stat.blocks * stat.bsize) / 1073741824;
    const usedGb = totalGb - (stat.bavail * stat.bsize) / 1073741824;
    return {
      usedGb: Number(usedGb.toFixed(1)),
      totalGb: Number(totalGb.toFixed(1)),
      percent: totalGb ? Number(((usedGb / totalGb) * 100).toFixed(1)) : 0,
      path: deps.homedir(),
    };
  } catch {
    return { usedGb: 0, totalGb: 0, percent: 0, path: deps.homedir() };
  }
}

async function runPowerShell(deps: MetricsDeps, script: string) {
  const args = ['-NoProfile', '-NonInteractive', '-Command', script];
  try {
    return await deps.run('pwsh.exe', args, PROBE_TIMEOUT_MS);
  } catch {
    return deps.run('powershell.exe', args, PROBE_TIMEOUT_MS);
  }
}

export async function collectHealthSnapshot(
  deps: MetricsDeps = runtimeDeps,
): Promise<HealthSnapshot> {
  const before = cpuSample(deps.cpus());
  await deps.sleep(150);
  const afterCpus = deps.cpus();
  const after = cpuSample(afterCpus);
  const cpuUsage = percent(before, after);
  const totalMb = Math.round(deps.totalmem() / 1048576);
  const freeMb = Math.round(deps.freemem() / 1048576);
  let availableMb = freeMb;
  let memoryBreakdown: HealthSnapshot['memoryBreakdown'] = null;
  let swapUsage: HealthSnapshot['swapUsage'] = null;
  let topProcesses: HealthSnapshot['topProcesses'] = [];
  let topMemoryProcesses: HealthSnapshot['topMemoryProcesses'] = [];
  let memoryByGroup: HealthSnapshot['memoryByGroup'] = [];
  let mounts: HealthSnapshot['mounts'] = [];
  let diskIO: HealthSnapshot['diskIO'] = null;
  let cpuTemperature: number | null = null;
  let networkIO: HealthSnapshot['networkIO'] = { rxKbps: 0, txKbps: 0 };
  let processCount = 0;
  let activeConnections = 0;
  const capabilities: HealthCapabilities = {
    memoryBreakdown: false,
    processDetails: false,
    mounts: false,
    diskIO: false,
    perCoreCpu: false,
    cpuTemperature: false,
    networkRates: false,
  };

  if (deps.platform === 'linux') {
    try {
      const memory = parseMeminfo(deps.readFile('/proc/meminfo'));
      memoryBreakdown = memory.breakdown;
      swapUsage = memory.swap;
      availableMb = memory.breakdown.available;
      capabilities.memoryBreakdown = true;
    } catch {
      /* unavailable */
    }
    try {
      const ps = parsePs(
        await deps.run('ps', ['-eo', 'pid,comm,%cpu,%mem,user', '--sort=-%cpu'], PROBE_TIMEOUT_MS),
        totalMb,
      );
      topProcesses = ps.top;
      topMemoryProcesses = ps.memory;
      memoryByGroup = ps.groups;
      capabilities.processDetails = true;
    } catch {
      /* unavailable */
    }
    try {
      processCount = deps.readDir('/proc').filter((name) => /^\d+$/.test(name)).length;
    } catch {
      /* unavailable */
    }
    try {
      const rows = deps.readFile('/proc/mounts').split('\n').filter(Boolean);
      const allow = /^(ext[234]|xfs|btrfs|zfs|vfat|exfat|f2fs|nfs\d?|nfs4)$/;
      mounts = rows.flatMap((row) => {
        const [device, encodedPath, fsType] = row.split(' ');
        if (!device || !encodedPath || !allow.test(fsType)) return [];
        try {
          const target = encodedPath.replace(/\\040/g, ' ');
          const stat = deps.statfs(target);
          const totalGb = (stat.blocks * stat.bsize) / 1073741824;
          const usedGb = totalGb - (stat.bavail * stat.bsize) / 1073741824;
          return [
            {
              path: target,
              device,
              fs: fsType,
              usedGb: Number(usedGb.toFixed(2)),
              totalGb: Number(totalGb.toFixed(2)),
              percent: totalGb ? Number(((usedGb / totalGb) * 100).toFixed(1)) : 0,
            },
          ];
        } catch {
          return [];
        }
      });
      capabilities.mounts = true;
    } catch {
      /* unavailable */
    }
    try {
      const disks = deps
        .readFile('/proc/diskstats')
        .split('\n')
        .filter(Boolean)
        .map((row) => row.trim().split(/\s+/))
        .filter((cols) =>
          /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(cols[2] || ''),
        );
      if (!disks.length) throw new Error('no whole disks');
      const device = disks.sort(
        (a, b) =>
          (Number(b[5]) || 0) + (Number(b[9]) || 0) - ((Number(a[5]) || 0) + (Number(a[9]) || 0)),
      )[0][2];
      diskIO = { readKbps: 0, writeKbps: 0, device };
      capabilities.diskIO = true;
    } catch {
      /* unavailable */
    }
    try {
      const lines = deps.readFile('/proc/net/dev').split('\n').slice(2);
      const interfaces = lines.flatMap((line) => {
        const [name, values] = line.split(':');
        if (!values || name.trim() === 'lo') return [];
        const cols = values.trim().split(/\s+/).map(Number);
        return [{ name: name.trim(), rx: cols[0] || 0, tx: cols[8] || 0 }];
      });
      if (!interfaces.length) throw new Error('no network interfaces');
      const busiest = interfaces.sort((a, b) => b.rx + b.tx - a.rx - a.tx)[0];
      networkIO = { rxKbps: 0, txKbps: 0, interface: busiest.name };
      capabilities.networkRates = true;
    } catch {
      /* unavailable */
    }
    try {
      for (const zone of deps
        .readDir('/sys/class/thermal')
        .filter((name) => name.startsWith('thermal_zone'))) {
        const value = Number(deps.readFile(`/sys/class/thermal/${zone}/temp`).trim()) / 1000;
        if (value > 0 && value < 150) {
          cpuTemperature = Number(value.toFixed(1));
          capabilities.cpuTemperature = true;
          break;
        }
      }
    } catch {
      /* unavailable */
    }
    try {
      for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
        activeConnections += deps
          .readFile(file)
          .trim()
          .split('\n')
          .slice(1)
          .filter((line) => line.trim().split(/\s+/)[3] === '01').length;
      }
    } catch {
      /* unavailable */
    }
  } else if (deps.platform === 'darwin') {
    try {
      const ps = parsePs(
        await deps.run('ps', ['-axo', 'pid,comm,%cpu,%mem,user'], PROBE_TIMEOUT_MS),
        totalMb,
      );
      topProcesses = ps.top;
      topMemoryProcesses = ps.memory;
      memoryByGroup = ps.groups;
      processCount = ps.memory.length;
      capabilities.processDetails = true;
    } catch {
      /* unavailable */
    }
    try {
      const raw = await deps.run('df', ['-kP'], PROBE_TIMEOUT_MS);
      mounts = raw
        .trim()
        .split('\n')
        .slice(1)
        .flatMap((line) => {
          const cols = line.trim().split(/\s+/);
          if (cols.length < 6) return [];
          const totalGb = Number(cols[1]) / 1048576;
          const usedGb = Number(cols[2]) / 1048576;
          return [
            {
              device: cols[0],
              fs: '',
              path: cols.slice(5).join(' '),
              totalGb: Number(totalGb.toFixed(2)),
              usedGb: Number(usedGb.toFixed(2)),
              percent: Number(cols[4].replace('%', '')) || 0,
            },
          ];
        });
      capabilities.mounts = true;
    } catch {
      /* unavailable */
    }
    try {
      await deps.run('sysctl', ['-n', 'vm.swapusage'], PROBE_TIMEOUT_MS);
    } catch {
      /* bounded capability probe */
    }
  } else if (deps.platform === 'win32') {
    const [processProbe, mountProbe, diskProbe] = await Promise.allSettled([
      runPowerShell(
        deps,
        'Get-CimInstance Win32_Process | Select-Object -First 10 ProcessId,Name,WorkingSetSize | ConvertTo-Json -Compress',
      ),
      runPowerShell(
        deps,
        'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,FileSystem,Size,FreeSpace | ConvertTo-Json -Compress',
      ),
      runPowerShell(
        deps,
        'Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object Name -ne "_Total" | Select-Object -First 1 Name,DiskReadBytesPersec,DiskWriteBytesPersec | ConvertTo-Json -Compress',
      ),
    ]);
    if (processProbe.status === 'fulfilled') {
      try {
        const items = ([] as any[]).concat(JSON.parse(processProbe.value));
        topProcesses = items.map((item) => ({
          pid: Number(item.ProcessId),
          name: String(item.Name || 'unknown'),
          cpu: 0,
          memory: Number((Number(item.WorkingSetSize || 0) / 1048576).toFixed(1)),
          user: '',
        }));
        topMemoryProcesses = topProcesses.map((item) => ({
          ...item,
          rssMb: item.memory,
          percent: totalMb ? Number(((item.memory / totalMb) * 100).toFixed(1)) : 0,
        }));
        processCount = items.length;
        capabilities.processDetails = true;
      } catch {
        /* malformed probe output */
      }
    }
    if (mountProbe.status === 'fulfilled') {
      try {
        mounts = ([] as any[]).concat(JSON.parse(mountProbe.value)).map((item) => {
          const totalGb = Number(item.Size || 0) / 1073741824;
          const usedGb = totalGb - Number(item.FreeSpace || 0) / 1073741824;
          return {
            path: String(item.DeviceID),
            device: String(item.DeviceID),
            fs: String(item.FileSystem || ''),
            totalGb: Number(totalGb.toFixed(2)),
            usedGb: Number(usedGb.toFixed(2)),
            percent: totalGb ? Number(((usedGb / totalGb) * 100).toFixed(1)) : 0,
          };
        });
        capabilities.mounts = true;
      } catch {
        /* malformed probe output */
      }
    }
    if (diskProbe.status === 'fulfilled') {
      try {
        const item = JSON.parse(diskProbe.value);
        diskIO = {
          device: String(item.Name || ''),
          readKbps: Number((Number(item.DiskReadBytesPersec || 0) / 1024).toFixed(1)),
          writeKbps: Number((Number(item.DiskWriteBytesPersec || 0) / 1024).toFixed(1)),
        };
        capabilities.diskIO = true;
      } catch {
        /* malformed probe output */
      }
    }
  }

  const perCoreCpu = after.cores.map((core, index) => ({
    core: index,
    usage: percent(before.cores[index] ?? core, core),
  }));
  capabilities.perCoreCpu = perCoreCpu.length > 0;
  const usedMb = Math.max(0, totalMb - availableMb);
  const load = deps.loadavg();
  return {
    status: cpuUsage > 92 ? 'degraded' : 'healthy',
    cpuUsage,
    cpuCores: afterCpus.length,
    loadAverage: {
      one: Number(load[0].toFixed(2)),
      five: Number(load[1].toFixed(2)),
      fifteen: Number(load[2].toFixed(2)),
    },
    cpuModel: (afterCpus[0]?.model || '').trim(),
    memoryUsage: {
      usedMb,
      totalMb,
      freeMb,
      availableMb,
      percent: totalMb ? Math.round((usedMb / totalMb) * 100) : 0,
    },
    diskUsage: diskSpace(deps),
    networkIO,
    uptimeSeconds: Math.floor(deps.uptime()),
    processCount,
    activeConnections,
    topProcesses,
    memoryBreakdown,
    topMemoryProcesses,
    memoryByGroup,
    swapUsage,
    mounts,
    diskIO,
    perCoreCpu,
    cpuTemperature,
    capabilities,
    systemInfo: {
      os: `${deps.type()} ${deps.release()}`,
      arch: deps.arch(),
      hostname: deps.hostname(),
      kernel: deps.release(),
      nodeVersion: process.version,
      distro: process.env.OMNITERM_DISTRO || '',
    },
  };
}
