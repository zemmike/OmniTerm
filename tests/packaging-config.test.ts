import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('native packaging configuration', () => {
  const pkg = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
    build: Record<string, unknown>;
  };

  it('defines native macOS and Windows package targets', () => {
    expect(pkg.scripts['dist:mac']).toContain('electron-builder --mac');
    expect(pkg.scripts['dist:win']).toContain('electron-builder --win');
    expect(pkg.scripts['test:pty:windows']).toBe('node scripts/pty-smoke-windows.cjs');
    expect(pkg.build).toMatchObject({
      mac: {
        target: [
          { target: 'dmg', arch: ['x64', 'arm64'] },
          { target: 'zip', arch: ['x64', 'arm64'] },
        ],
      },
      win: {
        target: [
          { target: 'nsis', arch: ['x64'] },
          { target: 'zip', arch: ['x64'] },
        ],
      },
    });
  });

  it('builds and smoke-tests each operating system natively', () => {
    const workflow = read('.github/workflows/build.yml');

    expect(workflow).toContain('ubuntu-latest');
    expect(workflow).toContain('macos-14');
    expect(workflow).toContain('windows-2025');
    expect(workflow).toContain('npm run test:pty:windows');
    expect(workflow).toContain('Verify macOS package');
    expect(workflow).toContain('Verify Windows installer');
    expect(workflow).toContain('Verify Linux package');
  });

  it('repairs the macOS node-pty helper permission before the smoke test', () => {
    const workflow = read('.github/workflows/build.yml');

    expect(workflow).toContain('chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper');
    expect(workflow.indexOf('chmod +x node_modules/node-pty')).toBeLessThan(
      workflow.indexOf('npm run test:pty'),
    );
  });

  it('verifies Windows package metadata without capturing GUI stdout', () => {
    const workflow = read('.github/workflows/build.yml');

    expect(workflow).toContain('$metadata = (Get-Item $app).VersionInfo');
    expect(workflow).toContain(
      '$expectedVersion = (Get-Content package.json | ConvertFrom-Json).version',
    );
    expect(workflow).toContain("$metadata.ProductName -ne 'OmniTerm'");
    expect(workflow).toContain('$metadata.ProductVersion -notlike "$expectedVersion*"');
    expect(workflow).not.toContain('$version = & $app --version');
  });

  it('publishes native release artifacts through one checksum job', () => {
    const workflow = read('.github/workflows/release.yml');

    expect(workflow).toContain('ubuntu-latest');
    expect(workflow).toContain('macos-14');
    expect(workflow).toContain('windows-2025');
    expect(workflow).toContain('actions/download-artifact@');
    expect(workflow).toContain('SHA256SUMS');
    expect(workflow).toContain('needs: release');
  });
});
