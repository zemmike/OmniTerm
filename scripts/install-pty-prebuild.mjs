// Installs the prebuilt node-pty binary for this platform into node_modules, so the
// packaged app links against an old glibc instead of whatever the build machine has.
//
// Why this exists: compiling node-pty on the build host embeds the host's glibc
// symbol versions. A binary built on Ubuntu 26.04 needs GLIBC_2.42 and refuses to
// load on Pop!_OS (2.35) or Debian stable — node-pty reports it as the misleading
// "Cannot find module './prebuilds/linux-x64//pty.node'". The prebuild in
// vendor/pty/ is compiled in node:20-bullseye (glibc 2.31) and is N-API, so the same
// file loads in Node 20 and Electron 44 alike.
//
// Regenerate with scripts/build-pty-prebuild.sh. No-op on other platforms and
// architectures: only linux-x64 is vendored today.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const platform = `${process.platform}-${process.arch}`;
const prebuilt = join(root, 'vendor', 'pty', platform, 'pty.node');

if (!existsSync(prebuilt)) {
  console.log(`[native:pty] no vendored binary for ${platform}, leaving node-pty as installed`);
  process.exit(0);
}

const ptyDir = join(root, 'node_modules', 'node-pty');
if (!existsSync(ptyDir)) {
  console.log('[native:pty] node-pty is not installed, run npm ci first');
  process.exit(1);
}

// build/Release is what node-pty tries first; prebuilds/<platform>-<arch> is the
// fallback path it reports when everything fails, so both are filled.
const targets = [
  join(ptyDir, 'build', 'Release', 'pty.node'),
  join(ptyDir, 'prebuilds', platform, 'pty.node'),
];

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(prebuilt, target);
  console.log(`[native:pty] installed ${target}`);
}
