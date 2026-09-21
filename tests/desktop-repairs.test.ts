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

  it('refits for a font change and not for a colour change', () => {
    expect(pane).toContain('const fontChanged = previousFontKey.current !== fontKey');
    expect(pane).toContain('if (fontChanged) safeFit();');
    // A colour change must still repaint: without it the old palette stays on screen and
    // half the text looks blacked out.
    expect(pane).toContain('term.refresh(0, term.rows - 1);');
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
    expect(reader).toContain("maxWidth: '70ch'");
    expect(reader).not.toContain('Georgia');
  });

  it('keeps code monospace', () => {
    expect(reader).toContain('font-mono');
    expect(read('src/index.css')).toContain('.reader-code code');
  });

  it('offers the two filters, wired to the parser', () => {
    expect(reader).toContain('setLastReplyFilter');
    expect(reader).toContain('setHideNoise');
    expect(reader).toContain('parseReaderText(text, { hideNoise, lastReply: lastReplyFilter })');
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
