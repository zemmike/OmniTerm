import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory Data Stores for Server Operations
const activityLogs: Array<{
  id: string;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  details: string;
  ip: string;
  severity: 'info' | 'warning' | 'error' | 'security_alert';
}> = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    username: 'admin_sys',
    role: 'admin',
    action: 'SYSTEM_BOOT',
    details: 'Terminal Backend Server initialized with TLS 1.3 encryption',
    ip: '127.0.0.1',
    severity: 'info',
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    username: 'dev_alex',
    role: 'developer',
    action: 'SCRIPT_EXECUTE',
    details: 'Executed deploy_pipeline.sh on local environment',
    ip: '192.168.1.45',
    severity: 'info',
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    username: 'guest_user',
    role: 'viewer',
    action: 'PERMISSION_DENIED',
    details: 'Attempted sudo rm -rf /var/log without administrative rights',
    ip: '10.0.4.12',
    severity: 'security_alert',
  },
];

const systemAlerts: Array<{
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'cpu_high' | 'disk_warning' | 'security_denied' | 'backup_failed' | 'network_spike';
  read: boolean;
}> = [
  {
    id: 'alt-1',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    title: 'Security Alert: Unauthorized Sudo',
    message: 'Viewer role attempted elevated command execution (sudo rm)',
    type: 'security_denied',
    read: false,
  },
  {
    id: 'alt-2',
    timestamp: new Date(Date.now() - 1200000).toISOString(),
    title: 'Backup Scheduled Completed',
    message: 'Automated snapshot backup #2026-0812 succeeded (1.2 GB)',
    type: 'backup_failed', // info type
    read: true,
  },
];

// Virtual Filesystem Store for System File Manager
const virtualFilesystem = [
  {
    id: 'file-1',
    path: '/etc/nginx/nginx.conf',
    name: 'nginx.conf',
    type: 'file',
    size: 2450,
    modified: '2026-08-11 14:32',
    owner: 'root',
    permissions: '-rw-r--r--',
    language: 'nginx',
    content: `user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name localhost;

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}`,
  },
  {
    id: 'file-2',
    path: '/var/scripts/deploy.sh',
    name: 'deploy.sh',
    type: 'file',
    size: 1120,
    modified: '2026-08-12 02:15',
    owner: 'dev_alex',
    permissions: '-rwxr-xr-x',
    language: 'bash',
    content: `#!/usr/bin/env bash
set -e

echo "[DEPLOY] Starting DevTerminal Pro Deployment Pipeline..."
echo "[1/4] Running security integrity audit..."
sleep 1
echo "[2/4] Syncing cloud backup assets to S3..."
sleep 1
echo "[3/4] Rebuilding Docker production cluster..."
sleep 1
echo "[4/4] Deployment successful! Service running on port 3000."
`,
  },
  {
    id: 'file-3',
    path: '/var/scripts/backup_cron.py',
    name: 'backup_cron.py',
    type: 'file',
    size: 1840,
    modified: '2026-08-10 11:00',
    owner: 'admin_sys',
    permissions: '-rwxr-xr-x',
    language: 'python',
    content: `import os
import sys
import time
import json

def run_backup():
    print("[BACKUP] Initializing automated backup task...")
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    backup_file = f"/backups/sys_snapshot_{timestamp}.tar.gz"
    print(f"[BACKUP] Generating compressed archive at {backup_file}")
    time.sleep(0.5)
    print("[BACKUP] Encrypting with AES-256-GCM cipher...")
    print("[BACKUP] Backup completed successfully!")

if __name__ == "__main__":
    run_backup()
`,
  },
  {
    id: 'file-4',
    path: '/home/user/config.json',
    name: 'config.json',
    type: 'file',
    size: 650,
    modified: '2026-08-12 06:20',
    owner: 'dev_alex',
    permissions: '-rw-r--r--',
    language: 'json',
    content: `{
  "terminalTheme": "matrix",
  "defaultShell": "zsh",
  "autoSaveHistory": true,
  "pluginCount": 4,
  "security": {
    "enforceSudoPassword": false,
    "rbacEnabled": true
  }
}`,
  },
  {
    id: 'file-5',
    path: '/var/log/syslog',
    name: 'syslog',
    type: 'file',
    size: 8900,
    modified: '2026-08-12 07:40',
    owner: 'syslog',
    permissions: '-rw-r-----',
    language: 'text',
    content: `2026-08-12 07:00:01 kernel: [0.000000] Linux version 6.6.0-devterminal (gcc 13.2) #1 SMP PREEMPT
2026-08-12 07:05:12 systemd[1]: Started DevTerminal Backend Service daemon.
2026-08-12 07:12:44 node[3000]: Express API routes listening on 0.0.0.0:3000
2026-08-12 07:22:19 auditd[882]: USER_AUTH pid=1402 uid=1000 auid=1000 res=success
2026-08-12 07:35:01 CRON[2204]: (root) CMD (python3 /var/scripts/backup_cron.py)
`,
  },
];

// Backup Schedule Store
let backupTasks = [
  {
    id: 'bak-1',
    name: 'Full System Snapshot',
    schedule: 'daily',
    lastRun: '2026-08-12 02:00:00',
    nextRun: '2026-08-13 02:00:00',
    targetCloud: 's3',
    status: 'completed',
    sizeMb: 1240,
  },
  {
    id: 'bak-2',
    name: 'Database Dump & Activity Logs',
    schedule: 'hourly',
    lastRun: '2026-08-12 07:00:00',
    nextRun: '2026-08-12 08:00:00',
    targetCloud: 'gcs',
    status: 'idle',
    sizeMb: 180,
  },
  {
    id: 'bak-3',
    name: 'User Configs & SSH Key Vault',
    schedule: 'weekly',
    lastRun: '2026-08-07 00:00:00',
    nextRun: '2026-08-14 00:00:00',
    targetCloud: 'dropbox',
    status: 'idle',
    sizeMb: 45,
  },
];

// Helper: Gemini AI Client
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ------------------- API ENDPOINTS ------------------- //

// 1. Server Health Metrics Endpoint
app.get('/api/health', (req, res) => {
  const memoryTotal = 16384; // 16GB
  const memoryUsed = 6840 + Math.floor(Math.sin(Date.now() / 3000) * 300);
  const memoryFree = memoryTotal - memoryUsed;

  const uptime = Math.floor((Date.now() - 1754980000000) / 1000) % 864000 + 43200;

  res.json({
    status: 'healthy',
    cpuUsage: Math.floor(22 + Math.random() * 15 + Math.sin(Date.now() / 2000) * 10),
    cpuCores: 8,
    memoryUsage: {
      usedMb: memoryUsed,
      totalMb: memoryTotal,
      freeMb: memoryFree,
      percent: Math.round((memoryUsed / memoryTotal) * 100),
    },
    diskUsage: {
      usedGb: 142.5,
      totalGb: 500,
      percent: 28.5,
    },
    networkIO: {
      rxKbps: Math.floor(120 + Math.random() * 80),
      txKbps: Math.floor(450 + Math.random() * 200),
    },
    uptimeSeconds: uptime,
    processCount: 148,
    activeConnections: 12,
    topProcesses: [
      { pid: 3000, name: 'node (server.ts)', cpu: 4.2, memory: 185.4, user: 'node' },
      { pid: 1420, name: 'nginx-proxy', cpu: 1.8, memory: 42.1, user: 'www-data' },
      { pid: 882, name: 'dockerd', cpu: 6.5, memory: 412.0, user: 'root' },
      { pid: 2104, name: 'zsh-terminal-session', cpu: 0.9, memory: 28.5, user: 'dev_alex' },
      { pid: 3120, name: 'claude-ai-agent-cli', cpu: 3.1, memory: 142.8, user: 'dev_alex' },
    ],
    systemInfo: {
      os: 'Linux (Cloud Run Container / DevTerminal)',
      arch: 'x86_64',
      hostname: 'devterminal-core-01',
      kernel: '6.6.0-v8-aistudio',
      nodeVersion: process.version,
    },
  });
});

// 2. Terminal Command Execution API
app.post('/api/terminal/execute', (req, res) => {
  const { command, cwd = '/home/user', userRole = 'developer', osPreset = 'macos' } = req.body;
  const startTime = Date.now();

  if (!command || !command.trim()) {
    return res.json({
      output: '',
      status: 'success',
      executionTimeMs: 0,
      cwd,
    });
  }

  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();

  // RBAC Permission Guard Check
  if (userRole === 'viewer' && (lower.startsWith('sudo') || lower.startsWith('rm') || lower.startsWith('chmod') || lower.startsWith('touch') || lower.includes('>'))) {
    activityLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      username: 'current_user',
      role: userRole,
      action: 'PERMISSION_DENIED',
      details: `Denied command '${trimmed}' for role '${userRole}'`,
      ip: '127.0.0.1',
      severity: 'security_alert',
    });

    systemAlerts.unshift({
      id: `alt-${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: 'Security Exception: Permission Guard',
      message: `Role '${userRole}' attempted elevated command '${trimmed}'`,
      type: 'security_denied',
      read: false,
    });

    return res.json({
      output: `[PERMISSION ERROR]: Role '${userRole}' lacks required permissions for command: '${trimmed}'. Request 'admin' elevation.`,
      status: 'denied',
      executionTimeMs: Date.now() - startTime,
      cwd,
    });
  }

  // Log action
  activityLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    username: 'current_user',
    role: userRole,
    action: 'COMMAND_EXEC',
    details: `Executed: ${trimmed} in ${cwd}`,
    ip: '127.0.0.1',
    severity: 'info',
  });

  // Custom Simulator for Commands
  let output = '';
  let status: 'success' | 'error' = 'success';
  let syntaxType: any = 'text';

  if (lower === 'clear') {
    output = '__CLEAR__';
  } else if (lower === 'pwd') {
    output = cwd;
  } else if (lower === 'whoami') {
    output = `user: dev_alex (role: ${userRole}, os: ${osPreset})`;
  } else if (lower === 'date') {
    output = new Date().toUTCString();
  } else if (lower === 'ls' || lower === 'ls -la' || lower === 'dir') {
    output = `drwxr-xr-x 5 root root 4096 Aug 12 07:30 .
drwxr-xr-x 3 root root 4096 Aug 12 07:00 ..
-rw-r--r-- 1 dev_alex dev_alex  650 Aug 12 06:20 config.json
-rwxr-xr-x 1 dev_alex dev_alex 1120 Aug 12 02:15 deploy.sh
-rwxr-xr-x 1 admin_sys admin_sys 1840 Aug 10 11:00 backup_cron.py
drwxr-xr-x 2 dev_alex dev_alex 4096 Aug 12 07:15 src/
drwxr-xr-x 4 root root 4096 Aug 11 14:32 etc/`;
    syntaxType = 'bash';
  } else if (lower.startsWith('cat ')) {
    const filename = trimmed.substring(4).trim();
    const found = virtualFilesystem.find((f) => f.name === filename || f.path.endsWith(filename));
    if (found) {
      output = found.content || '[Empty File]';
      syntaxType = found.language || 'text';
    } else {
      output = `cat: ${filename}: No such file or directory`;
      status = 'error';
    }
  } else if (lower === 'ps' || lower === 'top' || lower === 'htop') {
    output = `PID   USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
 3000 node      20   0  845200 185400  38200 S   4.2   1.1   0:14.22 node server.ts
 1420 www-data  20   0  124100  42100  12000 S   1.8   0.3   0:05.10 nginx
  882 root      20   0 1120000 412000  98200 S   6.5   2.5   1:42.88 dockerd
 3120 dev_alex  20   0  312000 142800  28100 S   3.1   0.9   0:08.50 claude-cli`;
    syntaxType = 'bash';
  } else if (lower.startsWith('echo ')) {
    output = trimmed.substring(5).replace(/^['"]|['"]$/g, '');
  } else if (lower.startsWith('node ') || lower === 'node') {
    if (trimmed === 'node -v' || trimmed === 'node --version') {
      output = process.version;
    } else {
      output = `[Node.js v22 Run Engine] Executing inline script...\n> Script completed with return code 0`;
      syntaxType = 'node';
    }
  } else if (lower.startsWith('python ') || lower.startsWith('python3 ')) {
    output = `[Python 3.11 Execution Engine]\nInitializing environment...\nProcess finished with exit code 0`;
    syntaxType = 'python';
  } else if (lower.startsWith('ping ')) {
    const host = trimmed.split(' ')[1] || 'google.com';
    output = `PING ${host} (142.250.190.46): 56 data bytes
64 bytes from 142.250.190.46: icmp_seq=0 ttl=116 time=12.4 ms
64 bytes from 142.250.190.46: icmp_seq=1 ttl=116 time=11.8 ms
64 bytes from 142.250.190.46: icmp_seq=2 ttl=116 time=12.1 ms
--- ${host} ping statistics ---
3 packets transmitted, 3 packets received, 0.0% packet loss`;
  } else if (lower.startsWith('git ')) {
    if (lower.includes('status')) {
      output = `On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
	modified:   src/App.tsx
	modified:   server.ts

no changes added to commit (use "git add" and/or "git commit")`;
    } else if (lower.includes('log')) {
      output = `* commit a4f8e91 (HEAD -> main, origin/main)
| Author: DevTerminal Agent <agent@aistudio.build>
| Date:   Wed Aug 12 07:20:00 2026 -0700
|     feat: add real-time encryption and backup automation engine
* commit 82e11a2
  Author: DevTerminal Agent <agent@aistudio.build>
  Date:   Wed Aug 12 06:45:00 2026 -0700
      feat: setup multi-tab terminal interface and permission guards`;
    } else {
      output = `[git engine] Command '${trimmed}' executed successfully.`;
    }
  } else if (lower.startsWith('docker ')) {
    output = `CONTAINER ID   IMAGE                 COMMAND                  CREATED        STATUS        PORTS                  NAMES
c8f9210a4e     devterminal:latest    "node server.cjs"        2 hours ago    Up 2 hours    0.0.0.0:3000->3000/tcp devterm_app
f109a24d8b     redis:7-alpine        "docker-entrypoint.s…"   5 hours ago    Up 5 hours    6379/tcp               redis_cache`;
  } else if (lower === 'backup run' || lower.startsWith('backup ')) {
    output = `[BACKUP ENGINE] Initiating scheduled snapshot backup task...\nTarget: AWS S3 (bucket: devterminal-backups-2026)\nCompression: Gzip level 9\nEncryption: AES-256-GCM\n[SUCCESS] Backup completed! Snapshot ID: snap-20260812-9921 (Size: 1,240 MB)`;
  } else if (lower.startsWith('sudo ')) {
    output = `[sudo] password for ${userRole}: ********
Elevated execution granted for command: '${trimmed.substring(5)}'
Operation completed successfully.`;
  } else if (lower === 'history') {
    const recentLogs = activityLogs.slice(0, 25).reverse();
    output = recentLogs.map((l, i) => `  ${(i + 1).toString().padStart(4, ' ')}  ${l.details.replace('Executed: ', '')}`).join('\n') || '  1  welcome\n  2  help';
    syntaxType = 'bash';
  } else if (lower === 'help') {
    output = `DevTerminal Pro - Supported CLI Commands:
  • ls / dir          - List filesystem directory contents
  • cat <file>        - Display file content
  • pwd / whoami      - Show current working path and user identity
  • ps / top          - Display active system process monitor
  • node <script>     - Execute Node.js scripts
  • python <script>   - Run Python scripts
  • ping <host>       - Network diagnosis
  • git status/log    - Inspection of source control
  • docker ps         - Inspect running container runtime
  • backup run        - Execute instant system backup snapshot
  • claude <prompt>   - Execute AI Coder Copilot command
  • gemini <prompt>   - Execute Gemini Terminal Assistant
  • history           - Print past command history list
  • clear             - Clear terminal viewport (Ctrl+L)`;
  } else {
    output = `command executed: '${trimmed}'\nReturn code: 0\n[DevTerminal Execution Engine - ${osPreset.toUpperCase()} Preset]`;
  }

  res.json({
    output,
    status,
    executionTimeMs: Date.now() - startTime,
    cwd,
    syntaxType,
  });
});

// 3. AI CLI Copilot / Claude Coder API Endpoint
app.post('/api/ai/copilot', async (req, res) => {
  const { action, prompt, mode = 'claude-coder', contextLogs = '' } = req.body;

  const ai = getGeminiClient();

  if (!ai) {
    // Graceful fallback response if Gemini key is not configured
    let fallbackText = '';
    if (action === 'suggest_command') {
      fallbackText = `Suggested Command for "${prompt}":\n\`\`\`bash\nfind . -name "*.ts" -type f -exec grep -H "process.env" {} + | awk '{print $1}'\n\`\`\`\n\nExplanation: This command recursively scans TypeScript files for environment variable usage and lists matching file names.`;
    } else if (action === 'generate_script') {
      fallbackText = `#!/usr/bin/env bash\n# Custom Shell Script generated for: ${prompt}\n\necho "[AI Copilot] Starting automation task..."\nif [ ! -d "./logs" ]; then\n  mkdir -p ./logs\nfi\ntar -czf ./logs/archive_$(date +%Y%m%d).tar.gz ./src\necho "[AI Copilot] Backup completed successfully!"\n`;
    } else if (action === 'explain_command') {
      fallbackText = `Command Explanation for: \`${prompt}\`\n- Parse flags and arguments\n- Execute with high efficiency\n- Return standard stream outputs`;
    } else {
      fallbackText = `[AI Assistant (${mode.toUpperCase()})]\nI analyzed your terminal query: "${prompt}".\nTo optimize your workflow on this environment, use pipe combinations and filter standard outputs with \`grep\` or \`jq\`.`;
    }

    return res.json({
      result: fallbackText,
      mode,
      source: 'fallback',
    });
  }

  try {
    let systemInstruction = `You are ${mode === 'claude-coder' ? 'Claude Coder' : mode === 'gemini-cli' ? 'Gemini CLI Terminal Assistant' : 'Cursor Agent'}, an expert AI Terminal CLI Copilot. Provide ultra-concise, accurate terminal commands, shell scripts, and command explanations for developers working on Linux, macOS, and Windows. Format output cleanly with syntax highlighted code blocks.`;

    const userPrompt = `Action: ${action}\nUser Query: ${prompt}\nRecent Terminal Context Logs:\n${contextLogs}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    res.json({
      result: response.text || 'No response generated.',
      mode,
      source: 'gemini-3.6-flash',
    });
  } catch (err: any) {
    console.error('Gemini API Error in /api/ai/copilot:', err);
    res.json({
      result: `[AI Copilot Error]: ${err.message || 'Failed to generate AI terminal suggestion'}.\nFalling back to local pattern: Use \`ls -la\` or \`git status\`.`,
      mode,
      source: 'fallback_error',
    });
  }
});

// 4. File Manager Endpoints
app.get('/api/files', (req, res) => {
  res.json(virtualFilesystem);
});

app.post('/api/files/save', (req, res) => {
  const { path: filePath, content, userRole } = req.body;

  if (userRole === 'viewer') {
    return res.status(403).json({ error: 'Permission Denied: Viewer role cannot modify system files.' });
  }

  const existingIndex = virtualFilesystem.findIndex((f) => f.path === filePath);
  if (existingIndex >= 0) {
    virtualFilesystem[existingIndex].content = content;
    virtualFilesystem[existingIndex].size = Buffer.byteLength(content, 'utf-8');
    virtualFilesystem[existingIndex].modified = new Date().toISOString().replace('T', ' ').substring(0, 16);
  } else {
    const filename = filePath.split('/').pop() || 'new_file.txt';
    virtualFilesystem.push({
      id: `file-${Date.now()}`,
      path: filePath,
      name: filename,
      type: 'file',
      size: Buffer.byteLength(content, 'utf-8'),
      modified: new Date().toISOString().replace('T', ' ').substring(0, 16),
      owner: userRole === 'admin' ? 'root' : 'dev_alex',
      permissions: '-rw-r--r--',
      language: filename.endsWith('.json') ? 'json' : filename.endsWith('.sh') ? 'bash' : filename.endsWith('.py') ? 'python' : 'text',
      content,
    });
  }

  activityLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    username: 'current_user',
    role: userRole,
    action: 'FILE_SAVE',
    details: `Saved changes to ${filePath}`,
    ip: '127.0.0.1',
    severity: 'info',
  });

  res.json({ success: true, path: filePath });
});

// 5. Activity Logs & Alerts Endpoints
app.get('/api/activity-logs', (req, res) => {
  res.json(activityLogs);
});

app.get('/api/alerts', (req, res) => {
  res.json(systemAlerts);
});

app.post('/api/alerts/mark-read', (req, res) => {
  systemAlerts.forEach((a) => (a.read = true));
  res.json({ success: true });
});

// 6. Backups API Endpoint
app.get('/api/backups', (req, res) => {
  res.json(backupTasks);
});

app.post('/api/backups/run', (req, res) => {
  const { id } = req.body;
  const task = backupTasks.find((b) => b.id === id);
  if (task) {
    task.lastRun = new Date().toISOString().replace('T', ' ').substring(0, 19);
    task.status = 'completed';
    task.sizeMb += Math.floor(Math.random() * 20);
  }

  activityLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    username: 'admin_sys',
    role: 'admin',
    action: 'BACKUP_EXECUTE',
    details: `Ran automated backup task: ${task?.name || id}`,
    ip: '127.0.0.1',
    severity: 'info',
  });

  res.json({ success: true, tasks: backupTasks });
});

// 7. Unit Tests Runner Endpoint
app.post('/api/unit-tests/run', (req, res) => {
  const tests = [
    { id: 'test-1', suite: 'Terminal Command Engine', name: 'Execute pwd command returns valid cwd', status: 'passed', durationMs: 12 },
    { id: 'test-2', suite: 'Terminal Command Engine', name: 'Parse multi-token flags and quotes', status: 'passed', durationMs: 18 },
    { id: 'test-3', suite: 'RBAC Permission Guard', name: 'Block sudo command for Viewer role', status: 'passed', durationMs: 8 },
    { id: 'test-4', suite: 'RBAC Permission Guard', name: 'Allow elevated commands for Admin role', status: 'passed', durationMs: 10 },
    { id: 'test-5', suite: 'Encryption & TLS Guard', name: 'Verify AES-256-GCM cipher payload encryption', status: 'passed', durationMs: 25 },
    { id: 'test-6', suite: 'Encryption & TLS Guard', name: 'Generate Ed25519 SSH keypair fingerprint', status: 'passed', durationMs: 34 },
    { id: 'test-7', suite: 'Backup Scheduler Engine', name: 'Validate Cron interval calculation for daily backup', status: 'passed', durationMs: 15 },
    { id: 'test-8', suite: 'Cloud Storage Provider', name: 'Verify AWS S3 multipart upload simulation', status: 'passed', durationMs: 22 },
  ];

  res.json({
    passedCount: tests.length,
    failedCount: 0,
    totalCount: tests.length,
    totalDurationMs: tests.reduce((acc, t) => acc + t.durationMs, 0),
    tests,
  });
});

// 8. API Documentation Endpoint
app.get('/api/api-docs', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'DevTerminal Pro Core REST API',
      version: '2.4.0',
      description: 'Comprehensive API documentation for DevTerminal Pro CLI integration, server metrics, backup automation, and permission guards.',
    },
    paths: {
      '/api/health': {
        get: { summary: 'Get real-time server health metrics (CPU, Memory, Disk, Network)', responses: { 200: { description: 'Server metrics object' } } },
      },
      '/api/terminal/execute': {
        post: { summary: 'Execute terminal command with RBAC permission check', responses: { 200: { description: 'Execution result' } } },
      },
      '/api/ai/copilot': {
        post: { summary: 'Query Gemini AI CLI Copilot / Claude Coder for script generation', responses: { 200: { description: 'AI generated response' } } },
      },
      '/api/files': {
        get: { summary: 'Fetch virtual system files tree and contents', responses: { 200: { description: 'List of virtual files' } } },
      },
      '/api/backups': {
        get: { summary: 'Fetch backup schedule and status list', responses: { 200: { description: 'Backup tasks array' } } },
      },
    },
  });
});

// ------------------- VITE SETUP & SERVER BINDING ------------------- //
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[DevTerminal Pro Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
