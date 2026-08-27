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
  userRole: UserRole;
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

export interface ActivityLog {
  id: string;
  timestamp: string;
  username: string;
  role: UserRole;
  action: string;
  details: string;
  ip: string;
  severity: 'info' | 'warning' | 'error' | 'security_alert';
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

export interface ServerHealth {
  cpuUsage: number;
  cpuCores: number;
  memoryUsage: {
    usedMb: number;
    totalMb: number;
    freeMb: number;
    percent: number;
  };
  diskUsage: {
    usedGb: number;
    totalGb: number;
    percent: number;
  };
  networkIO: {
    rxKbps: number;
    txKbps: number;
  };
  uptimeSeconds: number;
  processCount: number;
  activeConnections: number;
  topProcesses: ProcessItem[];
  systemInfo: {
    os: string;
    arch: string;
    hostname: string;
    kernel: string;
    nodeVersion: string;
  };
}

export interface TerminalPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
  type: 'visualizer' | 'command_hook' | 'formatter' | 'ai_extension' | 'security_guard';
  icon: string;
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

export interface CloudStorageProvider {
  id: string;
  name: string;
  type: 's3' | 'gcs' | 'dropbox' | 'local';
  bucketName: string;
  region: string;
  status: 'connected' | 'syncing' | 'disconnected';
  storageUsedGb: number;
  lastSync: string;
}

export interface AiToolConfig {
  mode: 'claude-coder' | 'gemini-cli' | 'cursor-agent';
  systemPrompt: string;
  autoSuggestOnError: boolean;
  temperature: number;
}

export interface TestCase {
  id: string;
  suite: string;
  name: string;
  status: 'passed' | 'failed' | 'pending' | 'running';
  durationMs: number;
  error?: string;
}

export interface EncryptionKeys {
  tlsVersion: string;
  cipherSuite: string;
  sshKeyType: 'RSA-4096' | 'Ed25519';
  publicKey: string;
  fingerprint: string;
  dataEncrypted: boolean;
}
