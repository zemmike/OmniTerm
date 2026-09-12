#!/usr/bin/env bash
# ==============================================================================
# OmniTerm released-artifact end-to-end test.
#
# Proves that the .deb we actually *published* works on a clean machine, rather
# than that the tree in the working directory does:
#
#   1. resolve the latest GitHub Release through the API,
#   2. download the amd64 .deb and SHA256SUMS,
#   3. verify the checksum with `sha256sum -c`,
#   4. install it with apt (resolving dependencies if apt needs a second pass),
#   5. validate the desktop entry with `desktop-file-validate`,
#   6. launch the app headlessly (Xvfb + openbox) and exercise its local API,
#   7. uninstall it and assert it left nothing behind.
#
# Needs: bash, curl, python3, gh (for the release API), sudo, apt, xvfb, openbox.
# Run it locally exactly as CI does:
#   GH_TOKEN=<token> OMNITERM_E2E_DIR=/tmp/omniterm-e2e bash scripts/artifact-e2e.sh
#
# Environment:
#   OMNITERM_REPO      owner/name of the repository  (default zemmike/OmniTerm)
#   OMNITERM_DEB_ARCH  deb architecture to test      (default amd64)
#   OMNITERM_E2E_DIR   scratch dir, kept for logs    (default: mktemp -d)
#   OMNITERM_TOKEN     token the app must present on /api (default: generated)
# ==============================================================================
set -euo pipefail

REPO="${OMNITERM_REPO:-zemmike/OmniTerm}"
DEB_ARCH="${OMNITERM_DEB_ARCH:-amd64}"
E2E_DIR="${OMNITERM_E2E_DIR:-$(mktemp -d)}"
# The app generates its own token when OMNITERM_TOKEN is unset, which would mean
# scraping a random value out of the log. Export one instead so the test can
# authenticate deterministically.
E2E_TOKEN="${OMNITERM_TOKEN:-omniterm-e2e-$RANDOM$RANDOM}"
export OMNITERM_TOKEN="$E2E_TOKEN"
export OMNITERM_DATA_DIR="$E2E_DIR/data"
export OMNITERM_HOST="127.0.0.1"

APP_LOG="$E2E_DIR/omniterm-app.log"
DL_DIR="$E2E_DIR/download"
LAUNCHER_PID=""

mkdir -p "$DL_DIR" "$OMNITERM_DATA_DIR"

say() { printf '\n==> %s\n' "$*"; }
ok() { printf ' ✓ %s\n' "$*"; }
fail() {
  printf '\n::error::%s\n' "$*" >&2
  printf 'x FAILED: %s\n' "$*" >&2
  exit 1
}

# Uninstall and reap the app no matter how this exits, so a failed run cannot
# poison the (single-use, but still) runner or leave a package half-installed.
cleanup() {
  local rc=$?
  if [ -n "$LAUNCHER_PID" ]; then
    kill -TERM -- "-$LAUNCHER_PID" 2>/dev/null || true
    sleep 1
    kill -KILL -- "-$LAUNCHER_PID" 2>/dev/null || true
  fi
  pkill -f '/opt/OmniTerm/' 2>/dev/null || true
  if dpkg -s omniterm >/dev/null 2>&1; then
    sudo apt-get remove -y omniterm >/dev/null 2>&1 || true
  fi
  return $rc
}
trap cleanup EXIT

# ---------------------------------------------------------------- 1. release
say "Resolving the latest release of $REPO"
command -v gh >/dev/null 2>&1 || fail "gh is not installed (needed for the release API)."
TAG="$(gh api "repos/$REPO/releases/latest" --jq '.tag_name' 2>/dev/null || true)"
[ -n "$TAG" ] && [ "$TAG" != "null" ] || fail "No published release found for $REPO."
DEB_NAME="$(gh api "repos/$REPO/releases/latest" \
  --jq ".assets[].name | select(test(\"-$DEB_ARCH\\\\.deb\$\"))" | head -1)"
[ -n "$DEB_NAME" ] || fail "Release $TAG has no -$DEB_ARCH.deb asset."
ok "latest release $TAG -> $DEB_NAME"

# --------------------------------------------------------------- 2. download
say "Downloading $DEB_NAME and SHA256SUMS"
gh release download "$TAG" --repo "$REPO" --dir "$DL_DIR" --clobber \
  --pattern "$DEB_NAME" --pattern SHA256SUMS
DEB_PATH="$DL_DIR/$DEB_NAME"
SUMS_PATH="$DL_DIR/SHA256SUMS"
[ -f "$DEB_PATH" ] || fail "Download did not produce $DEB_PATH"
[ -f "$SUMS_PATH" ] || fail "Release $TAG publishes no SHA256SUMS asset."
ok "downloaded $(du -h "$DEB_PATH" | cut -f1) and SHA256SUMS"

# --------------------------------------------------------------- 3. checksum
say "Verifying the checksum"
cd "$DL_DIR"
# Only the .deb was downloaded, so --ignore-missing keeps sha256sum from
# complaining about the other five assets. It also exits 0 when *nothing*
# matches, so first assert the .deb is actually covered by the file.
grep -Fq -- "$DEB_NAME" SHA256SUMS ||
  fail "$DEB_NAME is not listed in SHA256SUMS (nothing would be verified)."
SUMS_OUT="$(sha256sum -c --ignore-missing SHA256SUMS)"
printf '%s\n' "$SUMS_OUT"
grep -qF "$DEB_NAME: OK" <<<"$SUMS_OUT" ||
  fail "sha256sum did not report OK for $DEB_NAME."
ok "SHA256SUMS verified for $DEB_NAME"

# ---------------------------------------------------------------- 4. install
say "Installing $DEB_NAME with apt"
sudo apt-get update -qq
if ! sudo apt-get install -y "./$DEB_NAME"; then
  # A dependency that is only unpacked, or a held package, can make the first
  # pass fail; this is the documented recovery.
  printf 'first apt pass failed; running apt-get -f install\n' >&2
  sudo apt-get -f install -y || true
  sudo apt-get install -y "./$DEB_NAME" || fail "apt-get install ./$DEB_NAME failed."
fi

BIN_PATH="$(command -v omniterm || true)"
[ -n "$BIN_PATH" ] || fail "omniterm is not on PATH after installation."
# postinst creates /usr/bin/omniterm -> /opt/OmniTerm/omniterm. Assert it is
# really there now, otherwise the "nothing left behind" check after removal
# would pass vacuously against a package that never installed a launcher.
[ -L /usr/bin/omniterm ] || fail "the package's postinst did not create /usr/bin/omniterm."
DESKTOP_FILE="/usr/share/applications/omniterm.desktop"
[ -f "$DESKTOP_FILE" ] || fail "$DESKTOP_FILE was not installed."
ok "installed; omniterm -> $(readlink /usr/bin/omniterm)"

# ---------------------------------------------------------- 5. desktop entry
say "Validating the desktop entry"
sudo apt-get install -y -qq desktop-file-utils xvfb openbox
desktop-file-validate "$DESKTOP_FILE"
ok "desktop-file-validate passed"

# --------------------------------------------------------------- 6. headless
# The backend binds 127.0.0.1 on a port picked at launch, and only announces it
# on stdout ("[main] loopback port <n>"), so scrape that. openbox is not
# decoration: without a window manager Chromium reports the page as hidden and
# the renderer never runs, so nothing would answer.
say "Launching the app headlessly (Xvfb + openbox)"
mkdir -p "$OMNITERM_DATA_DIR"
: >"$APP_LOG"
setsid xvfb-run -a --server-args="-screen 0 1360x860x24" \
  bash -c 'openbox --sm-disable >/dev/null 2>&1 & sleep 1; exec omniterm --no-sandbox' \
  >>"$APP_LOG" 2>&1 &
LAUNCHER_PID=$!

PORT=""
for _ in $(seq 1 60); do
  PORT="$(sed -n 's/.*\[main\] loopback port \([0-9][0-9]*\).*/\1/p' "$APP_LOG" | head -1)"
  [ -n "$PORT" ] && break
  sleep 1
done
if [ -z "$PORT" ]; then
  printf '%s\n' '--- app log ---' >&2
  tail -n 100 "$APP_LOG" >&2 || true
  fail "the app never announced a loopback port (did it start at all?)"
fi
ok "app announced port $PORT"

say "Waiting for the local API on 127.0.0.1:$PORT"
API="http://127.0.0.1:$PORT"
CODE=""
for _ in $(seq 1 60); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' \
    -H "x-omniterm-token: $E2E_TOKEN" "$API/api/health" || true)"
  [ "$CODE" = "200" ] && break
  sleep 1
done
if [ "$CODE" != "200" ]; then
  printf '%s\n' '--- app log ---' >&2
  tail -n 100 "$APP_LOG" >&2 || true
  fail "/api/health did not answer 200 with a valid token (last: ${CODE:-none})"
fi
ok "/api/health answered 200"

# The token is the only thing protecting a shell, so prove it is actually
# enforced rather than assume it.
NOAUTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health" || true)"
[ "$NOAUTH_CODE" = "401" ] || fail "a request without the token got HTTP $NOAUTH_CODE, not 401."
ok "requests without x-omniterm-token are rejected with 401"

say "POSTing a harmless command to /api/terminal/execute"
# Arithmetic rather than a literal: the answer only appears if the command
# really ran in the shell, so it cannot pass on an echoed-back request body.
# shellcheck disable=SC2016  # single quotes are deliberate: $(()) must expand in
# the target shell on the other side of the API, not in this test's shell.
REQ_BODY='{"command":"echo omniterm-e2e-$((6*7))"}'
RESP="$(curl -s -X POST -H "x-omniterm-token: $E2E_TOKEN" \
  -H 'content-type: application/json' --data "$REQ_BODY" "$API/api/terminal/execute")"
printf 'response: %s\n' "$RESP"
printf '%s' "$RESP" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception as exc:
    sys.exit("response was not JSON: %s" % exc)
status, out = d.get("status"), (d.get("output") or "").strip()
print("parsed status=%r output=%r" % (status, out))
sys.exit(0 if status == "success" and "omniterm-e2e-42" in out else 1)
' || fail "the executed command did not return 'omniterm-e2e-42' with status 'success'."
ok "the API executed a command and returned the expected output"

# -------------------------------------------------------------- 7. teardown
say "Stopping the app and uninstalling"
kill -TERM -- "-$LAUNCHER_PID" 2>/dev/null || true
LAUNCHER_PID=""
sleep 3
pkill -f '/opt/OmniTerm/' 2>/dev/null || true
sudo apt-get remove -y omniterm

[ -n "$BIN_PATH" ] || fail "no install recorded before removal (test proved nothing)."
[ ! -e /usr/bin/omniterm ] || fail "leftover /usr/bin/omniterm after removal."
[ ! -d /opt/OmniTerm ] || fail "leftover /opt/OmniTerm after removal."

STRAY="$( { pgrep -a -f '/opt/OmniTerm/' || true; pgrep -a -x omniterm || true; pgrep -a -x electron || true; } | sort -u )"
if [ -n "$STRAY" ]; then
  printf '%s\n' "$STRAY" >&2
  fail "stray omniterm/electron processes survived the uninstall."
fi
ok "package removed; no symlink, no /opt/OmniTerm, no stray processes"

printf '\n==> %s\n' "released-artifact E2E passed for $TAG ($DEB_NAME)"
