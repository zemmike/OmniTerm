export type PlatformName = NodeJS.Platform;

export type ShellKind = 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'plain';

export interface ShellProfile {
  id: string;
  label: string;
  executable: string;
  args: string[];
  commandArgs(command: string): string[];
  commandWindowsVerbatimArguments?: boolean;
  kind: ShellKind;
  integration: string;
  historyFiles: string[];
  env: Record<string, string>;
}
