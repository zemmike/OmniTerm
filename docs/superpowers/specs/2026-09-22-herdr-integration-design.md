# OmniTerm Herdr Integration Design

## Status

Approved direction: expose Herdr as a native OmniTerm workspace while Herdr remains the
owner of its sessions, panes, agents, and persistence. This document must be reviewed
before implementation planning begins.

## Goal

Let a developer use Herdr-managed coding agents inside OmniTerm without losing either
product's strengths. OmniTerm supplies its visual language, AI Reader, file links,
clipboard and paste safeguards, host health, and file tools. Herdr supplies persistent
workspaces, terminal topology, agent detection, lifecycle state, and detach/reattach.

## Non-goals

- Reimplement Herdr's multiplexer or session server.
- Scrape or reverse-engineer Herdr's TUI screen.
- Change ANSI output emitted by applications running inside a Herdr pane.
- Take control of a pane without an explicit user action.
- Install or update Herdr automatically in the first release.

## Considered approaches

### 1. Run `herdr` inside a normal OmniTerm pane

This works today and preserves Herdr exactly, but Herdr owns every character and mouse
gesture inside the terminal surface. OmniTerm cannot reliably restyle Herdr's TUI or
attach document semantics to individual panes. It is retained as the compatibility
fallback, not the integration architecture.

### 2. Native OmniTerm client for Herdr's API — selected

OmniTerm talks to the installed Herdr CLI/local socket API and renders Herdr workspaces,
tabs, panes, and agent status with OmniTerm components. A selected Herdr pane is observed
as a terminal stream; writable control is requested only when the user focuses and
interacts with it. This preserves Herdr's session ownership while allowing OmniTerm's
features to operate on structured pane data.

### 3. Fork or embed Herdr

Embedding Herdr internals would provide maximum control but tightly couples release
cycles, duplicates security-sensitive terminal code, and creates licensing and support
risk. It is rejected.

## User experience

OmniTerm gains a `Herdr` top-level tab. When Herdr is available, the tab contains:

- a workspace/tab/agent navigator styled with OmniTerm theme variables;
- status badges for working, blocked, done, idle, and disconnected agents;
- a terminal viewport for the selected Herdr pane;
- explicit Observe/Control state so the user knows whether input will be sent;
- actions to focus an agent, send a prompt, detach, and open the pane in raw Herdr;
- the existing AI Reader, search, copy, file-link, and safe-paste controls;
- a fallback message with install instructions when Herdr is unavailable.

The first release targets local Herdr on Linux and macOS. Windows shows Herdr as
unavailable unless a supported Herdr installation becomes available; WSL/SSH bridging is
deferred.

## Architecture

### Backend adapter

Add a `HerdrAdapter` on OmniTerm's Node backend. It invokes the Herdr CLI with argument
arrays (never a shell string), validates JSON responses, applies timeouts and output-size
limits, and maps Herdr errors to stable OmniTerm error codes. It is the only component
allowed to discover the executable or communicate with Herdr.

The adapter exposes a deliberately small interface:

- capability/version probe;
- workspace, tab, pane, and agent snapshots;
- agent focus, prompt, and wait operations;
- read-only terminal observation;
- explicit writable terminal control and release.

No arbitrary CLI command endpoint is exposed to the browser.

### OmniTerm API boundary

Authenticated HTTP routes provide capability and snapshot reads plus bounded agent
actions. A dedicated authenticated WebSocket carries terminal frames and input. Every
request uses OmniTerm's existing per-launch token and validates identifiers returned by
Herdr rather than accepting paths or commands from the renderer.

Initial API boundary:

- `GET /api/herdr/status`
- `GET /api/herdr/snapshot`
- `POST /api/herdr/agents/:id/focus`
- `POST /api/herdr/agents/:id/prompt`
- `WS /herdr-terminal?pane=<id>&mode=observe|control`

These routes return versioned response envelopes. The terminal WebSocket accepts only
pane IDs present in the latest validated snapshot and the two listed modes.

### Frontend model

Add a `HerdrView` that owns navigation and connection state. Reuse the existing xterm
host through a transport abstraction instead of duplicating `TerminalPane`. The current
local PTY WebSocket becomes one transport; Herdr observe/control becomes another. Shared
features consume a common pane interface for read buffer, send input, resize, search,
copy, file links, and AI Reader access.

Herdr state and OmniTerm presentation remain separate: Herdr IDs and lifecycle data are
never written into OmniTerm's persisted local-terminal workspace format.

## Data flow

1. The Herdr tab asks the backend for capability and a structured snapshot.
2. Selecting a pane opens a read-only observe stream and renders its ANSI frames.
3. AI Reader consumes the reconstructed logical buffer exactly as it does for a local
   OmniTerm pane.
4. Clicking Control requests Herdr's terminal control session. Only then are keyboard,
   paste, and resize messages forwarded.
5. Losing focus, closing the view, disconnecting, or selecting Release sends a release
   request and returns to observation.
6. Agent prompts use Herdr's structured prompt operation rather than typing command text
   into a terminal.

## Styling and feature boundaries

OmniTerm can style the surrounding navigator, tabs, controls, status, document Reader,
and its xterm palette. It cannot safely rewrite explicit ANSI colours or layout decisions
made by programs inside a Herdr pane. A "use OmniTerm palette" option may remap the base
16-colour palette, but true-colour application output remains authoritative.

OmniTerm features apply as follows:

- AI Reader, copy, search, safe paste, file links: supported on the selected pane;
- files and host health: remain OmniTerm side tools;
- split creation and topology: delegated to Herdr, not OmniTerm's local split model;
- agent status and prompt actions: supplied by Herdr's structured API;
- local terminal command audit: not claimed for Herdr-owned sessions unless Herdr exposes
  equivalent structured events.

## Failure handling

- Missing/incompatible Herdr: show an unavailable state; local OmniTerm terminals remain
  unaffected.
- Snapshot failure: retain the last snapshot with a stale indicator and retry manually or
  with bounded backoff.
- Observe stream loss: reconnect read-only without taking control.
- Control conflict: show who owns control when available and require explicit takeover;
  never retry takeover automatically.
- Malformed or oversized frames: close only the Herdr stream and report a protocol error.
- OmniTerm shutdown: release control best-effort; Herdr sessions continue running.

## Security

- Spawn the exact discovered executable without a shell.
- Permit only known Herdr subcommands and validated IDs.
- Preserve OmniTerm's loopback binding, launch token, origin checks, rate limits, and
  payload limits.
- Treat all Herdr labels, terminal text, and error messages as untrusted display data.
- Require the existing paste confirmation flow before forwarding risky or multiline
  input.
- Never expose the Herdr socket path or a generic command runner to the renderer.

## Testing

- Unit tests for capability parsing, command construction, schema validation, timeouts,
  and error mapping.
- Contract tests against a fake Herdr executable that emits representative JSON and
  terminal frames.
- Transport tests proving observe mode cannot send input and control always releases.
- React tests for unavailable, loading, stale, observing, controlling, and conflict
  states.
- Shared terminal regression tests for Reader formatting, safe paste, file links, resize,
  hidden-tab rendering, and reconnect behavior.
- An opt-in Linux integration test against a real Herdr installation before release.

## Delivery sequence

1. Read-only capability, snapshot, navigation, and observe mode.
2. Shared terminal transport extraction and OmniTerm Reader/search/copy features.
3. Explicit control/release, safe paste, and resize.
4. Structured agent focus/prompt actions and lifecycle badges.
5. Remote-machine support only after the local integration is stable.

## Acceptance criteria

- Starting or closing OmniTerm never stops a Herdr session.
- A Herdr pane can be observed without stealing control or changing its dimensions.
- Control is visually explicit, exclusive, and releasable.
- Reader output is document-formatted and soft-wrapped rows do not become false
  paragraphs.
- Changing OmniTerm themes while another tab is visible cannot corrupt either local or
  Herdr terminal rendering.
- Local OmniTerm terminals work unchanged when Herdr is missing, stopped, or incompatible.
