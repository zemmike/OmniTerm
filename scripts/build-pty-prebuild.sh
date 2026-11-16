#!/usr/bin/env bash
# Rebuild vendor/pty/linux-x64/pty.node inside an old-glibc container.
#
# node-pty is a native addon: compiling it on the build host embeds that host's glibc
# symbol versions, so a binary built on Ubuntu 26.04 needs GLIBC_2.42 and will not load
# on Pop!_OS, Debian stable or anything else older. node-pty's own error message hides
# this ("Cannot find module ... pty.node"), which is how the broken 1.18.8 release
# shipped.
#
# node-pty 1.1.x is N-API (node-addon-api), so a binding built against Node 20 in
# Debian bullseye (glibc 2.31) loads unchanged in Electron 44. Commit the output.
#
# Usage: scripts/build-pty-prebuild.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/vendor/pty/linux-x64"
mkdir -p "$out"

docker run --rm -v "$out":/out node:20-bullseye bash -lc '
  set -e
  apt-get update -qq
  apt-get install -y -qq python3 make g++ >/dev/null
  mkdir -p /w && cd /w
  npm init -y >/dev/null
  npm i node-pty@1.1.0 --build-from-source --no-audit --no-fund >/dev/null
  cp node_modules/node-pty/build/Release/pty.node /out/pty.node
'

echo "wrote $out/pty.node"
objdump -T "$out/pty.node" | grep -o "GLIBC_[0-9.]*" | sort -Vu | tail -1
