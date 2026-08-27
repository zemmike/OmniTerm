import React from 'react';
import {
  Plug,
  CheckCircle2,
  XCircle,
  Code2,
  Server,
  Lock,
  Zap,
  HardDrive,
  Cpu,
  Sliders,
} from 'lucide-react';
import { TerminalPlugin } from '../types';

interface PluginsViewProps {
  plugins: TerminalPlugin[];
  setPlugins: React.Dispatch<React.SetStateAction<TerminalPlugin[]>>;
}

export const PluginsView: React.FC<PluginsViewProps> = ({ plugins, setPlugins }) => {
  const togglePlugin = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const pluginIcons: Record<string, any> = {
    'plugin-git': Code2,
    'plugin-docker': Server,
    'plugin-sec': Lock,
    'plugin-json': Zap,
    'plugin-disk': HardDrive,
    'plugin-ai': Cpu,
  };

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-4">
        <div>
          <h1 className="text-lg font-bold text-[#E0E0E5] flex items-center gap-2">
            <Plug className="w-5 h-5 text-[#00FF41]" />
            <span>TERMINAL EXTENSION PLUGIN ARCHITECTURE</span>
          </h1>
          <p className="text-xs text-[#88888E]">
            Extend your DevTerminal experience with custom hooks, visualizers, formatters, and AI extensions.
          </p>
        </div>

        <div className="px-3 py-1.5 bg-[#161618] border border-[#2A2A2E] rounded text-xs text-[#E0E0E5]">
          <span>{plugins.filter((p) => p.enabled).length} / {plugins.length} Plugins Enabled</span>
        </div>
      </div>

      {/* Grid of Custom Terminal Extensions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plugins.map((plugin) => {
          const Icon = pluginIcons[plugin.id] || Plug;
          return (
            <div
              key={plugin.id}
              className={`p-4 rounded border transition-all space-y-3 ${
                plugin.enabled
                  ? 'bg-[#161618] border-[#2A2A2E] border-l-2 border-l-[#00FF41]'
                  : 'bg-[#161618]/50 border-[#2A2A2E]/60 opacity-60 hover:opacity-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded border ${
                      plugin.enabled
                        ? 'bg-[#202024] text-[#00FF41] border-[#2A2A2E]'
                        : 'bg-[#0A0A0B] text-[#55555E] border-[#2A2A2E]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#E0E0E5] text-sm">{plugin.name}</h3>
                    <div className="text-[10px] text-[#55555E] font-mono">
                      v{plugin.version} by {plugin.author}
                    </div>
                  </div>
                </div>

                {/* Toggle Button */}
                <button
                  onClick={() => togglePlugin(plugin.id)}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                    plugin.enabled ? 'bg-[#00FF41]' : 'bg-[#202024]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-black transition-transform ${
                      plugin.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <p className="text-xs text-[#88888E] leading-relaxed">{plugin.description}</p>

              <div className="pt-2 border-t border-[#2A2A2E] flex items-center justify-between text-[11px] font-mono text-[#55555E]">
                <span className="capitalize">Type: {plugin.type}</span>
                <span className={plugin.enabled ? 'text-[#00FF41] font-bold' : 'text-[#55555E]'}>
                  {plugin.enabled ? '● Active' : '○ Disabled'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
