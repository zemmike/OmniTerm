export interface TerminalThemeConfig {
  name: string;
  id: string;
  bg: string;
  terminalBg: string;
  text: string;
  promptUser: string;
  promptHost: string;
  promptPath: string;
  accent: string;
  border: string;
  badgeBg: string;
}

export const TERMINAL_THEMES: Record<string, TerminalThemeConfig> = {
  matrix: {
    name: 'OmniTerm Polish (Green)',
    id: 'matrix',
    bg: 'bg-[#0F0F10]',
    terminalBg: 'bg-[#0A0A0B]',
    text: 'text-[#00FF41]',
    promptUser: 'text-[#3B82F6]',
    promptHost: 'text-[#E0E0E5]',
    promptPath: 'text-[#BB86FC]',
    accent: 'emerald',
    border: 'border-[#2A2A2E]',
    badgeBg: 'bg-[#161618] text-[#00FF41] border-[#2A2A2E]',
  },
  slate: {
    name: 'Sleek Dark Slate',
    id: 'slate',
    bg: 'bg-[#0F0F10]',
    terminalBg: 'bg-[#161618]',
    text: 'text-[#E0E0E5]',
    promptUser: 'text-[#3B82F6]',
    promptHost: 'text-[#88888E]',
    promptPath: 'text-[#3B82F6]',
    accent: 'sky',
    border: 'border-[#2A2A2E]',
    badgeBg: 'bg-[#202024] text-[#E0E0E5] border-[#2A2A2E]',
  },
  dracula: {
    name: 'Dracula Purple',
    id: 'dracula',
    bg: 'bg-[#12111A]',
    terminalBg: 'bg-[#181825]',
    text: 'text-[#cdd6f4]',
    promptUser: 'text-[#cba6f7]',
    promptHost: 'text-[#f5c2e7]',
    promptPath: 'text-[#89b4fa]',
    accent: 'purple',
    border: 'border-[#2A2A2E]',
    badgeBg: 'bg-[#202024] text-[#BB86FC] border-[#2A2A2E]',
  },
  cyberpunk: {
    name: 'Cyberpunk Neon',
    id: 'cyberpunk',
    bg: 'bg-[#0F0F10]',
    terminalBg: 'bg-[#161618]',
    text: 'text-cyan-300',
    promptUser: 'text-pink-500',
    promptHost: 'text-yellow-400',
    promptPath: 'text-cyan-400',
    accent: 'pink',
    border: 'border-[#2A2A2E]',
    badgeBg: 'bg-[#202024] text-pink-300 border-[#2A2A2E]',
  },
  retro: {
    name: 'Retro Amber Monitor',
    id: 'retro',
    bg: 'bg-[#0F0F10]',
    terminalBg: 'bg-[#0A0A0B]',
    text: 'text-amber-400',
    promptUser: 'text-amber-500',
    promptHost: 'text-yellow-500',
    promptPath: 'text-amber-300',
    accent: 'amber',
    border: 'border-[#2A2A2E]',
    badgeBg: 'bg-[#202024] text-amber-400 border-[#2A2A2E]',
  },
};

