#!/bin/sh
# OmniTerm .deb post-install hook.
#  1. exposes `omniterm` on PATH (/usr/bin/omniterm -> /opt/OmniTerm/omniterm)
#  2. refreshes the desktop database + icon cache so the launcher appears in the
#     GNOME/KDE application grid immediately, without a re-login.
set -e

APP_BIN="/opt/OmniTerm/omniterm"
LINK="/usr/bin/omniterm"

if [ -x "$APP_BIN" ] && [ ! -e "$LINK" ]; then
  ln -sf "$APP_BIN" "$LINK"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

exit 0
