#!/bin/sh
# OmniTerm .deb removal hook: drop the PATH symlink created at install time.
set -e

LINK="/usr/bin/omniterm"

# On upgrade ($1 = upgrade) keep the link; on remove/purge drop it.
case "$1" in
  remove|purge)
    if [ -L "$LINK" ]; then
      rm -f "$LINK"
    fi
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database -q /usr/share/applications || true
    fi
    ;;
esac

exit 0
