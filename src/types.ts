export type OSPreset = 'macos' | 'linux' | 'windows';
export type EnvironmentType = 'local' | 'remote-ssh' | 'claude-coder-ai';
export type UserRole = 'admin' | 'developer' | 'auditor' | 'viewer';

export interface TerminalCommand {
  id: string;
  timestamp: string;
  command: string;
  output: string;
  status: 'success' | 'error' | 'running' | 'denied';
  executionTimeMs: number;
  cwd: string;
  os: OSPreset;
  syntaxType?: 'bash' | 'powershell' | 'json' | 'node' | 'python' | 'text' | 'sql';
}

export interface TerminalTab {
  id: string;
  title: string;
  osPreset: OSPreset;
  environment: EnvironmentType;
  cwd: string;
  history: TerminalCommand[];
  colorTheme: string; // 'matrix' | 'retro' | 'cyberpunk' | 'dracula' | 'slate'
  sshHost?: string;
  activePluginIds: string[];
}

export interface FileItem {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  owner: string;
  permissions: string;
  content?: string;
  language?: string;
}

export interface UserPermissions {
  canExecuteSudo: boolean;
  canEditSystemFiles: boolean;
  canManageBackups: boolean;
  canManageUsers: boolean;
  canInstallPlugins: boolean;
  canAccessAiCopilot: boolean;
  canSyncCloudStorage: boolean;
}

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  permissions: UserPermissions;
  lastLogin: string;
  status: 'active' | 'suspended';
  avatarColor: string;
}


export interface SystemAlert {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'cpu_high' | 'disk_warning' | 'security_denied' | 'backup_failed' | 'network_spike';
  read: boolean;
}

export interface ProcessItem {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user: string;
}

/** A process row from the RSS-sorted `ps` pass, as shown in the RAM tables. */
export interface MemoryProcessItem extends ProcessItem {
  /** Resident set size in MB (RSS), taken straight from ps. */
  rssMb: number;
  /** %MEM exactly as ps reported it. */
  percent: number;
}

/** Every figure is in MB, read from /proc/meminfo. */
export interface MemoryBreakdown {
  total: number;
  free: number;
  /** MemAvailable — the figure free/top mean by "free"; includes reclaimable cache. */
  available: number;
  buffers: number;
  cached: number;
  /** Shmem (shared memory / tmpfs). */
  shared: number;
  slab: number;
  dirty: number;
  swapTotal: number;
  swapFree: number;
  /** (total - available) / total — the honest "how full is RAM" number. */
  usedPercent: number;
  swapPercent: number;
}

/** RSS summed per program name — what actually answers "what is eating my RAM". */
export interface MemoryGroupItem {
  name: string;
  processes: number;
  rssMb: number;
  percentOfRam: number;
}

export interface SwapUsage {
  totalMb: number;
  freeMb: number;
  usedMb: number;
  percent: number;
}

export interface MountUsage {
  path: string;
  device: string;
  fs: string;
  usedGb: number;
  totalGb: number;
  percent: number;
}

export interface DiskIO {
  readKbps: number;
  writeKbps: number;
  /** Whole block device the rates were measured across. */
  device: string;
}

export interface PerCoreCpu {
  /** 0-based core index; the UI renders it as cpu0..cpuN. */
  core: number;
  usage: number;
}

export interface ServerHealth {
  cpuModel?: string;
  networkInterface?: string;
  cpuUsage: number;
  cpuCores: number;
  memoryUsage: {
    usedMb: number;
    totalMb: number;
    freeMb: number;
    /** MemAvailable: what free/top mean by free, including reclaimable cache. */
    availableMb: number;
    percent: number;
  };
  diskUsage: {
    usedGb: number;
    totalGb: number;
    percent: number;
    /** Path the figures were measured on (e.g. the user's home directory). */
    path?: string;
  };
  networkIO: {
    rxKbps: number;
    txKbps: number;
    /** Interface actually carrying the traffic, from /proc/net/dev. */
    interface?: string;
  };
  uptimeSeconds: number;
  processCount: number;
  activeConnections: number;
  topProcesses: ProcessItem[];
  /**
   * Deep resource breakdown added by the expanded health endpoint. Optional so
   * the view keeps working against an older payload; each is null/empty when
   * the underlying source is unavailable, and the UI then says so.
   */
  memoryBreakdown?: MemoryBreakdown | null;
  topMemoryProcesses?: MemoryProcessItem[];
  memoryByGroup?: MemoryGroupItem[];
  swapUsage?: SwapUsage | null;
  mounts?: MountUsage[];
  diskIO?: DiskIO;
  perCoreCpu?: PerCoreCpu[];
  cpuTemperature?: number | null;
  systemInfo: {
    os: string;
    arch: string;
    hostname: string;
    kernel: string;
    nodeVersion: string;
  };
}


export interface BackupTask {
  id: string;
  name: string;
  schedule: 'hourly' | 'daily' | 'weekly' | 'manual';
  lastRun: string;
  nextRun: string;
  targetCloud: 's3' | 'gcs' | 'dropbox' | 'local';
  status: 'idle' | 'running' | 'completed' | 'failed';
  sizeMb: number;
}


export interface AiToolConfig {
  mode: 'claude-coder' | 'gemini-cli' | 'cursor-agent';
  systemPrompt: string;
  autoSuggestOnError: boolean;
  temperature: number;
}


