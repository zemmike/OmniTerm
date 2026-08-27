import React, { useState } from 'react';
import {
  Bot,
  Sparkles,
  Terminal,
  Send,
  Code2,
  Copy,
  Check,
  FileCode,
  Zap,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';

interface AiCliSuiteViewProps {
  onSendToTerminal: (command: string) => void;
}

export const AiCliSuiteView: React.FC<AiCliSuiteViewProps> = ({ onSendToTerminal }) => {
  const [aiMode, setAiMode] = useState<'claude-coder' | 'gemini-cli' | 'cursor-agent'>('claude-coder');
  const [action, setAction] = useState<'suggest_command' | 'generate_script' | 'explain_command' | 'debug_error'>('generate_script');
  const [prompt, setPrompt] = useState('Write a bash script to monitor high CPU processes and auto-restart Node services if usage exceeds 90%');
  const [isLoading, setIsLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const handleQueryAi = async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setAiResult(null);

    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          prompt,
          mode: aiMode,
        }),
      });

      const data = await res.json();
      setAiResult(data.result);
      setAiSource(data.source);
    } catch (err: any) {
      setAiResult(`[Error]: Failed to communicate with AI Copilot service: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (aiResult) {
      navigator.clipboard.writeText(aiResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Sample Preset Prompts
  const presetPrompts = [
    {
      label: '🚀 Auto-Deploy Script',
      prompt: 'Write a deploy script that pulls git main, installs npm packages, runs unit tests, and restarts Express backend on port 3000',
      act: 'generate_script',
    },
    {
      label: '🔍 Find Large Files (>100MB)',
      prompt: 'Command to find all files larger than 100MB in /var and sort by size descending',
      act: 'suggest_command',
    },
    {
      label: '📦 Docker Backup Pipeline',
      prompt: 'Write a python script to dump all Docker container logs and compress into a .tar.gz archive with timestamp',
      act: 'generate_script',
    },
    {
      label: '🛡️ Check Open Ports & Firewall',
      prompt: 'Command to list all open listening ports and active TCP connections with process names',
      act: 'suggest_command',
    },
  ];

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-6">
      {/* Title Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2A2E] pb-4">
        <div>
          <h1 className="text-lg font-bold text-[#E0E0E5] flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#BB86FC]" />
            <span>AI CLI SUITE (CLAUDE CODER & GEMINI TERMINAL COPILOT)</span>
          </h1>
          <p className="text-xs text-[#88888E]">
            Generate custom shell scripts, convert natural language into pipe chains, and debug terminal errors in real time.
          </p>
        </div>

        {/* AI Engine Switcher */}
        <div className="flex items-center gap-1 bg-[#161618] border border-[#2A2A2E] p-1 rounded text-xs">
          <button
            onClick={() => setAiMode('claude-coder')}
            className={`px-3 py-1 rounded font-bold uppercase transition-colors ${
              aiMode === 'claude-coder'
                ? 'bg-[#BB86FC] text-black'
                : 'text-[#88888E] hover:text-[#E0E0E5]'
            }`}
          >
            Claude Coder
          </button>
          <button
            onClick={() => setAiMode('gemini-cli')}
            className={`px-3 py-1 rounded font-bold uppercase transition-colors ${
              aiMode === 'gemini-cli'
                ? 'bg-[#00FF41] text-black'
                : 'text-[#88888E] hover:text-[#E0E0E5]'
            }`}
          >
            Gemini CLI
          </button>
          <button
            onClick={() => setAiMode('cursor-agent')}
            className={`px-3 py-1 rounded font-bold uppercase transition-colors ${
              aiMode === 'cursor-agent'
                ? 'bg-[#3B82F6] text-black'
                : 'text-[#88888E] hover:text-[#E0E0E5]'
            }`}
          >
            Cursor Agent
          </button>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#55555E] font-bold uppercase">Quick Prompts:</span>
        {presetPrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => {
              setPrompt(p.prompt);
              setAction(p.act as any);
            }}
            className="px-2.5 py-1 rounded bg-[#161618] hover:bg-[#202024] border border-[#2A2A2E] text-xs text-[#E0E0E5] hover:text-[#BB86FC] transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Action Selector & Prompt Input Form */}
      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'generate_script', label: 'Generate Script', icon: FileCode },
            { id: 'suggest_command', label: 'Suggest Command', icon: Zap },
            { id: 'explain_command', label: 'Explain Command', icon: HelpCircle },
            { id: 'debug_error', label: 'Debug Log Error', icon: AlertTriangle },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = action === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setAction(item.id as any)}
                className={`p-2.5 rounded border text-xs font-bold uppercase flex items-center justify-center gap-2 transition-all ${
                  isSelected
                    ? 'bg-[#202024] border-[#00FF41] text-[#00FF41]'
                    : 'bg-[#0A0A0B] border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#E0E0E5] uppercase">
            Prompt / Intent Description:
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Describe what shell script or terminal command you want the AI to create..."
            className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded p-3 text-xs text-[#00FF41] font-mono focus:outline-none focus:border-[#00FF41]"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleQueryAi}
            disabled={isLoading || !prompt.trim()}
            className="px-4 py-2 rounded bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase text-xs flex items-center gap-2 transition-colors"
          >
            {isLoading ? (
              <Sparkles className="w-4 h-4 animate-spin text-black" />
            ) : (
              <Send className="w-4 h-4 text-black" />
            )}
            <span>{isLoading ? 'Generating with AI...' : 'Generate CLI Command / Script'}</span>
          </button>
        </div>
      </div>

      {/* Generated AI Result Output */}
      {aiResult && (
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
            <div className="flex items-center gap-2 font-bold text-xs text-[#BB86FC]">
              <Sparkles className="w-4 h-4 text-[#BB86FC]" />
              <span>
                GENERATED OUTPUT ({aiMode.toUpperCase()} via {aiSource})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] text-xs text-[#E0E0E5] flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#00FF41]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={() => onSendToTerminal(aiResult)}
                className="px-3 py-1 rounded bg-[#00FF41] hover:bg-[#00D035] text-black font-bold uppercase text-xs flex items-center gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Send to Active Terminal Tab</span>
              </button>
            </div>
          </div>

          <pre className="p-4 rounded bg-[#0A0A0B] border border-[#2A2A2E] text-[#00FF41] font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {aiResult}
          </pre>
        </div>
      )}
    </div>
  );
};
