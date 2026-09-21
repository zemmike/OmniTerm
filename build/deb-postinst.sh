#!/bin/sh
# OmniTerm .deb post-install hook.
#  1. exposes `omniterm` on PATH (/usr/bin/omniterm -> /opt/OmniTerm/omniterm)
#  2. refreshes the desktop database + icon cache so the launcher appears in the
#     GNOME/KDE application grid immediately, without a re-login.
set -e

APP_BIN="/opt/OmniTerm/omniterm"
LINK="/usr/bin/omniterm"

# A launcher script, not a symlink. Electron claims --version/-v for itself, so
# `omniterm --version` used to print the Electron version: the flags are rewritten to
# OmniTerm's own, and every other argument is forwarded untouched.
if [ -x "$APP_BIN" ]; then
  rm -f "$LINK"
  cat > "$LINK" <<'LAUNCHER'
#!/bin/sh
# OmniTerm launcher, installed by the package post-install script.
APP=/opt/OmniTerm/omniterm
for arg in "$@"; do
  case "$arg" in
    --version|-v)
      exec "$APP" --omniterm-version
      ;;
  esac
done
exec "$APP" "$@"
LAUNCHER
  chmod 0755 "$LINK"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

exit 0
