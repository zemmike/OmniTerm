import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level guards for the repairs in this change set.
 *
 * These assert the shape of the code rather than its runtime behaviour, because the
 * pieces involved cannot be exercised here: the clipboard bridge needs a real Electron
 * main process, the refit rule needs a laid-out terminal, and the launcher needs an
 * installed .deb. That is a real limit, and it is why each assertion names the failure
 * it prevents rather than just looking for a string.
 */
const root = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('omniterm --version from an installed package', () => {
  const main = read('electron-main.cjs');
  const postinst = read('build/deb-postinst.sh');
  const postrm = read('build/deb-postrm.sh');

  it('accepts a version flag Electron cannot swallow', () => {
    // Chromium claims --version before the app sees it, so the launcher rewrites it.
    expect(main).toContain('--omniterm-version');
    expect(main).toContain("const VERSION_FLAGS = ['--version', '-v', '--omniterm-version'];");
  });

  it('installs a launcher instead of a symlink to the Electron binary', () => {
    expect(postinst).toContain('--omniterm-version');
    expect(postinst).not.toContain('ln -sf "$APP_BIN" "$LINK"');
    expect(postinst).toContain('chmod 0755 "$LINK"');
  });

  it('forwards every other argument unchanged', () => {
    expect(postinst).toContain('exec "$APP" "$@"');
  });

  it('removes the launcher on uninstall, and knows it is not a symlink', () => {
    expect(postrm).toContain('rm -f "$LINK"');
    expect(postrm).not.toContain('if [ -L "$LINK" ]');
  });
});

describe('reader clipboard on Linux', () => {
  const preload = read('preload.cjs');
  const main = read('electron-main.cjs');
  const reader = read('src/components/AiReader.tsx');

  it('exposes and handles a clipboard bridge', () => {
    expect(preload).toContain('writeClipboard');
    expect(preload).toContain("'omniterm:clipboard-write'");
    expect(main).toContain("ipcMain.handle('omniterm:clipboard-write'");
  });

  it('validates the caller and bounds the payload', () => {
    const handler = main.slice(main.indexOf("ipcMain.handle('omniterm:clipboard-write'"));
    expect(handler.slice(0, 600)).toContain('isLocalAppUrl(event.senderFrame?.url)');
    expect(handler.slice(0, 900)).toContain('MAX_CLIPBOARD_CHARS');
  });

  it('prefers the bridge and keeps the browser clipboard as a fallback', () => {
    expect(reader.indexOf('writeClipboard')).toBeLessThan(reader.indexOf('navigator.clipboard'));
  });

  it('says so when copying fails instead of looking like it worked', () => {
    expect(reader).toContain('setCopyFailed(true)');
  });
});

describe('settings changes must not corrupt the terminal grid', () => {
  const pane = read('src/components/TerminalPane.tsx');

  it('gates every refit on the pane being visible and laid out', () => {
    expect(pane).toContain('const canFit = useCallback');
    expect(pane).toContain("document.visibilityState === 'hidden'");
    expect(pane).toContain('host.clientWidth > 40');
  });

  it('fits and repaints once when the pane comes back on screen', () => {
    expect(pane).toContain('term.refresh(0, term.rows - 1)');
  });

  it('routes the resize paths through the guard rather than fitting directly', () => {
    const observer = pane.slice(
      pane.indexOf('new ResizeObserver'),
      pane.indexOf('observer.observe'),
    );
    expect(observer).toContain('safeFit()');
    expect(observer).not.toContain('fit.fit()');
  });
});

describe('reader typography', () => {
  const reader = read('src/components/AiReader.tsx');

  it('sets prose in a readable sans stack at a comfortable measure', () => {
    // The serif experiment read worse at these sizes; sans plus a ~70ch measure is the
    // combination that survived looking at it.
    expect(reader).toContain('ui-sans-serif');
    expect(read('src/index.css')).toContain('max-width: 70ch');
    expect(reader).not.toContain('Georgia');
  });

  it('keeps code monospace', () => {
    expect(reader).toContain('font-mono');
    expect(read('src/index.css')).toContain('.reader-code code');
  });

  it('defaults to the answer only, with noise hiding as a second filter', () => {
    expect(reader).toContain('const [answerOnly, setAnswerOnly] = useState(true)');
    expect(reader).toContain('const [hideNoise, setHideNoise] = useState(true)');
    expect(reader).toContain('parseReaderText(text, { answerOnly, hideNoise })');
  });

  it('answers the colour-scheme query and announces a change', () => {
    const pane = read('src/components/TerminalPane.tsx');
    // Programs read the terminal's colours once and keep them; without this protocol a
    // session inside a multiplexer survived a theme change.
    expect(pane).toContain("registerCsiHandler({ prefix: '?', final: 'n' }");
    expect(pane).toContain('params[0] === 996');
    expect(pane).toContain('params.includes(2031)');
    expect(pane).toContain('colorSchemeReport(scheme)');
    expect(read('pty.ts')).toContain("TERM_PROGRAM: 'OmniTerm'");
  });

  it('resolves a clicked path from the pane it was clicked in', () => {
    // The path travels with the pane's working directory, and a miss there searches that
    // directory instead of reporting the file as missing.
    expect(read('src/components/TerminalView.tsx')).toContain(
      'onOpenFilePath(resolved, activeCwd)',
    );
    expect(read('src/App.tsx')).toContain('setFileTarget({ path, requestId: Date.now(), cwd })');
    const files = read('src/components/FileManagerView.tsx');
    expect(files).toContain('findByNameUnder(openTarget.cwd, basenameOf(targetPath))');
    expect(files).toContain('&path=${encodeURIComponent(openTarget.cwd)}');
  });

  it('does not show a colour legend in the Files tab', () => {
    expect(read('src/components/FileManagerView.tsx')).not.toContain('showLegend');
  });
});

describe('install documentation and packaging', () => {
  const readme = read('README.md');
  const release = read('.github/workflows/release.yml');
  const pkg = JSON.parse(read('package.json')) as { build: { win?: { artifactName?: string } } };

  it('documents a separate path for each platform', () => {
    for (const heading of ['### Linux', '### macOS', '### Windows']) {
      expect(readme).toContain(heading);
    }
    expect(readme).toContain('OmniTerm-<version>-win-x64.exe');
    expect(readme).toContain('xattr -dr com.apple.quarantine /Applications/OmniTerm.app');
  });

  it('gives every platform its own requirements and file names in the install guide', () => {
    const guide = read('docs/INSTALL.md');
    // The platform floors come from what actually runs: Electron 44 needs macOS 13, and
    // ConPTY wants Windows 10 1809.
    expect(guide).toContain('macOS 13 Ventura');
    expect(guide).toContain('1809');
    expect(guide).toContain('OmniTerm-<version>-mac-arm64.dmg');
    expect(guide).toContain('OmniTerm-<version>-mac-x64.dmg');
    expect(guide).toContain('OmniTerm-<version>-win-x64.exe');
    expect(guide).toContain('xattr -dr com.apple.quarantine /Applications/OmniTerm.app');
    // Notarisation is not in place, and the guide must say so rather than let people
    // assume a warning means a broken download.
    expect(guide).toContain('not notarised');
  });

  it('documents how to verify a download on each platform', () => {
    const guide = read('docs/INSTALL.md');
    expect(guide).toContain('shasum -a 256 -c SHA256SUMS');
    expect(guide).toContain('Get-FileHash');
    expect(guide).toContain('sha256sum -c SHA256SUMS');
  });

  it('names Windows artifacts with the platform in them', () => {
    expect(pkg.build.win?.artifactName).toContain('-win-');
  });

  it('repairs the macOS node-pty permission in the release workflow too', () => {
    expect(release).toContain('chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper');
    expect(release.indexOf('chmod +x node_modules/node-pty')).toBeLessThan(
      release.indexOf('npm run test:pty'),
    );
  });
});
