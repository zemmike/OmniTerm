#!/usr/bin/env bash
# ==============================================================================
# OmniTerm installer for Ubuntu / Debian / Linux Mint / Pop!_OS
#
# Downloads the newest OmniTerm .deb from GitHub Releases and installs it with
# apt, so every system dependency is resolved automatically.
#
#   curl -fsSL https://raw.githubusercontent.com/zemmike/OmniTerm/main/install-linux.sh | bash
#
# Prefer to keep the package around?  Download the .deb from
# https://github.com/zemmike/OmniTerm/releases and run:
#   sudo apt install ./OmniTerm-x.y.z-x64.deb
# ==============================================================================
set -euo pipefail

REPO="zemmike/OmniTerm"
APP="OmniTerm"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${BLUE}==>${NC} $*"; }
ok()    { echo -e "${GREEN} ✓${NC} $*"; }
warn()  { echo -e "${YELLOW} !${NC} $*"; }
die()   { echo -e "${RED} ✗${NC} $*" >&2; exit 1; }

[ "$(uname -s)" = "Linux" ] || die "This installer is for Linux only."

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) DEB_ARCH="amd64" ;;
  aarch64|arm64) DEB_ARCH="arm64" ;;
  *) die "Unsupported CPU architecture: $ARCH" ;;
esac

command -v apt >/dev/null 2>&1 || die "No 'apt' found. Use the AppImage or tarball from the releases page instead."

info "Looking up the latest ${APP} release for linux/${DEB_ARCH}…"

if command -v curl >/dev/null 2>&1; then
  FETCH="curl -fsSL"
elif command -v wget >/dev/null 2>&1; then
  FETCH="wget -qO-"
else
  die "Neither curl nor wget is installed."
fi

RELEASES_JSON="$($FETCH "https://api.github.com/repos/${REPO}/releases")"
DEB_URL="$(printf '%s' "$RELEASES_JSON" \
  | grep -o "https://[^\"]*\.deb" \
  | grep -- "-${DEB_ARCH}\.deb" \
  | head -1 || true)"

if [ -z "$DEB_URL" ]; then
  warn "No published .deb found for ${DEB_ARCH} yet."
  echo "    Build it yourself in three commands:"
  echo "      git clone https://github.com/${REPO}.git omniterm && cd omniterm"
  echo "      npm install && npm run build"
  echo "      npx electron-builder --linux deb --${DEB_ARCH}"
  exit 1
fi

TMP_DEB="$(mktemp -d)/$(basename "$DEB_URL")"
info "Downloading $(basename "$DEB_URL")…"
$FETCH "$DEB_URL" > "$TMP_DEB"
ok "Downloaded $(du -h "$TMP_DEB" | cut -f1)"

info "Installing with apt (sudo required)…"
sudo apt-get install -y "$TMP_DEB" || sudo apt-get install -f -y
rm -f "$TMP_DEB"

echo
ok "${APP} is installed."
echo "   Start it from your application menu, or run:  omniterm"
echo "   Uninstall with:  sudo apt remove omniterm"
