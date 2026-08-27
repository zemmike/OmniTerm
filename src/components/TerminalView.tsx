import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Terminal as TerminalIcon,
  Plus,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Server,
  Code2,
  Lock,
  Cpu,
  CornerDownLeft,
  ChevronRight,
  ShieldAlert,
  History,
  Command,
} from 'lucide-react';
import { TerminalTab, TerminalCommand, OSPreset, UserRole, TerminalPlugin } from '../types';
import { TERMINAL_THEMES } from '../lib/themeUtils';

interface TerminalViewProps {
  tabs: TerminalTab[];
  setTabs: React.Dispatch<React.SetStateAction<TerminalTab[]>>;
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  osPreset: OSPreset;
  userRole: UserRole;
  currentTheme: string;
  plugins: TerminalPlugin[];
}

const STORAGE_KEY = 'omniterm_command_history';

const DEFAULT_COMMANDS = [
  'help',
  'ls -la',
  'ps top',
  'git status',
  'docker ps',
  'backup run',
  'cat deploy.sh',
  'cat config.json',
  'cat /var/scripts/backup_cron.py',
  'whoami',
  'pwd',
  'ping 8.8.8.8',
  'git log',
  'node -v',
  'python /var/scripts/backup_cron.py',
  'clear',
  'history',
];

export const TerminalView: React.FC<TerminalViewProps> = ({
  tabs,
  setTabs,
  activeTabId,
  setActiveTabId,
  osPreset,
  userRole,
  currentTheme,
  plugins,
}) => {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const [inputCommand, setInputCommand] = useState('');
  
  // Persistent Command History (stored in localStorage)
  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_COMMANDS;
  });

  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draftCommand, setDraftCommand] = useState<string>('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ commandId: string; text: string } | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const theme = TERMINAL_THEMES[currentTheme] || TERMINAL_THEMES.matrix;

  // Auto-scroll to bottom of terminal when history changes
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab?.history, isExecuting]);

  // Keep input focused
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeTabId]);

  // Synchronize Command History to LocalStorage
  const saveCommandToHistory = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    setCommandHistory((prev) => {
      // Remove duplicate and insert at front
      const filtered = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 200);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  // Autocomplete matching dictionary (combines unique history + system commands)
  const allKnownCommands = useMemo(() => {
    const set = new Set([...commandHistory, ...DEFAULT_COMMANDS]);
    return Array.from(set);
  }, [commandHistory]);

  // Compute matching suggestions based on current input
  const suggestions = useMemo(() => {
    const trimmed = inputCommand.trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();
    return allKnownCommands
      .filter((cmd) => cmd.toLowerCase().startsWith(lower) && cmd.toLowerCase() !== lower)
      .slice(0, 6);
  }, [inputCommand, allKnownCommands]);

  // Top Ghost Suggestion (Zsh/Fish style inline hint)
  const ghostSuggestion = useMemo(() => {
    if (!inputCommand || suggestions.length === 0) return '';
    const topMatch = suggestions[selectedSuggestionIndex] || suggestions[0];
    if (topMatch && topMatch.toLowerCase().startsWith(inputCommand.toLowerCase())) {
      return topMatch.slice(inputCommand.length);
    }
    return '';
  }, [inputCommand, suggestions, selectedSuggestionIndex]);

  // Reset selected suggestion when input changes
  useEffect(() => {
    setSelectedSuggestionIndex(0);
    setShowSuggestions(true);
  }, [inputCommand]);

  // Handle Tab Creation
  const handleAddTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab: TerminalTab = {
      id: newId,
      title: `Tab ${tabs.length + 1} (${osPreset})`,
      osPreset,
      environment: 'local',
      cwd: '/home/user',
      history: [
        {
          id: `cmd-init-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          command: 'welcome',
          output: `DevTerminal Pro v2.4.0 (${osPreset.toUpperCase()} Run Engine)\nConnected as '${userRole}' with TLS 1.3 encryption.\nPersistent command history & Up/Down autocomplete active.\nType 'help' or 'history' for commands.`,
          status: 'success',
          executionTimeMs: 4,
          cwd: '/home/user',
          userRole,
          os: osPreset,
        },
      ],
      colorTheme: currentTheme,
      activePluginIds: plugins.filter((p) => p.enabled).map((p) => p.id),
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  };

  // Handle Tab Close
  const handleCloseTab = (idToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // Keep at least 1 tab
    const filtered = tabs.filter((t) => t.id !== idToClose);
    setTabs(filtered);
    if (activeTabId === idToClose) {
      setActiveTabId(filtered[0].id);
    }
  };

  // Execute Command via Backend Express API
  const handleExecuteCommand = async (cmdToRun?: string) => {
    const cmd = cmdToRun !== undefined ? cmdToRun : inputCommand;
    if (!cmd.trim() || isExecuting) return;

    const trimmedCmd = cmd.trim();
    setIsExecuting(true);
    setInputCommand('');
    setDraftCommand('');
    setHistoryIndex(-1);
    setShowSuggestions(false);

    // Save to persistent command history
    saveCommandToHistory(trimmedCmd);

    try {
      const res = await fetch('/api/terminal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: trimmedCmd,
          cwd: activeTab.cwd,
          userRole,
          osPreset,
        }),
      });

      const data = await res.json();

      if (data.output === '__CLEAR__') {
        // Clear tab history
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTab.id ? { ...t, history: [] } : t))
        );
      } else {
        const newCmd: TerminalCommand = {
          id: `cmd-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          command: trimmedCmd,
          output: data.output,
          status: data.status,
          executionTimeMs: data.executionTimeMs,
          cwd: data.cwd || activeTab.cwd,
          userRole,
          os: osPreset,
          syntaxType: data.syntaxType,
        };

        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id ? { ...t, history: [...t.history, newCmd] } : t
          )
        );
      }
    } catch (err: any) {
      const errCmd: TerminalCommand = {
        id: `cmd-err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        command: trimmedCmd,
        output: `[NETWORK/EXECUTION ERROR]: ${err.message || 'Failed to communicate with Express server.'}`,
        status: 'error',
        executionTimeMs: 12,
        cwd: activeTab.cwd,
        userRole,
        os: osPreset,
      };

      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id ? { ...t, history: [...t.history, errCmd] } : t
        )
      );
    } finally {
      setIsExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  // Up/Down Arrow Key Navigation & Autocomplete Handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 1. Enter key: Execute command
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecuteCommand();
      return;
    }

    // 2. Up Arrow key: Navigate to older commands in history
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;

      if (historyIndex === -1) {
        // Save currently typed text as draft
        setDraftCommand(inputCommand);
        setHistoryIndex(0);
        setInputCommand(commandHistory[0]);
      } else {
        const nextIdx = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(nextIdx);
        setInputCommand(commandHistory[nextIdx]);
      }
      return;
    }

    // 3. Down Arrow key: Navigate to newer commands or return to draft
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const prevIdx = historyIndex - 1;
        setHistoryIndex(prevIdx);
        setInputCommand(commandHistory[prevIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputCommand(draftCommand);
      }
      return;
    }

    // 4. Tab key: Autocomplete to the suggested command
    if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length > 0) {
        const selected = suggestions[selectedSuggestionIndex] || suggestions[0];
        setInputCommand(selected);
        // Cycle suggestion for subsequent tabs
        setSelectedSuggestionIndex((prev) => (prev + 1) % suggestions.length);
      } else if (ghostSuggestion) {
        setInputCommand(inputCommand + ghostSuggestion);
      }
      return;
    }

    // 5. Right Arrow: If cursor is at the end of input and ghost suggestion exists, complete it
    if (e.key === 'ArrowRight' && ghostSuggestion) {
      const inputEl = inputRef.current;
      if (inputEl && inputEl.selectionStart === inputCommand.length) {
        e.preventDefault();
        setInputCommand(inputCommand + ghostSuggestion);
        return;
      }
    }

    // 6. Escape: Close suggestions popup
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      return;
    }

    // 7. Ctrl + C: Clear input line and reset
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      setInputCommand('');
      setDraftCommand('');
      setHistoryIndex(-1);
      setShowSuggestions(false);
      return;
    }

    // 8. Ctrl + L: Clear terminal viewport
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, history: [] } : t))
      );
      return;
    }
  };

  // AI Quick Fix Error Analysis
  const handleAskAiFix = async (cmdItem: TerminalCommand) => {
    try {
      setAiAnalysis({ commandId: cmdItem.id, text: 'Analyzing terminal error with Gemini AI...' });
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'debug_error',
          prompt: `Command '${cmdItem.command}' failed with error:\n${cmdItem.output}`,
          mode: 'claude-coder',
        }),
      });
      const data = await res.json();
      setAiAnalysis({ commandId: cmdItem.id, text: data.result });
    } catch (err: any) {
      setAiAnalysis({ commandId: cmdItem.id, text: 'Failed to contact AI Copilot service.' });
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Pre-baked Quick Scripts
  const quickScripts = [
    { label: '🚀 Deploy Pipeline', cmd: 'cat deploy.sh' },
    { label: '📦 Backup Snapshot', cmd: 'backup run' },
    { label: '📊 System Top PS', cmd: 'ps top' },
    { label: '🔍 Git Status', cmd: 'git status' },
    { label: '🐳 Docker PS', cmd: 'docker ps' },
    { label: '🐍 Python Cron', cmd: 'python /var/scripts/backup_cron.py' },
  ];

  const activePlugins = plugins.filter((p) => p.enabled);

  return (
    <div className={`flex flex-col h-[calc(100vh-125px)] ${theme.bg} text-[#E0E0E5] font-mono text-sm`}>
      {/* Tab Navigation Header Bar */}
      <div className="bg-[#161618] border-b border-[#2A2A2E] flex items-center justify-between px-2 pt-1.5 overflow-x-auto no-scrollbar select-none">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group cursor-pointer px-3 py-1.5 rounded-t border-t border-x text-xs flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-[#0A0A0B] border-[#2A2A2E] text-[#00FF41] font-bold border-t-2 border-t-[#00FF41]'
                    : 'bg-[#161618] border-[#2A2A2E]/60 text-[#88888E] hover:text-[#E0E0E5] hover:bg-[#202024]'
                }`}
              >
                <TerminalIcon className={`w-3.5 h-3.5 ${isActive ? 'text-[#00FF41]' : 'text-[#55555E]'}`} />
                <span>{tab.title}</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-[#202024] text-[#88888E] uppercase font-bold border border-[#2A2A2E]">
                  {tab.environment === 'remote-ssh' ? 'SSH' : tab.osPreset}
                </span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="opacity-40 group-hover:opacity-100 hover:text-[#FF5555] p-0.5 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={handleAddTab}
            className="p-1.5 rounded bg-[#202024] hover:bg-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5] transition-all border border-[#2A2A2E] ml-1"
            title="Create New Terminal Tab"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab Environment Preset Selector */}
        <div className="hidden sm:flex items-center gap-2 pb-1 text-xs">
          <span className="text-[#55555E] text-[11px]">Env:</span>
          <select
            value={activeTab.environment}
            onChange={(e) =>
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === activeTab.id ? { ...t, environment: e.target.value as any } : t
                )
              )
            }
            className="bg-[#0A0A0B] border border-[#2A2A2E] rounded px-2 py-0.5 text-[11px] text-[#E0E0E5] focus:outline-none focus:border-[#00FF41]"
          >
            <option value="local">Local Native Machine</option>
            <option value="remote-ssh">Remote SSH Server (root@10.0.1.50)</option>
            <option value="claude-coder-ai">Claude Coder AI Environment</option>
          </select>
        </div>
      </div>

      {/* Quick Scripts & Extensions Bar */}
      <div className="bg-[#161618] border-b border-[#2A2A2E] px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs select-none">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[#55555E] text-[11px] font-bold">SCRIPTS:</span>
          {quickScripts.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleExecuteCommand(s.cmd)}
              className="px-2.5 py-1 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] text-[#E0E0E5] hover:text-[#00FF41] transition-all text-[11px] flex items-center gap-1.5 whitespace-nowrap"
            >
              <Play className="w-2.5 h-2.5 text-[#00FF41] fill-[#00FF41]" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* History Count Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#202024] border border-[#2A2A2E] text-[10px] text-[#88888E]">
            <History className="w-3 h-3 text-[#00FF41]" />
            <span>{commandHistory.length} in History (↑/↓)</span>
          </div>

          {activePlugins.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#202024] border border-[#2A2A2E] text-[10px] text-[#88888E]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41]" />
              <span>{activePlugins.length} Extensions</span>
            </div>
          )}
          <button
            onClick={() =>
              setTabs((prev) =>
                prev.map((t) => (t.id === activeTab.id ? { ...t, history: [] } : t))
              )
            }
            className="px-2 py-1 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] text-[#88888E] hover:text-[#FF5555] transition-all text-[11px] flex items-center gap-1"
            title="Clear Terminal Output Viewport (Ctrl+L)"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Plugin Visualizer Bar */}
      {activePlugins.length > 0 && (
        <div className="bg-[#0A0A0B] border-b border-[#2A2A2E] px-4 py-1 flex items-center justify-between gap-4 text-[11px] select-none">
          <div className="flex items-center gap-4 text-[#88888E] overflow-x-auto">
            {activePlugins.some((p) => p.id === 'plugin-git') && (
              <div className="flex items-center gap-1.5 text-[#00FF41] font-bold">
                <Code2 className="w-3.5 h-3.5" />
                <span>git:(main)</span>
                <span className="text-[#55555E]">|</span>
                <span className="text-[#3B82F6]">2 modified</span>
              </div>
            )}
            {activePlugins.some((p) => p.id === 'plugin-docker') && (
              <div className="flex items-center gap-1.5 text-[#3B82F6] font-bold">
                <Server className="w-3.5 h-3.5" />
                <span>Docker: 2 Active (app:3000)</span>
              </div>
            )}
            {activePlugins.some((p) => p.id === 'plugin-sec') && (
              <div className="flex items-center gap-1.5 text-[#BB86FC] font-bold">
                <Lock className="w-3.5 h-3.5" />
                <span>RBAC Guard: ({userRole.toUpperCase()})</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Terminal Output Viewport Screen */}
      <div
        className={`flex-1 p-4 overflow-y-auto space-y-4 ${theme.terminalBg} select-text cursor-text relative`}
        onClick={() => inputRef.current?.focus()}
      >
        {activeTab.history.map((item) => (
          <div key={item.id} className="space-y-1.5 group">
            {/* Command Line Header */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#3B82F6] font-bold">
                  {userRole === 'admin' ? 'root' : 'alex'}
                </span>
                <span className="text-[#55555E]">@</span>
                <span className="text-[#E0E0E5]">
                  {activeTab.environment === 'remote-ssh' ? 'ssh-server' : 'omniterm'}
                </span>
                <span className="text-[#55555E]">:</span>
                <span className="text-[#BB86FC]">{item.cwd}</span>
                <span className="text-[#00FF41] font-bold">$</span>
                <span className="font-bold text-[#00FF41]">{item.command}</span>
              </div>

              <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity text-[10px]">
                <span
                  className={`px-1.5 py-0.2 rounded uppercase font-bold border ${
                    item.status === 'success'
                      ? 'bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]/30'
                      : item.status === 'denied'
                      ? 'bg-[#FFBD2E]/10 text-[#FFBD2E] border-[#FFBD2E]/30'
                      : 'bg-[#FF5555]/10 text-[#FF5555] border-[#FF5555]/30'
                  }`}
                >
                  {item.status}
                </span>
                <span className="text-[#55555E]">{item.executionTimeMs}ms</span>
                <span className="text-[#55555E]">{item.timestamp}</span>
                <button
                  onClick={() => copyToClipboard(item.output, item.id)}
                  className="p-1 rounded bg-[#202024] hover:bg-[#2A2A2E] text-[#88888E]"
                  title="Copy command output"
                >
                  {copiedId === item.id ? (
                    <Check className="w-3 h-3 text-[#00FF41]" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            {/* Output Box */}
            <div
              className={`p-3 rounded border leading-relaxed overflow-x-auto whitespace-pre-wrap ${
                item.status === 'denied'
                  ? 'bg-[#FFBD2E]/10 border-[#FFBD2E]/30 text-[#FFBD2E]'
                  : item.status === 'error'
                  ? 'bg-[#FF5555]/10 border-[#FF5555]/30 text-[#FF5555]'
                  : 'bg-[#161618] border-[#2A2A2E] text-[#00FF41]'
              }`}
            >
              {item.output}
            </div>

            {/* AI Error Quick Fix Button if Error / Denied */}
            {(item.status === 'error' || item.status === 'denied') && (
              <div className="pt-1">
                <button
                  onClick={() => handleAskAiFix(item)}
                  className="px-2.5 py-1 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] text-[#BB86FC] transition-all text-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#BB86FC]" />
                  <span>Ask AI Copilot to Explain & Fix Error</span>
                </button>

                {aiAnalysis?.commandId === item.id && (
                  <div className="mt-2 p-3 rounded bg-[#161618] border border-[#2A2A2E] text-[#BB86FC] text-xs space-y-1">
                    <div className="flex items-center gap-2 font-bold text-[#E0E0E5]">
                      <Sparkles className="w-4 h-4 text-[#BB86FC]" />
                      <span>Gemini AI Terminal Analysis:</span>
                    </div>
                    <p className="whitespace-pre-wrap font-mono text-[12px]">{aiAnalysis.text}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isExecuting && (
          <div className="flex items-center gap-2 text-xs text-[#00FF41] animate-pulse py-1">
            <Cpu className="w-4 h-4 animate-spin text-[#00FF41]" />
            <span>Executing shell process...</span>
          </div>
        )}

        {/* Autocomplete Suggestion Floating Bar */}
        {showSuggestions && suggestions.length > 0 && inputCommand.trim().length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded bg-[#161618] border border-[#2A2A2E] text-xs max-w-2xl select-none shadow-xl">
            <div className="flex items-center gap-1 text-[10px] text-[#55555E] uppercase font-bold px-1.5 border-r border-[#2A2A2E]">
              <Command className="w-3 h-3 text-[#00FF41]" />
              <span>Suggestions (Tab ⇥)</span>
            </div>
            {suggestions.map((s, idx) => (
              <button
                key={s}
                onClick={() => {
                  setInputCommand(s);
                  inputRef.current?.focus();
                }}
                className={`px-2 py-0.5 rounded text-[11px] transition-all flex items-center gap-1 font-mono ${
                  idx === selectedSuggestionIndex
                    ? 'bg-[#00FF41] text-black font-bold'
                    : 'bg-[#202024] text-[#E0E0E5] hover:bg-[#2A2A2E] hover:text-[#00FF41] border border-[#2A2A2E]'
                }`}
              >
                <span className="opacity-60">{inputCommand}</span>
                <span>{s.slice(inputCommand.length)}</span>
              </button>
            ))}
            <span className="text-[10px] text-[#55555E] ml-auto pr-1 hidden sm:inline">
              [Tab] to complete • [↑/↓] history
            </span>
          </div>
        )}

        {/* Inline Active Shell Prompt Line with Real-time Ghost Autocomplete */}
        <div className="flex items-center gap-2 text-xs font-bold pt-1 font-mono relative">
          <span className="text-[#3B82F6]">
            {userRole === 'admin' ? 'root' : 'alex'}
          </span>
          <span className="text-[#55555E]">@</span>
          <span className="text-[#E0E0E5]">
            {activeTab.environment === 'remote-ssh' ? 'ssh-server' : 'omniterm'}
          </span>
          <span className="text-[#55555E]">:</span>
          <span className="text-[#BB86FC]">{activeTab.cwd}</span>
          <span className="text-[#00FF41] font-bold">$</span>

          <div className="flex-1 flex items-center relative min-h-[20px]">
            {/* Native Unstyled Input */}
            <input
              ref={inputRef}
              type="text"
              value={inputCommand}
              onChange={(e) => setInputCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              className="w-full bg-transparent border-none outline-none p-0 text-xs text-[#00FF41] font-mono focus:ring-0 focus:outline-none z-10"
            />

            {/* Inline Ghost Suggestion Overlay (Fish / Zsh style) */}
            {ghostSuggestion && (
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none flex items-center text-xs font-mono select-none"
              >
                {/* Transparent spacer matching the exact text width of inputCommand */}
                <span className="opacity-0">{inputCommand}</span>
                {/* Subtle dim ghost suffix */}
                <span className="text-[#55555E] bg-[#202024]/40 px-0.5 rounded">
                  {ghostSuggestion}
                </span>
                <span className="text-[10px] text-[#44444A] ml-2 font-normal hidden md:inline">
                  [Tab ⇥ / →]
                </span>
              </div>
            )}
          </div>

          {/* Up/Down History indicator badge when cycling history */}
          {historyIndex >= 0 && (
            <div className="text-[10px] px-1.5 py-0.5 rounded bg-[#202024] border border-[#2A2A2E] text-[#3B82F6] font-mono select-none flex items-center gap-1">
              <span>history #{historyIndex + 1}</span>
            </div>
          )}
        </div>

        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};

