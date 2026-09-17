import { describe, expect, it } from 'vitest';
import { collectHealthSnapshot, type MetricsDeps } from '../platform/metrics';

const cpu = (idle: number, user: number) => ({
  model: 'Fixture CPU',
  speed: 3000,
  times: { idle, user, nice: 0, sys: 0, irq: 0 },
});

function fixture(platform: NodeJS.Platform): MetricsDeps {
  const files: Record<string, string> = {
    '/proc/meminfo': [
      'MemTotal:       8388608 kB',
      'MemFree:        1048576 kB',
      'MemAvailable:   3145728 kB',
      'Buffers:         262144 kB',
      'Cached:         1048576 kB',
      'Shmem:           131072 kB',
      'Slab:            262144 kB',
      'Dirty:             1024 kB',
      'SwapTotal:      2097152 kB',
      'SwapFree:       1048576 kB',
    ].join('\n'),
    '/proc/net/dev':
      'Inter-| Receive | Transmit\n face |bytes |bytes\neth0: 1000 0 0 0 0 0 0 0 2000',
    '/proc/net/tcp': 'header\n0: a b 01',
    '/proc/net/tcp6': 'header',
    '/proc/mounts': '/dev/sda1 / ext4 rw 0 0',
    '/proc/diskstats': '8 0 sda 0 0 10 0 0 0 20 0',
    '/proc/stat': 'cpu  10 0 5 85 0 0 0 0\ncpu0 10 0 5 85 0 0 0 0',
    '/sys/class/thermal/thermal_zone0/temp': '51000',
  };
  let sample = 0;
  return {
    platform,
    cpus: () => [cpu(sample++ ? 90 : 85, sample ? 20 : 15)],
    totalmem: () => 8 * 1024 ** 3,
    freemem: () => 1024 ** 3,
    uptime: () => 3600,
    loadavg: () => [0.5, 0.4, 0.3],
    homedir: () => '/home/test',
    hostname: () => 'fixture',
    type: () => (platform === 'win32' ? 'Windows_NT' : 'Linux'),
    release: () => '1.0',
    arch: () => 'x64',
    version: () => 'fixture-version',
    readFile: (file) => {
      if (!(file in files)) throw new Error(`missing ${file}`);
      return files[file];
    },
    readDir: (dir) => {
      if (dir === '/proc') return ['1', '2', 'self'];
      if (dir === '/sys/class/thermal') return ['thermal_zone0'];
      throw new Error(`missing ${dir}`);
    },
    statfs: () => ({ blocks: 1000, bavail: 400, bsize: 1024 ** 2 }),
    run: async (command) => {
      if (command === 'ps') {
        return 'PID COMMAND %CPU %MEM USER\n42 node 12 10 tester';
      }
      throw new Error(`unexpected ${command}`);
    },
    now: (() => {
      let now = 1000;
      return () => (now += 1000);
    })(),
    sleep: async () => {},
  };
}

describe('collectHealthSnapshot', () => {
  it('preserves the complete Linux capability set and normalized values', async () => {
    const health = await collectHealthSnapshot(fixture('linux'));

    expect(health.capabilities).toEqual({
      memoryBreakdown: true,
      processDetails: true,
      mounts: true,
      diskIO: true,
      perCoreCpu: true,
      cpuTemperature: true,
      networkRates: true,
    });
    expect(health.memoryUsage).toMatchObject({ totalMb: 8192, availableMb: 3072 });
    expect(health.memoryBreakdown?.cached).toBe(1024);
    expect(health.mounts).toHaveLength(1);
    expect(health.topProcesses[0]).toMatchObject({ pid: 42, name: 'node' });
  });

  it('reports failed Windows probes as unavailable without losing common metrics', async () => {
    const deps = fixture('win32');
    deps.run = async () => {
      throw new Error('PowerShell unavailable');
    };
    deps.readFile = () => {
      throw new Error('no procfs');
    };
    deps.readDir = () => {
      throw new Error('no procfs');
    };

    const health = await collectHealthSnapshot(deps);

    expect(health.cpuCores).toBe(1);
    expect(health.memoryUsage.totalMb).toBe(8192);
    expect(health.diskIO).toBeNull();
    expect(health.topProcesses).toEqual([]);
    expect(health.capabilities).toEqual({
      memoryBreakdown: false,
      processDetails: false,
      mounts: false,
      diskIO: false,
      perCoreCpu: true,
      cpuTemperature: false,
      networkRates: false,
    });
  });

  it('bounds every external probe to four seconds', async () => {
    const deps = fixture('darwin');
    const calls: Array<{ command: string; timeoutMs: number }> = [];
    deps.run = async (command, _args, timeoutMs) => {
      calls.push({ command, timeoutMs });
      throw new Error('not installed');
    };

    await collectHealthSnapshot(deps);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(({ timeoutMs }) => timeoutMs === 4000)).toBe(true);
  });

  it('isolates malformed output to the capability that produced it', async () => {
    const deps = fixture('win32');
    deps.run = async (_command, args) => {
      const script = args.at(-1) || '';
      if (script.includes('Win32_Process')) return 'not-json';
      if (script.includes('Win32_LogicalDisk')) return '[]';
      return '{"Name":"0 C:","DiskReadBytesPersec":1024,"DiskWriteBytesPersec":2048}';
    };

    const health = await collectHealthSnapshot(deps);

    expect(health.capabilities.processDetails).toBe(false);
    expect(health.capabilities.mounts).toBe(true);
    expect(health.capabilities.diskIO).toBe(true);
  });
});
