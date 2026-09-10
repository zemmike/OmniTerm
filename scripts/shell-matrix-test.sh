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
idx=0
run_shell() {
  local shell="$1" alias_cmd="$2" alias_expect="$3" name="$4" expect="$5"
  if [ ! -x "$shell" ]; then
    echo "--- $name: $shell not installed, skipped"
    return
  fi
  # One port per shell: reusing a single port means the next server can race the
  # previous one for the bind, which is exactly how this failed on CI.
  local port=$((PORT + idx))
  idx=$((idx + 1))

  HOME="$H" OMNITERM_DATA_DIR="$D" SHELL="$shell" NODE_ENV=production \
    PORT="$port" OMNITERM_TOKEN="$TOKEN" node dist/server.cjs > "/tmp/ot-$name.log" 2>&1 &
  local pid=$!

  # Wait for the API to actually answer instead of guessing with a fixed sleep:
  # a cold CI runner takes longer to load node-pty than a warm laptop.
  local ready=0
  for _ in $(seq 1 80); do
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    if node -e "fetch('http://127.0.0.1:$port/api/health',{headers:{'x-omniterm-token':'$TOKEN'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      ready=1
      break
    fi
    sleep 0.5
  done

  if [ "$ready" -ne 1 ]; then
    echo "--- $name: server never became ready on port $port; last log lines:"
    tail -15 "/tmp/ot-$name.log" | sed 's/^/      /'
    fails=$((fails + 1))
    kill "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
    return
  fi

  HOME="$H" PORT="$port" TOKEN="$TOKEN" SHELL_NAME="$name" \
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
