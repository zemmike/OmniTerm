#!/usr/bin/env bash
# ==============================================================================
# OmniTerm performance benchmark harness.
#
# Measures, on the machine it runs on, with a method anyone can re-run:
#
#   1. cold start -> interactive prompt   spawn to sentinel in an output frame
#                                         (5 runs, median + worst)
#   2. cold start -> API ready            spawn to /api/health == 200 (a LOWER
#                                         bound: the window is not up yet)
#   3. idle resident memory               PSS summed over the app's process
#                                         tree, 10s idle, one tab (3 runs)
#   4. large-output throughput            one WS session, `seq 1 N` to the final
#                                         marker: the PTY + transport path, NOT
#                                         the xterm renderer
#   5. time to window mapped              spawn to a mapped window titled
#                                         "OmniTerm" (5 runs, median)
#
# Headless: starts Xvfb and openbox on $DISPLAY_NUM only if they are not already
# running, uses a throwaway OMNITERM_DATA_DIR, and reaps everything it started
# from a trap, so a failed run cannot leave orphans behind. Re-runnable.
#
#   bash scripts/bench.sh
#
# Environment overrides:
#   OMNITERM_BENCH_DISPLAY    X display number              (default 93)
#   OMNITERM_BENCH_TOKEN      session token                 (default bench)
#   OMNITERM_BENCH_COLD_RUNS  cold-start runs               (default 5)
#   OMNITERM_BENCH_MEM_RUNS   memory runs                   (default 3)
#   OMNITERM_BENCH_IDLE_SECS  idle seconds before sampling  (default 10)
#   OMNITERM_BENCH_LINES      lines for the throughput test (default 100000)
#   OMNITERM_BENCH_KEEP       1 to keep the scratch dir     (default: remove)
#
# The app is launched the way a user launches it:
#   DISPLAY=:N OMNITERM_TOKEN=... npx electron . --no-sandbox
# plus two things a benchmark needs:
#   OMNITERM_DATA_DIR=<scratch>   so nothing touches the real data dir, and
#   --user-data-dir=<scratch>     because electron-main.cjs takes the
#       Electron single-instance lock at ~/.config/OmniTerm and SILENTLY quits
#       (exit 0, no output) if another OmniTerm is already running. Without a
#       private profile this harness measures nothing on any machine where the
#       app is open, and every run looks like a crash.
# The backend port is NOT fixed: electron-main.cjs always picks a free loopback
# port and overrides PORT in the child server's environment, so the harness
# scrapes the "[main] loopback port <n>" line out of the app log instead of
# assuming one.
# ==============================================================================
set -euo pipefail

REPO_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
PROBE="$REPO_DIR/scripts/bench-probe.cjs"

DISPLAY_NUM="${OMNITERM_BENCH_DISPLAY:-93}"
TOKEN="${OMNITERM_BENCH_TOKEN:-bench}"
COLD_RUNS="${OMNITERM_BENCH_COLD_RUNS:-5}"
MEM_RUNS="${OMNITERM_BENCH_MEM_RUNS:-3}"
IDLE_SECS="${OMNITERM_BENCH_IDLE_SECS:-10}"
BENCH_LINES="${OMNITERM_BENCH_LINES:-100000}"
BENCH_KEEP="${OMNITERM_BENCH_KEEP:-0}"

WORK_DIR=$(mktemp -d /tmp/omniterm-bench.XXXXXX)
DATA_DIR="$WORK_DIR/data"
UDATA_DIR="$WORK_DIR/udata"
APP_LOG="$WORK_DIR/app.log"
DISP=":$DISPLAY_NUM"

mkdir -p "$DATA_DIR" "$UDATA_DIR"
chmod 700 "$WORK_DIR" "$DATA_DIR" "$UDATA_DIR"

# PIDs/state owned by this script. Nothing else is ever killed.
APP_PID=""
XVFB_PID=""
OPENBOX_PID=""

COLD_PROMPT=()
COLD_API=()
COLD_WINDOW=()
MEM_MB=()
MEM_PROCS=()
MEM_APP_MB=()
MEM_APP_PROCS=()
MEM_BREAKDOWN=""
MEM_BREAKDOWN_ALL=""
THR_MS=()
THR_BYTES=()
THR_LINES=""
FAILED=""

# ------------------------------------------------------------------- output
say() { printf '\n==> %s\n' "$*"; }
ok() { printf '  ok   %s\n' "$*"; }
warn() { printf '  warn %s\n' "$*" >&2; }

now_ms() {
  local t="${EPOCHREALTIME/./}"
  printf '%s' "${t:0:13}"
}

median() {
  printf '%s\n' "$@" | sort -n | awk '{v[NR]=$1} END { if (NR==0) exit; if (NR%2) print v[(NR+1)/2]; else printf "%.0f\n", (v[NR/2]+v[NR/2+1])/2 }'
}

worst_of() { printf '%s\n' "$@" | sort -n | tail -1; }

field() { sed -n "s/^$1=//p" "$2" 2>/dev/null | head -1; }

# ------------------------------------------------------------------ teardown
# Every process this script starts carries OMNITERM_DATA_DIR=<throwaway> in its
# environment, which is a marker unique to this run. Matching on that is exact
# and cannot match the harness's own shell (which never exports it), unlike
# `pkill -f`, which matches the invoking command line and has killed a session
# on this machine before.
marker_pids() {
  grep -laF -- "OMNITERM_DATA_DIR=$DATA_DIR" /proc/[0-9]*/environ 2>/dev/null |
    sed 's#^/proc/##; s#/environ$##' || true
}

sweep_orphans() {
  local sig="$1" pid
  while read -r pid; do
    [ -n "$pid" ] || continue
    kill "-$sig" "$pid" 2>/dev/null || true
  done < <(marker_pids)
}

stop_app() {
  local i
  # Signal the whole tree at once. Killing only the launcher is not enough:
  # npm exec does not forward SIGTERM to the Electron processes.
  if [ -n "$APP_PID" ]; then kill -TERM -- "$APP_PID" 2>/dev/null || true; fi
  sweep_orphans TERM
  APP_PID=""
  for i in $(seq 1 24); do
    [ -z "$(marker_pids)" ] && return 0
    sleep 0.25
  done
  warn "app did not exit within 6s of SIGTERM; sending SIGKILL"
  sweep_orphans KILL
  for i in $(seq 1 12); do
    [ -z "$(marker_pids)" ] && return 0
    sleep 0.25
  done
  if [ -n "$(marker_pids)" ]; then
    warn "processes still alive after SIGKILL: $(marker_pids | tr '\n' ' ')"
  fi
}

cleanup() {
  local rc=$?
  trap - EXIT
  stop_app
  if [ -n "$OPENBOX_PID" ]; then kill -TERM "$OPENBOX_PID" 2>/dev/null || true; fi
  if [ -n "$XVFB_PID" ]; then kill -TERM "$XVFB_PID" 2>/dev/null || true; fi
  if [ "$BENCH_KEEP" = "1" ]; then
    printf '  kept scratch dir %s\n' "$WORK_DIR"
  else
    rm -rf "$WORK_DIR"
  fi
  exit "$rc"
}
trap cleanup EXIT

# ------------------------------------------------------------------- display
ensure_display() {
  if ! xdpyinfo -display "$DISP" >/dev/null 2>&1; then
    say "Starting Xvfb on $DISP"
    Xvfb "$DISP" -screen 0 1280x900x24 -nolisten tcp >"$WORK_DIR/xvfb.log" 2>&1 &
    XVFB_PID=$!
    local i
    for i in $(seq 1 100); do
      xdpyinfo -display "$DISP" >/dev/null 2>&1 && break
      sleep 0.1
    done
    xdpyinfo -display "$DISP" >/dev/null 2>&1 || {
      printf 'Xvfb never came up on %s\n' "$DISP" >&2
      tail -n 20 "$WORK_DIR/xvfb.log" >&2 || true
      exit 1
    }
    ok "Xvfb started (pid $XVFB_PID)"
  else
    ok "Xvfb already running on $DISP (left alone)"
  fi

  # openbox is not decoration: without a window manager Chromium reports the
  # page as hidden and the render loop paints nothing.
  if [ -z "$(DISPLAY="$DISP" xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null |
    grep -o 'window id # 0x[0-9a-fA-F]*' || true)" ]; then
    say "Starting openbox on $DISP"
    DISPLAY="$DISP" openbox --sm-disable >"$WORK_DIR/openbox.log" 2>&1 &
    OPENBOX_PID=$!
    sleep 1
    ok "openbox started (pid $OPENBOX_PID)"
  else
    ok "a window manager is already running on $DISP (left alone)"
  fi
}

# ------------------------------------------------------------------- helpers
window_ids() {
  DISPLAY="$DISP" xwininfo -root -tree 2>/dev/null |
    grep -i omniterm | awk '{print $1}' || true
}

window_viewable() {
  DISPLAY="$DISP" xwininfo -id "$1" 2>/dev/null | grep -q "IsViewable"
}

# Poll the window tree for a mapped window titled omniterm that was not in
# $2 (the baseline captured before the spawn). Window ids are stable per run,
# so baseline subtraction cannot be fooled by a window left over from another
# instance.
wait_window_ms() {
  local t0="$1" baseline="$2" deadline
  deadline=$(( $(now_ms) + 60000 ))
  while [ "$(now_ms)" -lt "$deadline" ]; do
    local id
    while read -r id; do
      [ -n "$id" ] || continue
      grep -qx -- "$id" "$baseline" 2>/dev/null && continue
      if window_viewable "$id"; then
        printf '%s' "$(( $(now_ms) - t0 ))"
        return 0
      fi
    done < <(window_ids)
    sleep 0.02
  done
  return 1
}

wait_port() {
  local i p
  for i in $(seq 1 600); do
    p=$(grep -m1 -oP 'loopback port \K[0-9]+' "$APP_LOG" 2>/dev/null || true)
    if [ -n "$p" ]; then
      printf '%s' "$p"
      return 0
    fi
    if [ -n "$APP_PID" ] && ! kill -0 "$APP_PID" 2>/dev/null; then
      return 1
    fi
    sleep 0.025
  done
  return 1
}

launch_app() {
  : >"$APP_LOG"
  t0=$(now_ms)
  # --user-data-dir is not optional here. electron-main.cjs calls
  # requestSingleInstanceLock() and quits silently (exit 0, no output at all) if
  # another OmniTerm already holds the default profile at ~/.config/OmniTerm.
  # Without a private profile, a benchmark run on a machine where someone has
  # OmniTerm open measures nothing at all and looks like "the app never
  # started". A per-run profile also keeps the run out of the user's real
  # settings and log.
  #
  # No setsid either: it forks when the job is already a process-group leader,
  # which leaves $! pointing at a pid that is already dead. Every process in
  # the tree carries the throwaway OMNITERM_DATA_DIR in its environment, so the
  # marker sweep in stop_app() can reap all of them exactly, without ever
  # signalling a process group (which here would be the harness's own group).
  env DISPLAY="$DISP" OMNITERM_TOKEN="$TOKEN" OMNITERM_DATA_DIR="$DATA_DIR" \
    npx electron . --no-sandbox --user-data-dir="$UDATA_DIR" >>"$APP_LOG" 2>&1 &
  APP_PID=$!
}

dump_log() {
  printf '%s\n' '--- app log (tail) ---' >&2
  tail -n 30 "$APP_LOG" >&2 || true
}

# ------------------------------------------------------------------ cold run
# One launch yields three of the five metrics: API-ready, prompt-ready and
# window-mapped all start from the same spawn timestamp.
cold_run() {
  local idx="$1"
  local kv="$WORK_DIR/cold-$idx.kv" json="$WORK_DIR/cold-$idx.json"
  local baseline="$WORK_DIR/windows-$idx.before"

  window_ids >"$baseline"

  launch_app
  local port
  port=$(wait_port) || {
    dump_log
    FAILED="${FAILED}cold run $idx: the app never announced a loopback port (if the log is empty, it exited on the single-instance lock)\n"
    return 1
  }

  BENCH_MODE=cold BENCH_PORT="$port" BENCH_TOKEN="$TOKEN" BENCH_T0="$t0" \
    BENCH_OUT="$json" BENCH_KV="$kv" BENCH_LINES="$BENCH_LINES" \
    BENCH_THROUGHPUT=1 \
    node "$PROBE" >"$WORK_DIR/probe-$idx.log" 2>&1 &
  local probe_pid=$!

  local win_ms=""
  win_ms=$(wait_window_ms "$t0" "$baseline") || win_ms=""

  if ! wait "$probe_pid"; then
    dump_log
    printf '%s\n' '--- probe log (tail) ---' >&2
    tail -n 20 "$WORK_DIR/probe-$idx.log" >&2 || true
    FAILED="${FAILED}cold run $idx: probe failed\n"
    return 1
  fi

  COLD_PROMPT+=("$(field prompt_ms "$kv")")
  COLD_API+=("$(field api_ms "$kv")")
  if [ -n "$win_ms" ]; then COLD_WINDOW+=("$win_ms"); fi

  # The throughput command runs in this run's own session, right after the
  # sentinel, so it is measured on the same WebSocket the prompt was.
  local thr_ms
  thr_ms="$(field throughput_ms "$kv")"
  THR_LINES="$(field throughput_lines "$kv")"
  THR_MS+=("$thr_ms")
  THR_BYTES+=("$(field throughput_bytes "$kv")")

  printf '  run %s: prompt %sms  api %sms  window %sms  seq->marker %sms\n' \
    "$idx" "$(field prompt_ms "$kv")" "$(field api_ms "$kv")" "${win_ms:-n/a}" "$thr_ms"

  stop_app
}

# ------------------------------------------------------------------- mem run
# The UI's default tab really is a PTY (src/components/TerminalPane.tsx opens
# /term and sends a start frame on mount), so "one tab, idle" needs no extra
# session from the harness. Wait for the window so the renderer has mounted,
# then sit idle and sample PSS.
mem_run() {
  local idx="$1"
  local kv="$WORK_DIR/mem-$idx.kv" json="$WORK_DIR/mem-$idx.json"
  local baseline="$WORK_DIR/memwindows-$idx.before"

  window_ids >"$baseline"
  launch_app
  local port
  port=$(wait_port) || {
    dump_log
    FAILED="${FAILED}mem run $idx: no loopback port\n"
    return 1
  }
  local win_ms=""
  win_ms=$(wait_window_ms "$(now_ms)" "$baseline") || win_ms=""
  if [ -z "$win_ms" ]; then
    FAILED="${FAILED}mem run $idx: window never mapped\n"
    stop_app
    return 1
  fi

  sleep "$IDLE_SECS"

  BENCH_MODE=mem BENCH_APP_PID="$APP_PID" BENCH_OUT="$json" BENCH_KV="$kv" \
    node "$PROBE" >"$WORK_DIR/memprobe-$idx.log" 2>&1 || {
    FAILED="${FAILED}mem run $idx: probe failed\n"
    stop_app
    return 1
  }

  MEM_MB+=("$(field pss_mb "$kv")")
  MEM_PROCS+=("$(field processes "$kv")")
  MEM_APP_MB+=("$(field app_pss_mb "$kv")")
  MEM_APP_PROCS+=("$(field app_processes "$kv")")
  MEM_BREAKDOWN="$(field app_breakdown "$kv")"
  MEM_BREAKDOWN_ALL="$(field breakdown "$kv")"
  printf '  run %s: electron %s MB / %s procs   launcher+electron %s MB / %s procs\n' \
    "$idx" "$(field app_pss_mb "$kv")" "$(field app_processes "$kv")" \
    "$(field pss_mb "$kv")" "$(field processes "$kv")"

  stop_app
}

# ---------------------------------------------------------------------- main
say "OmniTerm performance benchmark"
printf '  repo      %s\n' "$REPO_DIR"
printf '  scratch   %s\n' "$WORK_DIR"
ensure_display

# The machine, for the record: these are the numbers a reader needs to place
# the results in context.
CPU_MODEL="$(grep -m1 'model name' /proc/cpuinfo | sed 's/.*: //' || echo unknown)"
CPU_CORES="$(nproc)"
MEM_TOTAL_MB="$(awk '/^MemTotal:/ {printf "%d", $2/1024}' /proc/meminfo)"
DISTRO="$(grep -m1 '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
[ -n "$DISTRO" ] || DISTRO="unknown"
printf '  machine   %s x%s  %s MB RAM  %s\n' "$CPU_MODEL" "$CPU_CORES" "$MEM_TOTAL_MB" "$DISTRO"
LOAD_START="$(cut -d' ' -f1-3 /proc/loadavg)"
printf '  load avg  %s\n' "$LOAD_START"

say "Cold start: API ready, prompt ready, window mapped, PTY throughput ($COLD_RUNS runs)"
for i in $(seq 1 "$COLD_RUNS"); do cold_run "$i" || true; done

say "Idle memory (${IDLE_SECS}s idle, one tab) ($MEM_RUNS runs)"
for i in $(seq 1 "$MEM_RUNS"); do mem_run "$i" || true; done

# ------------------------------------------------------------------- results
PROMPT_MED=$(median "${COLD_PROMPT[@]:-}")
PROMPT_WORST=$(worst_of "${COLD_PROMPT[@]:-}")
API_MED=$(median "${COLD_API[@]:-}")
API_WORST=$(worst_of "${COLD_API[@]:-}")
WIN_MED=$(median "${COLD_WINDOW[@]:-}")
WIN_WORST=$(worst_of "${COLD_WINDOW[@]:-}")
MEM_MED=$(median "${MEM_MB[@]:-}")
MEM_WORST=$(worst_of "${MEM_MB[@]:-}")
PROC_MED=$(median "${MEM_PROCS[@]:-}")
APP_MED=$(median "${MEM_APP_MB[@]:-}")
APP_WORST=$(worst_of "${MEM_APP_MB[@]:-}")
APP_PROC_MED=$(median "${MEM_APP_PROCS[@]:-}")
THR_MED_MS=$(median "${THR_MS[@]:-}")
THR_WORST_MS=$(worst_of "${THR_MS[@]:-}")
THR_SECS=$(awk -v ms="$THR_MED_MS" 'BEGIN { printf "%.2f", ms / 1000 }')
THR_WORST_S=$(awk -v ms="$THR_WORST_MS" 'BEGIN { printf "%.2f", ms / 1000 }')
BYTES_MED=$(median "${THR_BYTES[@]:-}")
THR_MBPS=$(awk -v b="$BYTES_MED" -v ms="$THR_MED_MS" 'BEGIN { if (ms > 0) printf "%.1f", (b / 1048576) / (ms / 1000); else print "n/a" }')
BYTES_MB=$(awk -v b="$BYTES_MED" 'BEGIN { printf "%.1f", b / 1048576 }')

say "Results"
printf '  %-34s %10s %10s %3s   %s\n' "metric" "median" "worst" "n" "raw runs"
printf '  %s\n' "-------------------------------------------------------------------------------------------------"
printf '  %-34s %10s %10s %3s   %s\n' \
  "cold start -> prompt (ms)" "$PROMPT_MED" "$PROMPT_WORST" "${#COLD_PROMPT[@]}" "${COLD_PROMPT[*]:-}"
printf '  %-34s %10s %10s %3s   %s\n' \
  "cold start -> API 200 (ms)" "$API_MED" "$API_WORST" "${#COLD_API[@]}" "${COLD_API[*]:-}"
printf '  %-34s %10s %10s %3s   %s\n' \
  "time to window mapped (ms)" "$WIN_MED" "$WIN_WORST" "${#COLD_WINDOW[@]}" "${COLD_WINDOW[*]:-}"
printf '  %-34s %10s %10s %3s   %s\n' \
  "seq 1 $THR_LINES -> marker (s)" "$THR_SECS" "$THR_WORST_S" "${#THR_MS[@]}" "${THR_MS[*]:-} ms"
printf '  %-34s %10s %10s %3s   %s\n' \
  "idle memory, app only (MB PSS)" "$APP_MED" "$APP_WORST" "${#MEM_APP_MB[@]}" "${MEM_APP_MB[*]:-}"
printf '  %-34s %10s %10s %3s   %s\n' \
  "app process count" "$APP_PROC_MED" "$(worst_of "${MEM_APP_PROCS[@]:-}")" "${#MEM_APP_PROCS[@]}" "${MEM_APP_PROCS[*]:-}"
printf '  %-34s %10s %10s %3s   %s\n' \
  "idle memory, whole tree (MB PSS)" "$MEM_MED" "$MEM_WORST" "${#MEM_MB[@]}" "${MEM_MB[*]:-}"
printf '  %-34s %10s %10s %3s   %s\n' \
  "whole-tree process count" "$PROC_MED" "$(worst_of "${MEM_PROCS[@]:-}")" "${#MEM_PROCS[@]}" "${MEM_PROCS[*]:-}"

if [ -n "$FAILED" ]; then
  printf '\n  INCOMPLETE:\n'
  printf "  %b" "$FAILED"
fi

# Machine-readable copies for the README.
cat >"$WORK_DIR/results.md" <<EOF
| Metric | Median | Worst | Runs |
| --- | --- | --- | --- |
| Cold start to interactive prompt | ${PROMPT_MED} ms | ${PROMPT_WORST} ms | ${COLD_PROMPT[*]:-} |
| Cold start to API ready (lower bound) | ${API_MED} ms | ${API_WORST} ms | ${COLD_API[*]:-} |
| Time to window mapped | ${WIN_MED} ms | ${WIN_WORST} ms | ${COLD_WINDOW[*]:-} |
| seq 1 ${THR_LINES:-n/a} to final marker (PTY + transport) | ${THR_SECS} s | ${THR_WORST_S} s | ${THR_MS[*]:-} ms |
| Idle resident memory, app only (PSS) | ${APP_MED} MB | ${APP_WORST} MB | ${MEM_APP_MB[*]:-} |
| App process count | ${APP_PROC_MED} | | ${MEM_APP_PROCS[*]:-} |
| Idle resident memory, launcher + app (PSS) | ${MEM_MED} MB | ${MEM_WORST} MB | ${MEM_MB[*]:-} |
| Whole-tree process count | ${PROC_MED} | | ${MEM_PROCS[*]:-} |

Throughput detail: ${BYTES_MB} MB over ${THR_LINES} lines, ${THR_MBPS} MB/s (median).
EOF

printf '\n  machine: %s x%s, %s MB RAM, %s\n' "$CPU_MODEL" "$CPU_CORES" "$MEM_TOTAL_MB" "$DISTRO"
printf '  load average: %s (at start: %s)\n' "$(cut -d' ' -f1-3 /proc/loadavg)" "${LOAD_START:-n/a}"
printf '  app-only PSS breakdown of the last mem run: %s\n' "${MEM_BREAKDOWN:-n/a}"
printf '  whole-tree PSS breakdown of the last mem run: %s\n' "${MEM_BREAKDOWN_ALL:-n/a}"
printf '  markdown table: %s\n' "$WORK_DIR/results.md"

if [ -n "$FAILED" ]; then exit 1; fi
