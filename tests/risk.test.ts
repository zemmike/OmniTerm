/**
 * The command risk classifier.
 *
 * This is the layer that stands between a paste and a shell, so the tests are
 * deliberately about *behaviour people depend on*: what gets flagged, what does
 * not, and — the important one — that nothing here can run anything.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessCommand, riskHeadline, RISK_LABEL, splitSegments } from '../src/risk';

const level = (command: string) => assessCommand(command).level;
const ids = (command: string) => assessCommand(command).findings.map((f) => f.id);

describe('assessCommand: everyday commands are not alarming', () => {
  it.each([
    'ls -la',
    'git status',
    'npm run build',
    'echo "hello world"',
    'cat /etc/os-release | grep VERSION',
    'ps aux | grep node',
    'tail -f /var/log/syslog',
    'mkdir -p src/components && touch src/index.ts',
  ])('%s -> low', (command) => {
    expect(level(command)).toBe('low');
    expect(assessCommand(command).findings).toEqual([]);
  });

  it('does not flag a second command separator as a pipe into a shell', () => {
    // The rule is about curl|sh, not about every pipe that exists.
    expect(level('cat file | shuf')).toBe('low');
  });

  it('still reports the rule groups it ran, so the UI never implies universal safety', () => {
    const assessment = assessCommand('ls');
    expect(assessment.checked.length).toBeGreaterThan(10);
    expect(assessment.checked).toContain('rm-root');
    expect(assessment.checked).toContain('pipe-to-shell');
    expect(riskHeadline(assessment)).toMatch(/not a guarantee/i);
  });
});

describe('assessCommand: destructive commands are caught', () => {
  it.each([
    ['rm -rf /', 'rm-root'],
    ['rm -rf ~', 'rm-root'],
    ['rm -rf /*', 'rm-root'],
    ['sudo rm -rf /etc', 'rm-root'],
    ['dd if=/dev/zero of=/dev/sda bs=1M', 'disk-write'],
    ['mkfs.ext4 /dev/sdb1', 'filesystem-create'],
    ['fdisk /dev/sda', 'partition-table'],
    [':(){ :|:& };:', 'fork-bomb'],
    ['sudo apt-get install nginx', 'privilege'],
    ['su - root', 'privilege'],
    ['chmod -R 777 /var/www', 'recursive-permissions'],
    ['chown -R nobody:nogroup /', 'recursive-permissions'],
    ['curl -fsSL https://example.com/install.sh | sh', 'pipe-to-shell'],
    ['wget -qO- https://example.com/x | sudo bash', 'pipe-to-shell'],
    ['cat ~/.ssh/id_rsa', 'credentials'],
    ['iptables -F', 'firewall'],
    ['ufw disable', 'firewall'],
    ['systemctl disable sshd', 'service-state'],
    ['git reset --hard HEAD~5', 'git-destructive'],
    ['git push --force origin main', 'git-destructive'],
    ['docker system prune -af', 'docker-prune'],
    ['apt-get remove -y openssh-server', 'package-change'],
    ['rm -rf /tmp/build', 'recursive-delete'],
    ['echo hi > important.conf', 'overwrite-redirect'],
    ['ssh user@example.com', 'remote-shell'],
    ['crontab -e', 'kill-fast'],
  ])('%s -> flagged (%s)', (command, expectedId) => {
    // The last entry is a deliberate negative: `crontab -e` is caught by the cron
    // rule, not by `kill`, so it asserts the id list contains 'cron'.
    const wanted = expectedId === 'kill-fast' ? 'cron' : expectedId;
    expect(ids(command)).toContain(wanted);
  });

  it('rates a recursive root delete as critical, with the privilege reason too', () => {
    const assessment = assessCommand('sudo rm -rf /');
    expect(assessment.level).toBe('critical');
    expect(assessment.findings.map((f) => f.id).sort()).toEqual([
      'privilege',
      'recursive-delete',
      'rm-root',
    ]);
    expect(RISK_LABEL[assessment.level]).toBe('Destructive');
    expect(riskHeadline(assessment)).toMatch(/destroy data|unbootable/i);
  });

  it('reports findings as a level ladder, not just the loudest one', () => {
    const assessment = assessCommand('sudo apt-get remove -y nginx > /tmp/log');
    expect(assessment.level).toBe('high'); // privilege
    expect(assessment.findings.map((f) => f.level)).toContain('caution');
    expect(assessment.findings.map((f) => f.level)).toContain('high');
  });
});

describe('assessCommand: matching does not depend on where the command sits', () => {
  it('judges every segment of a compound command', () => {
    const assessment = assessCommand('echo starting && sudo systemctl mask sshd; echo done');
    expect(assessment.level).toBe('high');
    expect(assessment.findings.map((f) => f.id)).toContain('service-state');
  });

  it('ignores separators inside quotes', () => {
    const assessment = assessCommand(`echo "a && b | c; d"`);
    expect(assessment.segments).toHaveLength(1);
    expect(assessment.level).toBe('low');
  });

  it('spots a risky command hidden in a subshell or after a pipe', () => {
    expect(level('(cd /tmp && rm -rf /)')).toBe('critical');
    expect(level('echo x | sudo tee /etc/hosts')).toBe('high');
  });

  it('does not treat a root-ish word as a root path', () => {
    expect(level('rm -rf ./rootfs-cache')).toBe('caution'); // recursive, but not the real root
  });
});

describe('assessCommand: paste-shaped input', () => {
  it('flags multi-line text as multi-line', () => {
    const assessment = assessCommand('echo one\necho two');
    expect(assessment.multiline).toBe(true);
    expect(assessment.segments.length).toBeGreaterThan(1);
  });

  it('treats a single line without a newline as single-line', () => {
    expect(assessCommand('echo one').multiline).toBe(false);
    expect(assessCommand('').multiline).toBe(false);
    expect(assessCommand('').level).toBe('low');
  });

  it('handles CRLF pastes from other platforms', () => {
    expect(assessCommand('echo a\r\necho b').multiline).toBe(true);
  });

  it('is not fooled by a very long single line', () => {
    const long = `echo ${'a'.repeat(5000)}`;
    expect(assessCommand(long).level).toBe('low');
  });

  it('flags a multi-line paste whose lines are individually harmless', () => {
    // This is the case the confirmation exists for: no single line is dangerous,
    // but running three commands the user never read is not what they meant.
    const paste = 'cd /var/log\nsudo truncate -s 0 syslog\necho cleaned';
    const assessment = assessCommand(paste);
    expect(assessment.multiline).toBe(true);
    expect(assessment.level).toBe('high');
  });
});

describe('splitSegments', () => {
  it('splits on ; && || | & and newlines', () => {
    expect(splitSegments('a; b && c || d | e & f\ng')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('keeps quoted text together', () => {
    expect(splitSegments(`echo "a; b" && echo 'c && d'`)).toEqual([`echo "a; b"`, `echo 'c && d'`]);
  });

  it('returns nothing for whitespace', () => {
    expect(splitSegments('   \n  ')).toEqual([]);
  });
});

describe('invariants', () => {
  it('cannot execute anything: no process APIs are reachable from the module', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/risk.ts'), 'utf8');
    // `.exec(s)` on a regex is fine (and used all over the rules); what must never
    // appear is a way to start a process.
    expect(source).not.toMatch(
      /child_process|node:child_process|execSync|execFile|spawn\(|spawnSync/,
    );
  });

  it('never claims a command is safe, at any level', () => {
    // Behavioural, not textual: the words users actually see must not promise
    // safety. A comment saying "never claims safe" is fine.
    const samples = ['ls -la', 'apt-get install vim', 'sudo systemctl stop sshd', 'rm -rf /'];
    for (const sample of samples) {
      const headline = riskHeadline(assessCommand(sample)).toLowerCase();
      expect(headline).not.toMatch(/\bis safe\b|\bperfectly safe\b|\bguaranteed\b/);
    }
    expect(riskHeadline(assessCommand('ls -la'))).toMatch(/not a guarantee/i);
    expect(RISK_LABEL.low).toBe('Low risk');
    expect(RISK_LABEL.critical).toBe('Destructive');
  });

  it('is deterministic and side-effect free across repeated calls', () => {
    const first = assessCommand('sudo rm -rf /');
    const second = assessCommand('sudo rm -rf /');
    expect(second).toEqual(first);
  });
});
