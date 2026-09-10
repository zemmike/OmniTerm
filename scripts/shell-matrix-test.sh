#!/usr/bin/env bash
# Verifies the terminal against every shell we know how to hook, using a
# throwaway HOME so the real user config is untouched.
set -u
cd "$(dirname "$0")/.."

PORT=${PORT:-4410}
TOKEN=${TOKEN:-testtoken}
H=/tmp/ot-home
D=/tmp/ot-data
rm -rf "$H" "$D"
mkdir -p "$H/.config/fish" "$D"
printf "alias bt='echo BASH-ALIAS-OK'\n" > "$H/.bashrc"
printf "alias zt='echo ZSH-ALIAS-OK'\n" > "$H/.zshrc"
printf "alias ft 'echo FISH-ALIAS-OK'\n" > "$H/.config/fish/config.fish"

fails=0
run_shell() {
  local shell="$1" alias_cmd="$2" alias_expect="$3" name="$4" expect="$5"
  if [ ! -x "$shell" ]; then
    echo "--- $name: $shell not installed, skipped"
    return
  fi
  HOME="$H" OMNITERM_DATA_DIR="$D" SHELL="$shell" NODE_ENV=production \
    PORT="$PORT" OMNITERM_TOKEN="$TOKEN" node dist/server.cjs > "/tmp/ot-$name.log" 2>&1 &
  local pid=$!
  sleep 3
  HOME="$H" PORT="$PORT" TOKEN="$TOKEN" SHELL_NAME="$name" \
    ALIAS_CMD="$alias_cmd" ALIAS_EXPECT="$alias_expect" EXPECT_INTEGRATION="$expect" \
    node scripts/pty-socket-test.cjs || fails=$((fails + 1))
  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
}

only="${*:-}"
want() { [ -z "$only" ] && return 0; case " $only " in *" $1 "*) return 0 ;; esac; return 1; }

want bash && run_shell /bin/bash   bt BASH-ALIAS-OK bash 1
want zsh  && run_shell /usr/bin/zsh zt ZSH-ALIAS-OK zsh 1
want fish && run_shell /usr/bin/fish ft FISH-ALIAS-OK fish 1
want dash && run_shell /bin/dash   "" ""           dash 0
true

echo
echo "shells with failures: $fails"
exit $fails
