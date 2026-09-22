# Herdr integration — Phase 0 findings

**Date:** 2026-09-22 · **Herdr:** 0.9.1 (Linux x86_64) · **Server:** headless mode, protocol 22
**Binary hash (sha256):** `2a02fed16beb651ef006e1d43f048f652ca4dc58ad053cd2d44450563d5c54b7`

Everything below is captured output, not documentation. Fixtures live next to this file in
`fixtures/`. Where something could not be verified here, it says so.

## What was run

1. Downloaded `herdr-linux-x86_64` from the v0.9.1 GitHub release and installed it to
   `/usr/local/bin/herdr`. The release publishes **no checksum file**, so the hash above was
   computed here and is recorded for reproducibility.
2. Started the server headless: `herdr server` — no TTY needed, which matters because this
   box has none. `herdr status` reports `server: running`, `protocol: 22`,
   `endpoint_compatible: yes`, socket `~/.config/herdr/herdr.sock`.
3. Captured the CLI surface (`help-*.txt`), the full bundled API schema
   (`api-schema-full.json`, 277 KB), the default config (`default-config.toml`, 374 lines),
   an empty snapshot (`snapshot-empty.json`) and a live one (`snapshot-live.json`).
4. Created a workspace (`workspace create --cwd … --label phase0 --no-focus`), ran commands
   in its pane, read them back, and started a real agent (`agent start probe --kind hermes`).

## Measurements

| Question | Result |
| --- | --- |
| `pane read --lines 200` latency | **0.10 s** (714 bytes, 200 lines) |
| `agent read --lines 200 --source recent` latency | **0.10 s** (9,415 bytes, 200 lines) |
| Snapshot size, 1 workspace / 1 tab / 1 pane | small; `herdr api snapshot` returns `result.snapshot` with `workspaces`, `tabs`, `panes`, `agents`, `protocol`, `version` |
| `--format ansi` vs `--format text` | ansi keeps escape sequences (1 found in a coloured line), text strips them |
| Does `pane read` see an alternate-screen app? | Yes, but `--source recent` returned the **40-line viewport** for `less` |
| Does `agent read` reconstruct history? | **Yes — 200 lines** returned from a running agent's pane, matching the documented "collects overlapping pages" behaviour |
| Soft-wrapped rows | `--source recent` gave 80 lines, longest 119 chars; `--source recent-unwrapped` gave 77 lines, longest **313** chars |

The last two rows are the Phase 2 gate, and both passed:

- **The Reader must read `--source recent-unwrapped`.** A 300-character line stays one line
  instead of becoming three, so soft-wrapped rows cannot turn into false paragraphs.
- **For an agent pane, `agent read` returns reconstructed history**, not just the screenful.
  That is the limitation the Reader has been living with since v1.11.0, and it is fixed by
  using Herdr as the source rather than by any parser work.

## Capability probe, and what it replaces

`herdr status --json` is a real machine-readable probe and should be the adapter's first
call:

```json
{"client":{"version":"0.9.1","channel":"stable","protocol":22,
 "endpoint_capabilities":["surface_interest","presentation_effects_fence","health_check"],
 "binary":"/usr/local/bin/herdr"},
 "server":{"status":"running","running":true,"version":"0.9.1","protocol":22,
 "capabilities":{"live_handoff":true,"detached_server_daemon":false,
 "endpoint_protocol_generation":1,"surface_interest":true,"health_check":true},
 "compatible":true,"endpoint_compatible":true,
 "socket":"/root/.config/herdr/herdr.sock","restart_needed":false}}
```

This means the adapter can refuse to run against an incompatible protocol with a clear
message instead of failing somewhere deeper, and can report "Herdr is running but its
protocol changed" as a state rather than an error.

## Response shapes captured

`workspace create` returns `result.root_pane.pane_id` (`w1:p1`), `result.tab.tab_id`
(`w1:t1`), `result.workspace.workspace_id` (`w1`) — as documented. Panes carry
`agent_status`, `cwd`, **`foreground_cwd`**, `terminal_id`, `terminal_title`, `revision`,
and `scroll {offset_from_bottom, max_offset_from_bottom, viewport_rows}`.

Two of those matter more than the rest:

- **`foreground_cwd`** is the directory the pane's foreground process is in — the right base
  for opening a clicked file path, better than the shell's `cwd`.
- **`scroll.max_offset_from_bottom`** tells the Reader how much history exists, so it can say
  "showing the last page of 169" instead of implying completeness.

`agent list` returns `result.agents[]` with `name`, `agent`, `agent_status`
(`idle` here), `interactive_ready`, `pane_id`, `state_change_seq`, `cwd`. Agent detection
worked immediately on a real agent (`--kind hermes`), with no integration installed.

## Phase 1 is simpler than planned: Herdr can follow the terminal

`default-config.toml` has:

```toml
[theme]
# Built-in themes: catppuccin, terminal, tokyo-night, dracula, nord, gruvbox,
#                  one-dark, solarized, kanagawa, rose-pine, vesper
# Follow host terminal light/dark appearance and switch Herdr UI themes.
# auto_switch = false
```

`auto_switch` makes Herdr follow **the host terminal's light/dark appearance** — which is the
colour-scheme protocol shipped in OmniTerm 1.16.0 (`CSI ? 996 n`, and `CSI ? 997;1n`/`997;2n`
for programs that enable `DECSET 2031`). So Phase 1 splits cleanly:

- **Least invasive and probably enough:** set `auto_switch = true` plus `dark_name` and
  `light_name` to themes that match, and Herdr follows OmniTerm's light/dark switch by itself.
  Two keys, no colour maths, no per-token overrides.
- **Exact match, optional:** override individual colour tokens for a hand-tuned palette. More
  invasive to a file Herdr owns, and only worth it if the built-in themes read as "close but
  wrong" to you.

Recommendation: do the two-key version, `herdr server reload-config`, and look at it. If the
match is good enough, the per-token writer is not needed at all.

## Error and key syntax

A rejected call returns a stable envelope — this is what the adapter maps onto OmniTerm's
error codes:

```json
{"error":{"code":"invalid_key","message":"unsupported key ctrl-c"},"id":"cli:request"}
```

`pane send-keys` takes key names, and the help is explicit: "Use `esc` as the canonical
Escape key name; `escape` is also accepted". A key name invented by the caller is refused
with `invalid_key` rather than being sent, which is the behaviour Phase 4 wants.

## Not verified here, and why

- **Windows and macOS behaviour.** This box is Linux; the plan already defers them.
- **The interactive TUI.** There is no TTY here, so everything above went through the CLI and
  the headless server. Rendering, mouse behaviour and keybindings are untouched by this
  integration, but the pre-release checklist still wants one pass on a real desktop session.
- **`--format ansi` fidelity for the Reader's emphasis handling.** One coloured line was
  enough to prove escapes survive; the parser's behaviour on real agent output should be
  checked against a real transcript before release.
- **Concurrency.** One workspace, one agent. Multi-workspace behaviour under a snapshot-heavy
  UI is untested.

## Verdict

Phase 0 passes its gate on every point that mattered: `pane read` is fast (0.10 s), it is not
lossy (`agent read` reconstructs history), soft wrap is solvable by choosing a source, the
capability probe is real, and the pane's `foreground_cwd` is available for path resolution.
Nothing found argues against Phase 2, and one finding makes it cheaper: the Reader gets a
better data source than anything OmniTerm can reconstruct locally.

The server started here was stopped after the measurements; the `herdr` binary remains
installed at `/usr/local/bin/herdr` so the next phase can re-run these fixtures.
