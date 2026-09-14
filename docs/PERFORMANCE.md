# Performance

Measured, not asserted. Every number below came from `npm run bench`
(`scripts/bench.sh`) on the machine named at the bottom, and the rule for this
document is that the numbers get published even when they look bad.

## Results

| Metric | Median | Worst | Runs | What it actually measures |
|---|---|---|---|---|
| Cold start → interactive prompt | **1212 ms** | 1256 ms | 5 | process spawn until the shell echoes a sentinel typed into the PTY |
| Cold start → API ready | **1116 ms** | 1152 ms | 5 | process spawn until `/api/health` answers 200. A lower bound on readiness |
| Time to window mapped | **1092 ms** | 1136 ms | 5 | process spawn until the X server reports the window |
| `seq 1 100000` → last line | **0.33 s** | 0.36 s | 5 | PTY + transport only. **Not a renderer benchmark** (see below) |
| Idle memory, app only | **250 MB** PSS | 251 MB | 3 | one tab, 10 s idle, summed over the 8 app processes |
| Idle memory, whole tree | **305 MB** PSS | 307 MB | 3 | includes the `npm exec` wrapper (11 processes) |

Machine: **AMD EPYC-Milan (4 vCPU), 7888 MB RAM, Ubuntu 26.04 LTS**, load average
0.81/1.42/1.00 during the runs. Headless X (Xvfb + openbox), one tab, DOM renderer.

## What these numbers do not measure

- **Frame times, GPU path and scroll smoothness.** The 100k-line figure times the
  PTY and the WebSocket transport, so it is an *upper bound* on how fast the app
  can produce output. What the user sees also depends on the renderer, and that is
  not measured here.
- **The WebGL renderer.** It exists as an opt-in setting and is **off by default**
  because it could not be verified working on this hardware; see the note in
  `CHANGELOG.md`. Its improvement is therefore unmeasured, not claimed.
- **Startup with many tabs, long-running sessions, or a real GPU.** Sessions were
  short and idle.

## Reproducing

```bash
npm run bench
```

The script starts its own Xvfb and openbox if they are not running, uses a
temporary data directory, and cleans up after itself (including on failure). It
prints a results table and writes a markdown copy to a temporary directory.

## Honest reading

Startup is **about 1.2 seconds to a usable prompt**, which is respectable for
Electron and better than the "several seconds" this README claimed before it was
measured. Memory is **250 MB resident for one tab**, which is the real cost of
being an Electron app, and it is worse than the ~200 MB previously quoted here:
the earlier figure was measured on a different build and is superseded by these
runs. Kitty, alacritty and Ghostty use a fraction of that, and they always will.
