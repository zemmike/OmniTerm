/**
 * Command risk assessment.
 *
 * This module looks at a command *as text* and reports which known-dangerous
 * patterns it contains. It never runs anything, never touches the network, and
 * never claims a command is safe: the honest output is "these rule groups were
 * checked, and the worst thing found was X". Everything it returns is meant to be
 * shown to the user before they run something destructive.
 *
 * Two deliberate design choices:
 *
 *  - `checked` lists the rule groups that actually ran, so the UI can say
 *    "checked 20 patterns" instead of implying universal safety.
 *  - Findings accumulate: `sudo rm -rf /` is reported as `critical` (because of
 *    the recursive root delete) *and* carries the `sudo` finding, so the user
 *    sees both reasons rather than just the loudest one.
 */

export type RiskLevel = 'low' | 'caution' | 'high' | 'critical';

export interface RiskFinding {
  /** Stable id, safe to use as a React key or in a test assertion. */
  id: string;
  level: RiskLevel;
  /** One line, user-facing, no jargon. */
  reason: string;
  /** The text that matched, so the user can see exactly what was flagged. */
  match: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  findings: RiskFinding[];
  /** Human-readable list of the rule groups that were evaluated. */
  checked: string[];
  /** The command split into shell segments (what the rules are matched against). */
  segments: string[];
  /** True when the text spans more than one line — relevant for pastes. */
  multiline: boolean;
}

const LEVEL_ORDER: Record<RiskLevel, number> = { low: 0, caution: 1, high: 2, critical: 3 };

/**
 * Splits a command into the segments a shell would run separately. This is a
 * heuristic, not a parser: it exists so `echo hi && sudo rm -rf /` is judged on
 * both halves. Quoted strings keep their content together, and separators inside
 * quotes do not split.
 */
export function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote && command[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    // Command separators: ; newline && || | & and subshell closers.
    if (ch === ';' || ch === '\n' || ch === '&' || ch === '|') {
      segments.push(current);
      current = '';
      // Collapse the second character of && and ||
      if (command[i + 1] === ch) i += 1;
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

interface Rule {
  id: string;
  level: RiskLevel;
  reason: string;
  /** Returns the matched text, or null when the rule does not apply. */
  match: (segment: string) => string | null;
}

/** `rm` with a flag that makes it recursive/forced. */
function rmTargetsEverything(segment: string): string | null {
  const rm = segment.match(/\brm\s+([^\s;|&]+(\s+[^\s;|&]+)*)/);
  if (!rm) return null;
  const args = rm[1];
  if (!/-[a-zA-Z]*[rf]/i.test(args)) return null; // not recursive/forced: not critical
  const targets = args
    .split(/\s+/)
    .filter((token) => !token.startsWith('-'))
    // Strip quotes *and* shell punctuation, so `rm -rf /)` and `rm -rf "/"` are
    // seen for what they are.
    .map((token) => token.replace(/["'`(){}]/g, ''));
  const dangerous = targets.find(
    (target) =>
      target === '/' ||
      target === '/*' ||
      target === '*' ||
      target === '~' ||
      target === '~/*' ||
      target === '$HOME' ||
      target === '/home' ||
      target === '/etc' ||
      target === '/usr' ||
      target === '/var' ||
      /^\/\*?$/.test(target) ||
      /^~\/?\*?$/.test(target),
  );
  return dangerous ? rm[0] : null;
}

const RULES: Rule[] = [
  /* ---------------------------------------------------------------- critical */
  {
    id: 'rm-root',
    level: 'critical',
    reason: 'Recursive delete of a system or home directory.',
    match: rmTargetsEverything,
  },
  {
    id: 'disk-write',
    level: 'critical',
    reason: 'Writes raw data straight onto a block device — this destroys it.',
    match: (s) =>
      /\bdd\b[^;|&]*\bof=\/dev\/(sd|nvme|vd|hd|mmcblk|disk)/i.exec(s)?.[0] ??
      /(^|\s)>\s*\/dev\/(sd|nvme|vd|hd)[a-z0-9]*/i.exec(s)?.[0] ??
      null,
  },
  {
    id: 'filesystem-create',
    level: 'critical',
    reason: 'Formats a filesystem — every byte on the device is lost.',
    match: (s) => /\b(mkfs(\.[a-z0-9]+)?|mke2fs)\b[^;|&]*/i.exec(s)?.[0] ?? null,
  },
  {
    id: 'partition-table',
    level: 'critical',
    reason: 'Rewrites a partition table.',
    match: (s) => /\b(fdisk|sfdisk|sgdisk|parted|gdisk)\b[^;|&]*/i.exec(s)?.[0] ?? null,
  },

  /* -------------------------------------------------------------------- high */
  {
    id: 'privilege',
    level: 'high',
    reason: 'Runs with elevated privileges.',
    match: (s) => /(^|[\s;&|])(sudo|doas|pkexec|su)\s+/.exec(s)?.[0].trim() ?? null,
  },
  {
    id: 'recursive-permissions',
    level: 'high',
    reason: 'Changes ownership or permissions recursively — easy to make a system unusable.',
    match: (s) =>
      /\b(chmod|chown|chgrp)\b[^;|&]*\s-[a-zA-Z]*R[a-zA-Z]*\b[^;|&]*/i.exec(s)?.[0] ?? null,
  },
  {
    id: 'credentials',
    level: 'high',
    reason: 'Reads private keys or stored credentials — check what happens to that output.',
    match: (s) =>
      /(\.ssh\/(id_[a-z0-9]+|authorized_keys|config)|\.aws\/credentials|\.netrc|\.gnupg|\.config\/gh\/hosts|\.docker\/config\.json)/.exec(
        s,
      )?.[0] ??
      /\/etc\/(shadow|sudoers)\b/.exec(s)?.[0] ??
      null,
  },
  {
    id: 'firewall',
    level: 'high',
    reason: 'Changes the firewall — you can lock yourself out of your own machine.',
    match: (s) => /\b(iptables|ip6tables|nft|ufw|firewall-cmd)\b[^;|&]*/i.exec(s)?.[0] ?? null,
  },
  {
    id: 'service-state',
    level: 'high',
    reason: 'Enables, disables or masks a system service.',
    match: (s) =>
      /\bsystemctl\s+(enable|disable|mask|unmask|stop|restart)\b[^;|&]*/i.exec(s)?.[0] ?? null,
  },
  {
    id: 'git-destructive',
    level: 'high',
    reason: 'Discards local work or overwrites remote history.',
    match: (s) =>
      /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f[a-z]*d|push\s+[^;|&]*--force(-with-lease)?)\b[^;|&]*/i.exec(
        s,
      )?.[0] ?? null,
  },
  {
    id: 'docker-prune',
    level: 'high',
    reason: 'Removes Docker volumes or images — containers can lose their data.',
    match: (s) =>
      /\bdocker\s+(system\s+prune|volume\s+(prune|rm)|rmi\s+-f)\b[^;|&]*/i.exec(s)?.[0] ?? null,
  },

  /* ----------------------------------------------------------------- caution */
  {
    id: 'package-change',
    level: 'caution',
    reason: 'Installs or removes packages.',
    match: (s) =>
      /\b(apt|apt-get|aptitude|dnf|yum|zypper|pacman)\s+(install|remove|purge|autoremove|upgrade|dist-upgrade)\b[^;|&]*/i.exec(
        s,
      )?.[0] ??
      /\b(pip|pip3|npm|yarn|pnpm)\s+(install|uninstall|add|remove)\b[^;|&]*/i.exec(s)?.[0] ??
      null,
  },
  {
    id: 'recursive-delete',
    level: 'caution',
    reason: 'Recursive delete: those files do not go to a trash bin.',
    match: (s) =>
      /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*[rR][a-zA-Z]*)\b[^;|&]*/.exec(
        s,
      )?.[0] ?? null,
  },
  {
    id: 'overwrite-redirect',
    level: 'caution',
    reason: 'Redirects into a file with `>`, which overwrites it (use `>>` to append).',
    match: (s) => /[^>|]>(?!>)\s*[^\s;|&]+/.exec(s)?.[0] ?? null,
  },
  {
    id: 'remote-shell',
    level: 'caution',
    reason: 'Opens a connection to another machine.',
    match: (s) => /\b(ssh|scp|sftp|rsync)\b\s+[^;|&]*/i.exec(s)?.[0] ?? null,
  },
  {
    id: 'kill',
    level: 'caution',
    reason: 'Kills processes by signal.',
    match: (s) => /\b(kill|pkill|killall)\b\s+-?[0-9a-z]*\s*[^;|&]*/i.exec(s)?.[0] ?? null,
  },
  {
    id: 'cron',
    level: 'caution',
    reason: 'Edits scheduled jobs — this change outlives the session.',
    match: (s) => /\bcrontab\b[^;|&]*/i.exec(s)?.[0] ?? null,
  },
  {
    id: 'container-control',
    level: 'caution',
    reason: 'Changes what containers are running.',
    match: (s) =>
      /\bdocker\s+(rm|rmi|stop|kill|compose\s+(down|up|restart))\b[^;|&]*/i.exec(s)?.[0] ?? null,
  },
];

/**
 * Rules that must see the *whole* command. A fork bomb is built out of the very
 * separators that split segments (`:(){ :|:& };:`), so per-segment matching can
 * never see it.
 */
const WHOLE_INPUT_RULES: Rule[] = [
  {
    id: 'fork-bomb',
    level: 'critical',
    reason: 'Fork bomb: spawns processes until the machine locks up.',
    match: (text) =>
      /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/.test(text) ? ':(){ :|:& };:' : null,
  },
  {
    id: 'pipe-to-shell',
    level: 'high',
    reason: 'Pipes downloaded content straight into a shell — you never see what you run.',
    // Also whole-input: the pipeline character is what tells us the download is
    // being executed, and segment splitting removes exactly that character.
    match: (text) =>
      /\b(curl|wget|fetch)\b[^;|&|]*\|[^;|&|]*(sudo\s+)?(ba|z|d|k)?sh\b/i.exec(text)?.[0] ??
      /\b(curl|wget)\b[^;|&]*\|[^;|&]*(env|tee)\b[^;|&]*\|[^;|&]*(sudo\s+)?(ba)?sh\b/i.exec(
        text,
      )?.[0] ??
      null,
  },
];

const CHECKED_GROUPS = [...RULES, ...WHOLE_INPUT_RULES].map((rule) => rule.id);

export function assessCommand(command: string): RiskAssessment {
  const text = String(command ?? '');
  const segments = splitSegments(text);
  const findings: RiskFinding[] = [];

  for (const rule of WHOLE_INPUT_RULES) {
    const match = rule.match(text);
    if (match) {
      findings.push({ id: rule.id, level: rule.level, reason: rule.reason, match: match.trim() });
    }
  }

  for (const segment of segments) {
    for (const rule of RULES) {
      const match = rule.match(segment);
      if (match) {
        findings.push({ id: rule.id, level: rule.level, reason: rule.reason, match: match.trim() });
      }
    }
  }

  const level = findings.reduce<RiskLevel>(
    (worst, finding) => (LEVEL_ORDER[finding.level] > LEVEL_ORDER[worst] ? finding.level : worst),
    'low',
  );

  return {
    level,
    findings,
    checked: CHECKED_GROUPS,
    segments,
    multiline: /\r?\n/.test(text),
  };
}

/** Short, specific wording. Never says "safe" — it says what was and was not found. */
export function riskHeadline(assessment: RiskAssessment): string {
  switch (assessment.level) {
    case 'critical':
      return 'This can destroy data or make the system unbootable. Read it line by line before running.';
    case 'high':
      return 'This runs with elevated privileges or writes outside this folder. If you did not intend that, cancel.';
    case 'caution':
      return 'This changes system state. Nothing here is reversible with a single keystroke — review before running.';
    default:
      return 'No known risk pattern matched. That is not a guarantee.';
  }
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low risk',
  caution: 'Caution',
  high: 'High risk',
  critical: 'Destructive',
};
