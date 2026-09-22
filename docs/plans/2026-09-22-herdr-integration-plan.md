# OmniTerm × Herdr — integration plan

**Status:** proposal for approval · **Date:** 2026-09-22 · **Owner:** Michael (zemmike)
**Builds on:** `docs/superpowers/specs/2026-09-22-herdr-integration-design.md` (architecture, written earlier)
**Verified against:** herdr.dev documentation and a real Herdr 0.9.1 install, 2026-09-22
**Phase 0 result:** **passed** — measurements and fixtures in `docs/herdr/findings.md`

---

## 1. The one-paragraph version

Herdr is a Rust terminal multiplexer for coding agents: a background server owns real
terminals, clients attach to render them, and agents are driven through a **CLI and a local
socket API** that return JSON. That API is the integration point. The plan is five phases,
each independently shippable as an OmniTerm release, starting with a half-day spike against
a real Herdr install. **Phase 1 alone** — making Herdr's own interface use your OmniTerm
theme — answers the styling request and needs no new architecture. **Phase 2** is where the
real prize is: OmniTerm's Reader reading a *full* agent transcript from a Herdr pane instead
of only the visible screenful, because Herdr's `pane read` reconstructs alternate-screen
history.

**Recommendation:** approve Phase 0 and Phase 1 now (2–3 days total). Decide on Phase 2+
after the spike, because Herdr is at 0.9.x and the API can still move.

---

## 2. What this buys, in your terms

| What you asked for | What it needs | Phase |
| --- | --- | --- |
| Herdr's interface styled like OmniTerm | Write Herdr's `[theme]` config from the active OmniTerm theme, then `herdr server reload-config` | **1** |
| Reader that reads like a document, not a screen | `hdr pane read` returns reconstructed scrollback, including alternate-screen apps | **2** |
| Real agent status instead of guessing from output | `herdr agent list --json` gives `working / blocked / done / idle / unknown` | **2** |
| Clicking a path opens the file you meant | Already shipped (1.16.0); Herdr panes inherit it once they share the transport | **3** |
| Not retyping prompts into agent TUIs | `herdr agent prompt` submits text properly, honouring bracketed-paste mode | **5** |
| Agents that survive closing the lid | Herdr already does this; the integration must simply never own a session | all |

Two things that are *not* available at any phase, stated up front:

- **OmniTerm cannot restyle the inside of a Herdr pane.** Programs draw their own colours.
  Phase 3 can remap the base 16-colour palette for the pane; true-colour output stays
  authoritative.
- **Per-command audit for Herdr-owned sessions is not claimed** unless Herdr exposes
  equivalent structured events. OmniTerm's audit chain keeps describing OmniTerm's own
  shells, which is the honest boundary.

---

## 3. Feasibility evidence

Checked against Herdr's published documentation, not assumed:

- **Command surface is real and JSON-shaped.** `herdr workspace create --cwd ~/project
  --label api --no-focus` returns `.result.workspace`, `.result.tab`,
  `.result.root_pane.pane_id`; `herdr pane split <pane> --direction right --no-focus`
  returns the new `.result.pane.pane_id`. Pane IDs look like `w1:p2`; agent names match
  `[a-z][a-z0-9_-]{0,31}`.
- **Pane control primitives exist**: `pane run`, `pane send-text`, `pane send-keys`,
  `pane wait-output`, `pane read`.
- **Agent primitives exist**: `agent start --kind claude|codex|…`, `agent prompt`,
  `agent send-keys`, `agent wait`, `agent list`, `agent get/rename`,
  `agent explain <target> --json`.
- **`pane read` reconstructs alternate-screen history**: "Herdr collects overlapping pages
  and returns the viewport to the bottom before completing the read." This is the single
  most valuable fact in this document for the Reader.
- **Herdr has a theme config**: `~/.config/herdr/config.toml` on Linux/macOS,
  `%APPDATA%\herdr\config.toml` on Windows, with a `[theme]` section, and
  `herdr server reload-config` applies edits to a running server. `herdr --default-config`
  prints the full default. This is how Phase 1 works.
- **`HERDR_ENV=1`** is set inside Herdr panes, so both OmniTerm and the agents can detect
  where they are.
- **Licence: AGPL-3.0-or-later.** Calling the installed `herdr` binary as a separate
  program is fine. Bundling, embedding, or shipping Herdr inside OmniTerm is not planned,
  and the design document already rejected embedding.
- **Not yet verified**: nothing on this machine — Herdr is not installed here and there is
  no Rust toolchain. Phase 0 exists to replace every line above with captured output.

---

## 4. Phases

Each phase ends in a release that is useful on its own. No phase depends on a later one.

### Phase 0 — Spike and fixtures (½–1 day) — **done, passed**

Install Herdr on this box. Capture, as committed fixtures: `herdr --help` and every
subcommand's `--help`, `herdr status --json`, `herdr agent list --json` with a real agent
running, `herdr pane read` on a pane running Claude Code (including one in the alternate
screen), `herdr --default-config`, and the exact `[theme]` keys in use. Measure `pane read`
latency and payload size. Write `docs/herdr/findings.md`.

**Deliverable:** fixtures + findings, and a written answer to "does observe mode feel
usable?" **Gate:** if `pane read` is slow, huge, or lossy, Phase 2 shrinks to the navigator
plus status badges and the Reader keeps working from the local pane only. If IDs are
unstable across a server restart, the whole plan is re-scoped before any UI work.

### Phase 1 — Match Herdr to your OmniTerm theme (1–2 days) — **done, shipped in 1.17.0**

Phase 0 found the cheap path: Herdr's config has `[theme] auto_switch`, documented as
"follow host terminal light/dark appearance" — which is the colour-scheme protocol OmniTerm
shipped in 1.16.0. So the recommended version of this phase writes **three keys**
(`auto_switch = true`, `dark_name`, `light_name`) and runs `herdr server reload-config`;
Herdr then follows OmniTerm's light/dark switch on its own. Per-token colour overrides are a
second, optional step, taken only if the built-in themes read as close-but-wrong.

Settings gets one button: **Match Herdr to this theme.** It reads
`~/.config/herdr/config.toml`, backs it up once, writes only those keys, reloads, and reports
what changed. A **Revert** button restores the backup. Never automatic, never on startup.

**Acceptance:** the Herdr UI matches after reload; no Herdr config is touched without an
explicit click; a missing Herdr, a read-only config, or an unknown `[theme]` shape produces
a clear message and changes nothing; the TOML writer is unit-tested against the default
config fixture; the existing backup/restore machinery is reused rather than reinvented.

*This phase answers the styling request on its own.*

### Phase 2 — A read-only Herdr tab (3–5 days)

Backend: a `HerdrAdapter` that spawns the discovered `herdr` binary with argument arrays
(never a shell string), validates JSON against the fixtures, caps output size, applies
timeouts, and maps errors to stable OmniTerm codes. Routes: `GET /api/herdr/status`,
`GET /api/herdr/snapshot`, both behind the existing per-launch token. Frontend: a `Herdr`
tab listing workspaces, tabs, panes and agents with status badges, plus the AI Reader
reading `pane read` output for the selected pane.

Verified specifics to build on (Phase 0): the capability probe is `herdr status --json`
(version, protocol, `endpoint_compatible`, socket path); the navigator reads
`herdr api snapshot`; the Reader reads **`agent read --source recent-unwrapped`** — measured
at 0.10 s for 200 lines, and the only source that keeps a 300-character line as one line; a
pane's `foreground_cwd` is the base for opening a clicked file path; and
`scroll.max_offset_from_bottom` lets the Reader say how much history it is not showing.

**Acceptance:** every Herdr read goes through the adapter; no route accepts a path or a
command from the renderer; Herdr missing, stopped, incompatible or slow all render as states
rather than errors; the Reader produces document-formatted output from a real transcript,
with soft-wrapped rows not becoming false paragraphs (guaranteed by `recent-unwrapped`);
contract tests run against the Phase 0 fixtures with no Herdr installed in CI.

### Phase 3 — Shared pane transport (3–4 days)

Extract the transport seam the design document describes: the local PTY WebSocket becomes
one implementation, Herdr observe another, and `TerminalPane` talks to the interface. The
Reader, search, copy, safe paste and file links then work on a Herdr pane because they work
on a pane.

**Acceptance:** zero behaviour change for local terminals, proven by the existing suite;
Herdr observe mode has no code path that can send input to the pane; a reconnect does not
steal control; the theme-change notification shipped in 1.16.0 applies to Herdr panes too.

### Phase 4 — Explicit control (2–3 days)

A visible Observe/Control switch per pane. Control requires a click, is exclusive, is
visually unmistakable, and releases on blur, tab close, disconnect or an explicit Release.
Keys, paste and resize forward only in Control. Risky or multi-line paste still goes through
the existing confirmation dialog.

**Acceptance:** observe mode cannot send bytes, asserted by test; control always releases,
asserted by test; a conflict reports who owns control and never auto-takes over; Herdr
sessions are never stopped by anything OmniTerm does — including quitting OmniTerm.

### Phase 5 — Agent actions and polish (2–3 days)

`herdr agent prompt` for submitting a prompt (structured, not typed keystrokes),
`agent wait` driving live badges, `agent explain --json` behind a "why is this state?"
affordance, and **Open in Herdr** as an escape hatch. Dashboard-level summary: blocked
agents first, because that is the thing a human needs to see.

**Acceptance:** prompts go through the structured operation; a blocked agent is never
auto-answered; status flips within a second of Herdr reporting it; the escape hatch always
works even if the rest of the integration is broken.

### Deferred, deliberately

Remote/SSH Herdr (`--remote`), Windows support, creating sessions or layouts from
OmniTerm (Herdr owns topology), and any attempt to mirror Herdr's split model into
OmniTerm's.

---

## 5. Estimates

| Phase | Focused effort | Ships |
| --- | --- | --- |
| 0 — Spike | ½–1 day | nothing user-visible (fixtures + findings) |
| 1 — Herdr theme sync | 1–2 days | v1.17.0 |
| 2 — Read-only tab + Reader over `pane read` | 3–5 days | v1.18.0 |
| 3 — Shared transport | 3–4 days | v1.19.0 |
| 4 — Explicit control | 2–3 days | v1.20.0 |
| 5 — Agent actions | 2–3 days | v1.21.0 |
| **Total** | **≈12–18 focused days** | |

Phase 1 is deliberately first: it is the smallest thing that demonstrably answers "make
Herdr look like OmniTerm", and it de-risks nothing later.

---

## 6. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Herdr 0.9.x changes its JSON or IDs | High | Version probe on connect; every parse validated against captured fixtures; unsupported shapes degrade to a clear "Herdr version not supported" state instead of a broken tab |
| `pane read` is too slow or lossy for the Reader | Medium | Measured in Phase 0; fallback is navigator + badges, with the Reader unchanged |
| A second terminal stack creeps in | Medium | Phase 3 is an extraction, not a fork; `TerminalPane` keeps its one implementation and the local PTY stays the reference |
| Scope grows into "reimplement Herdr" | Medium | Topology, sessions and lifecycle stay Herdr's; explicit non-goals in the design document |
| Control taken by accident | Low | Control is opt-in, visible, exclusive, and releases on every exit path, with tests |
| Licence confusion (Herdr is AGPL) | Low | CLI/socket only, no bundling, no linking; stated in the README when the tab ships |
| Your time | High | Each phase is a standalone release; stopping after any phase leaves a coherent product |

---

## 7. Open questions for you

1. **Theme writing:** Phase 1 edits `~/.config/herdr/config.toml`, a file Herdr owns. Back
   up + Revert only touches `[theme]` keys. Happy with that, or would you rather it print
   the values for you to paste?
2. **Order:** Phase 1 first (styling, small) or Phase 2 first (the Reader prize, bigger)?
   The plan assumes 1 then 2.
3. **Control:** do you want keyboard control of Herdr panes from inside OmniTerm at all, or
   is observe-only plus "Open in Herdr" enough? Skipping Phase 4 removes 2–3 days and the
   riskiest surface.
4. **Platforms:** Linux-only first, as assumed?
5. **Reader source:** for a Herdr pane, should the Reader default to `pane read` (full
   transcript) or to what is on screen (faster, identical to today)?

---

## 8. Acceptance criteria for the integrated whole

- Starting, closing, or crashing OmniTerm never stops a Herdr session.
- A Herdr pane can be observed without stealing control or changing its dimensions.
- Control is explicit, exclusive, and releasable.
- The Reader formats a real agent transcript as a document.
- Changing OmniTerm's theme corrupts nothing, in either local or Herdr panes.
- Local OmniTerm terminals work unchanged when Herdr is missing, stopped, or incompatible.
- Nothing in the integration weakens the existing security posture: loopback binding,
  per-launch token, origin checks, rate limits, paste confirmation, and no generic command
  runner reachable from the renderer.

---

## 9. What I would do first

Approve Phase 0. I install Herdr on this machine, capture the real fixtures, measure
`pane read`, and come back with either "Phase 1 starts tomorrow" or a re-scoped plan — with
evidence either way, and no architecture written on top of assumptions.
