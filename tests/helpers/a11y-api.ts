/**
 * Network stub for the accessibility suite.
 *
 * Every rendered component talks to the local Express API over `fetch('/api/…')`.
 * This module installs a `globalThis.fetch` that answers those routes with the
 * exact JSON shapes the components read (taken from server.ts,
 * not invented), so each component renders its real populated state instead of
 * an empty shell — an empty shell would make the axe run meaningless.
 *
 * Any request that falls through the router is recorded in `unmatched` and the
 * suite asserts that list is empty, so a component that starts calling a new
 * endpoint fails the guard loudly instead of quietly rendering an error state.
 */

/** Same host the components assume (they use relative /api/... URLs). */
export const TEST_HOME = '/home/tester';

const NOW = '2026-09-11 00:04';

/* -------------------------------------------------------------- /api/health */

const HEALTH = {
  status: 'healthy',
  cpuUsage: 37,
  cpuCores: 8,
  loadAverage: { one: 0.62, five: 0.51, fifteen: 0.44 },
  cpuModel: 'AMD Ryzen 7 5800X 8-Core Processor',
  cpuTemperature: 51.5,
  memoryUsage: { usedMb: 9266, totalMb: 15996, freeMb: 5210, availableMb: 6730, percent: 58 },
  diskUsage: { usedGb: 214.4, totalGb: 468.0, percent: 46, path: '/' },
  networkIO: { rxKbps: 812.4, txKbps: 143.9, interface: 'wlp5s0' },
  uptimeSeconds: 351_420,
  processCount: 412,
  activeConnections: 37,
  topProcesses: [
    { pid: 1337, name: 'node', cpu: 21.4, memory: 612, user: 'tester' },
    { pid: 42, name: 'Xorg', cpu: 6.1, memory: 288, user: 'root' },
    { pid: 902, name: 'firefox', cpu: 3.3, memory: 1024, user: 'tester' },
  ],
  memoryBreakdown: {
    total: 15996,
    free: 5210,
    available: 6730,
    buffers: 412,
    cached: 4890,
    shared: 733,
    slab: 618,
    dirty: 12,
    swapTotal: 4096,
    swapFree: 3580,
    usedPercent: 58,
    swapPercent: 13,
  },
  topMemoryProcesses: [
    {
      pid: 902,
      name: 'firefox',
      rssMb: 1024,
      percent: 6.4,
      cpu: 3.3,
      memory: 1024,
      user: 'tester',
    },
    { pid: 1337, name: 'node', rssMb: 612, percent: 3.8, cpu: 21.4, memory: 612, user: 'tester' },
    {
      pid: 1188,
      name: 'node-pty',
      rssMb: 388,
      percent: 2.4,
      cpu: 0.4,
      memory: 388,
      user: 'tester',
    },
  ],
  memoryByGroup: [
    { name: 'node', processes: 4, rssMb: 1210, percentOfRam: 7.6 },
    { name: 'firefox', processes: 6, rssMb: 1024, percentOfRam: 6.4 },
    { name: 'Xorg', processes: 1, rssMb: 288, percentOfRam: 1.8 },
  ],
  swapUsage: { totalMb: 4096, freeMb: 3580, usedMb: 516, percent: 13 },
  mounts: [
    { path: '/', device: '/dev/nvme0n1p2', fs: 'ext4', usedGb: 214.4, totalGb: 468, percent: 46 },
    { path: '/boot', device: '/dev/nvme0n1p1', fs: 'vfat', usedGb: 0.3, totalGb: 0.5, percent: 62 },
  ],
  diskIO: { readKbps: 1024.5, writeKbps: 256.25, device: 'nvme0n1' },
  perCoreCpu: [
    { core: 0, usage: 41 },
    { core: 1, usage: 12 },
    { core: 2, usage: 8 },
    { core: 3, usage: 63 },
  ],
  systemInfo: {
    os: 'Linux 7.0.0-15-generic',
    arch: 'x64',
    hostname: 'omniterm-dev',
    kernel: '7.0.0-15-generic',
    nodeVersion: 'v24.15.0',
  },
};

/* --------------------------------------------------------------- /api/files */

const FILE_ENTRIES = [
  {
    id: `${TEST_HOME}/projects/src`,
    path: `${TEST_HOME}/projects/src`,
    name: 'src',
    type: 'directory',
    size: 4096,
    modified: NOW,
    owner: '1000',
    permissions: 'drwxr-xr-x',
    language: 'folder',
    isLink: false,
    target: null,
  },
  {
    id: `${TEST_HOME}/projects/server.ts`,
    path: `${TEST_HOME}/projects/server.ts`,
    name: 'server.ts',
    type: 'file',
    size: 62966,
    modified: NOW,
    owner: '1000',
    permissions: '-rw-r--r--',
    language: 'typescript',
    isLink: false,
    target: null,
  },
  {
    id: `${TEST_HOME}/projects/notes.md`,
    path: `${TEST_HOME}/projects/notes.md`,
    name: 'notes.md',
    type: 'file',
    size: 2048,
    modified: NOW,
    owner: '1000',
    permissions: '-rw-r--r--',
    language: 'markdown',
    isLink: false,
    target: null,
  },
  {
    id: `${TEST_HOME}/projects/deploy.sh`,
    path: `${TEST_HOME}/projects/deploy.sh`,
    name: 'deploy.sh',
    type: 'file',
    size: 733,
    modified: NOW,
    owner: '1000',
    permissions: '-rwxr-xr-x',
    language: 'shell',
    isLink: false,
    target: null,
  },
  {
    id: `${TEST_HOME}/projects/diagram.png`,
    path: `${TEST_HOME}/projects/diagram.png`,
    name: 'diagram.png',
    type: 'file',
    size: 184_320,
    modified: NOW,
    owner: '1000',
    permissions: '-rw-r--r--',
    language: 'image',
    isLink: false,
    target: null,
  },
  {
    id: `${TEST_HOME}/projects/release.tar.gz`,
    path: `${TEST_HOME}/projects/release.tar.gz`,
    name: 'release.tar.gz',
    type: 'file',
    size: 8_388_608,
    modified: NOW,
    owner: '1000',
    permissions: '-rw-r--r--',
    language: 'archive',
    isLink: false,
    target: null,
  },
  {
    id: `${TEST_HOME}/projects/.env`,
    path: `${TEST_HOME}/projects/.env`,
    name: '.env',
    type: 'file',
    size: 128,
    modified: NOW,
    owner: '1000',
    permissions: '-rw-------',
    language: 'env',
    isLink: false,
    target: null,
  },
  {
    id: `${TEST_HOME}/projects/latest.conf`,
    path: `${TEST_HOME}/projects/latest.conf`,
    name: 'latest.conf',
    type: 'file',
    size: 256,
    modified: NOW,
    owner: '1000',
    permissions: 'lrwxrwxrwx',
    language: 'text',
    isLink: true,
    target: '/etc/omniterm/omniterm.conf',
  },
];

const FILE_CONTENT = [
  '# Accessibility regression guard',
  'export const toHaveNoViolations = true',
  'export function describe(label: string) {',
  '  return `omniterm: ${label}`',
  '}',
].join('\n');

/* ------------------------------------------------------------------- router */

export interface StubCall {
  url: string;
  method: string;
}

export interface ApiStub {
  /** Every request the components made, in order. */
  calls: StubCall[];
  /** Requests no route answered — the suite asserts this stays empty. */
  unmatched: string[];
  /** Requested pathnames, e.g. ['/api/health']. */
  paths(): string[];
  reset(): void;
  restore(): void;
}

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  } as unknown as Response;
}

interface Route {
  method?: string;
  path: string | RegExp;
  body: (url: URL) => unknown;
}

const ROUTES: Route[] = [
  { path: '/api/health', body: () => HEALTH },
  {
    path: '/api/files',
    body: (url) => {
      const requested = url.searchParams.get('path') || TEST_HOME;
      const home = requested === '~' || requested === TEST_HOME;
      return {
        path: home ? TEST_HOME : requested,
        parent: home ? null : TEST_HOME,
        entries: FILE_ENTRIES,
      };
    },
  },
  {
    path: '/api/files/read',
    body: (url) => {
      const target = url.searchParams.get('path') || `${TEST_HOME}/projects/notes.md`;
      return {
        path: target,
        content: FILE_CONTENT,
        size: FILE_CONTENT.length,
        language: target.endsWith('.md') ? 'markdown' : 'text',
        owner: '1000',
        permissions: '-rw-r--r--',
        modified: NOW,
        truncated: false,
        readOnly: false,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/files/save',
    body: (url) => ({
      success: true,
      path: url.searchParams.get('path') || FILE_ENTRIES[2].path,
      created: false,
      size: FILE_CONTENT.length,
    }),
  },
  {
    path: '/api/env',
    body: () => ({
      platform: 'linux',
      home: TEST_HOME,
      cwd: `${TEST_HOME}/projects`,
      user: 'tester',
      hostname: 'omniterm-dev',
      shell: '/bin/bash',
      version: '1.6.3',
    }),
  },
  {
    path: '/api/repo/status',
    body: (url) => {
      const cwd = url.searchParams.get('path') || `${TEST_HOME}/projects`;
      return {
        isRepo: true,
        cwd,
        toplevel: cwd,
        branch: 'main',
        changed: 3,
        untracked: 1,
        ahead: 1,
        behind: 0,
        lastCommit: 'a1b2c3d wire the accessibility regression guard',
      };
    },
  },
  {
    path: '/api/docker/status',
    body: () => ({
      available: true,
      serverVersion: '27.1.1',
      running: 1,
      total: 1,
      containers: [
        {
          name: 'omniterm-redis',
          status: 'Up 3 hours',
          image: 'redis:7-alpine',
          ports: '6379/tcp',
          running: true,
        },
      ],
    }),
  },
  {
    path: '/api/terminal/status',
    body: () => ({
      available: true,
      error: null,
      shell: '/bin/bash',
      integration: 'osc-133',
      sessions: [
        {
          id: 'pty-1',
          cwd: `${TEST_HOME}/projects`,
          shell: '/bin/bash',
          cols: 120,
          rows: 32,
          createdAt: NOW,
          integration: 'osc-133',
          attached: 1,
          pid: 4242,
        },
      ],
    }),
  },
  {
    path: '/api/backups',
    body: () => ({
      dir: `${TEST_HOME}/.local/share/omniterm/backups`,
      backups: [
        {
          id: `${TEST_HOME}/.local/share/omniterm/backups/snapshot-2026-09-11-00-00-00.tar.gz`,
          name: 'snapshot-2026-09-11-00-00-00.tar.gz',
          path: `${TEST_HOME}/.local/share/omniterm/backups/snapshot-2026-09-11-00-00-00.tar.gz`,
          source: 'local tar.gz',
          schedule: 'manual',
          lastRun: NOW,
          nextRun: null,
          targetCloud: 'local',
          status: 'completed',
          sizeMb: 12.4,
        },
      ],
    }),
  },
  {
    path: '/api/alerts',
    body: () => [
      {
        id: 'alert-1',
        timestamp: NOW,
        title: 'CPU above 92%',
        message: 'load average 8.4 on 4 cores for 5 minutes',
        type: 'cpu_high',
        read: false,
      },
      {
        id: 'alert-2',
        timestamp: '2026-09-10 23:51',
        title: 'Command denied',
        message: 'sudo systemctl stop sshd was refused by the read-only guard',
        type: 'security_denied',
        read: true,
      },
    ],
  },
  {
    path: '/api/activity-logs',
    body: () => ({
      entries: [
        {
          id: 'log-1',
          timestamp: NOW,
          username: 'tester',
          role: 'local',
          action: 'FILE_SAVE',
          details: `Saved ${TEST_HOME}/projects/notes.md`,
          ip: '127.0.0.1',
          severity: 'info',
          cwd: `${TEST_HOME}/projects`,
        },
        {
          id: 'log-2',
          timestamp: '2026-09-10 23:51',
          username: 'tester',
          role: 'read-only',
          action: 'COMMAND_BLOCKED',
          details: 'Blocked sudo systemctl stop sshd (OMNITERM_READONLY=1)',
          ip: '127.0.0.1',
          severity: 'warning',
          cwd: `${TEST_HOME}`,
        },
      ],
      auditFile: `${TEST_HOME}/.local/share/omniterm/audit.jsonl`,
      total: 2,
    }),
  },
  {
    path: '/api/complete',
    body: (url) => ({
      input: url.searchParams.get('path') || `${TEST_HOME}/`,
      directory: `${TEST_HOME}/`,
      matches: [
        { name: 'projects', path: `${TEST_HOME}/projects/` },
        { name: 'notes.md', path: `${TEST_HOME}/notes.md` },
      ],
    }),
  },
];

/** Installs the stub and returns a handle for assertions / cleanup. */
export function installApiStub(): ApiStub {
  const original = globalThis.fetch;
  const calls: StubCall[] = [];
  const unmatched: string[] = [];

  const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const method = (init?.method || 'GET').toUpperCase();
    calls.push({ url: raw, method });

    const url = new URL(raw, 'http://omniterm.test');
    const route = ROUTES.find((r) => (!r.method || r.method === method) && r.path === url.pathname);
    if (!route) {
      unmatched.push(`${method} ${url.pathname}`);
      return jsonResponse({ error: `no a11y stub for ${method} ${url.pathname}` }, 404);
    }
    return jsonResponse(route.body(url));
  }) as typeof fetch;

  globalThis.fetch = impl;

  return {
    calls,
    unmatched,
    paths: () => calls.map((c) => new URL(c.url, 'http://omniterm.test').pathname),
    reset: () => {
      calls.length = 0;
      unmatched.length = 0;
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
