import React, { useState, useEffect } from 'react';
import {
  Cloud,
  HardDrive,
  Clock,
  Play,
  CheckCircle2,
  RefreshCw,
  Database,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { BackupTask, CloudStorageProvider } from '../types';

export const BackupsAndCloudView: React.FC = () => {
  const [tasks, setTasks] = useState<BackupTask[]>([]);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);

  const [cloudProviders] = useState<CloudStorageProvider[]>([
    {
      id: 'cloud-s3',
      name: 'AWS S3 Glacier Archival',
      type: 's3',
      bucketName: 'devterminal-backups-2026',
      region: 'us-east-1 (N. Virginia)',
      status: 'connected',
      storageUsedGb: 142.8,
      lastSync: '2026-08-12 07:00',
    },
    {
      id: 'cloud-gcs',
      name: 'Google Cloud Storage Bucket',
      type: 'gcs',
      bucketName: 'aistudio-backup-vault',
      region: 'europe-west2 (London)',
      status: 'connected',
      storageUsedGb: 88.4,
      lastSync: '2026-08-12 06:30',
    },
    {
      id: 'cloud-dropbox',
      name: 'Dropbox Team Encrypted Vault',
      type: 'dropbox',
      bucketName: '/DevTerminal_Snapshots',
      region: 'Global CDN',
      status: 'syncing',
      storageUsedGb: 18.2,
      lastSync: '2026-08-12 07:20',
    },
  ]);

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load backup schedules:', err);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleRunBackupNow = async (id: string) => {
    setIsExecuting(id);
    try {
      const res = await fetch('/api/backups/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('Error executing backup:', err);
    } finally {
      setIsExecuting(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-4">
        <div>
          <h1 className="text-lg font-bold text-[#E0E0E5] flex items-center gap-2">
            <Cloud className="w-5 h-5 text-[#00FF41]" />
            <span>AUTOMATED BACKUP SCHEDULING & CLOUD STORAGE SYNC</span>
          </h1>
          <p className="text-xs text-[#88888E]">
            Configure automated snapshot schedules and integrate with AWS S3, Google Cloud Storage, and Dropbox.
          </p>
        </div>

        <button
          onClick={fetchBackups}
          className="px-3 py-1.5 rounded bg-[#161618] border border-[#2A2A2E] text-xs font-bold text-[#E0E0E5] flex items-center gap-2 hover:bg-[#202024]"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#00FF41]" />
          <span>REFRESH SCHEDULES</span>
        </button>
      </div>

      {/* Cloud Storage Providers */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-[#E0E0E5] uppercase tracking-wider flex items-center gap-2">
          <Database className="w-4 h-4 text-[#3B82F6]" />
          <span>INTEGRATED CLOUD STORAGE PROVIDERS</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cloudProviders.map((provider) => (
            <div key={provider.id} className="p-4 rounded bg-[#161618] border border-[#2A2A2E] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#E0E0E5] text-xs font-mono">{provider.name}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    provider.status === 'connected'
                      ? 'bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30'
                      : 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30'
                  }`}
                >
                  {provider.status}
                </span>
              </div>

              <div className="text-xs font-mono text-[#88888E] space-y-1">
                <div>Bucket/Path: <span className="text-[#00FF41]">{provider.bucketName}</span></div>
                <div>Region: {provider.region}</div>
                <div>Storage Used: <span className="text-[#E0E0E5] font-bold">{provider.storageUsedGb} GB</span></div>
              </div>

              <div className="pt-2 border-t border-[#2A2A2E] text-[10px] text-[#55555E] flex justify-between">
                <span>Last Sync: {provider.lastSync}</span>
                <span className="text-[#00FF41] flex items-center gap-0.5 cursor-pointer hover:underline">
                  View Vault <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Automated Backup Tasks Table */}
      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
          <span className="font-bold text-xs text-[#E0E0E5] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#00FF41]" />
            <span>AUTOMATED CRON BACKUP TASKS</span>
          </span>
          <span className="text-[11px] text-[#55555E] font-mono">Encrypted with AES-256-GCM</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-[#E0E0E5]">
            <thead>
              <tr className="border-b border-[#2A2A2E] text-[11px] text-[#55555E] uppercase">
                <th className="py-2 px-3">Backup Task Name</th>
                <th className="py-2 px-3">Schedule</th>
                <th className="py-2 px-3">Target Cloud Storage</th>
                <th className="py-2 px-3">Last Execution</th>
                <th className="py-2 px-3">Next Execution</th>
                <th className="py-2 px-3">Archive Size</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2E]/60">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-[#202024]">
                  <td className="py-2.5 px-3 font-bold text-[#E0E0E5]">{task.name}</td>
                  <td className="py-2.5 px-3 text-[#3B82F6] capitalize">{task.schedule} Cron</td>
                  <td className="py-2.5 px-3 text-[#00FF41] uppercase font-bold">{task.targetCloud}</td>
                  <td className="py-2.5 px-3 text-[#88888E]">{task.lastRun}</td>
                  <td className="py-2.5 px-3 text-[#55555E]">{task.nextRun}</td>
                  <td className="py-2.5 px-3 text-[#E0E0E5]">{task.sizeMb} MB</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30">
                      {task.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => handleRunBackupNow(task.id)}
                      disabled={isExecuting === task.id}
                      className="px-2.5 py-1 rounded bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase text-xs flex items-center gap-1 ml-auto"
                    >
                      <Play className="w-3 h-3 fill-black text-black" />
                      <span>{isExecuting === task.id ? 'Running...' : 'Run Now'}</span>
                    </button>
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
