# OmniTerm

[![Build](https://github.com/zemmike/OmniTerm/actions/workflows/build.yml/badge.svg)](https://github.com/zemmike/OmniTerm/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/zemmike/OmniTerm)](https://github.com/zemmike/OmniTerm/releases/latest)
[![Licence](https://img.shields.io/github/license/zemmike/OmniTerm)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](.nvmrc)
[![Platform](https://img.shields.io/badge/platform-linux-lightgrey)](#install)

A **local-first Linux operations console**: a real shell over `node-pty`, a
workspace for the files on this machine, live health of _this_ host, and an
audit trail of what actually ran — in one window, packaged as a native
Ubuntu/Debian app. It is not a "faster terminal", and it does not pretend to be.

Every tab is a real PTY running your login shell. The file browser reads and
writes real paths. The health tab reads `/proc`, `ps` and `statfs` for the
machine you are sitting at. Every command OmniTerm runs is appended to an audit
log with its real exit code and cwd. Nothing in the UI is mocked, and nothing
leaves the machine.

### What it costs

OmniTerm is an **Electron** app, and that has a price you should know before you
install it:

- **~97 MB** installed (the `.deb`), **~200 MB resident** (measured PSS across
  its 8 processes), and **several seconds** to first paint.
- **Kitty, alacritty and Ghostty are faster and lighter.** If raw terminal speed
  and memory are what you are optimising for, use one of those — they are better
  at that, and this README will not pretend otherwise.
- OmniTerm is for when you want the shell, the files, the host state and the
  audit trail in the same window, and will pay a few hundred megabytes for it.

![OmniTerm icon](build/icon.png)

## What it is

- **A real terminal** — multi-tab, split panes, one actual PTY per pane running
  your `$SHELL`, with your prompt, aliases, functions and history.
- **A file workspace** — browse, read and edit real files on disk, colour-coded
  by type.
- **Live host health of this machine** — RAM breakdown, top processes by memory,
  every mount, disk I/O, per-core CPU, load, network rates and CPU temperature
  where the hardware exposes it, all read from `/proc`, `ps` and `statfs`.
- **An audit trail** — every command OmniTerm runs, one-shot or interactive, is
  written to `~/.local/share/omniterm/activity.jsonl` (mode 0600) with exit code,
  cwd and timestamp, and is exportable as JSONL evidence.
- **Real snapshots** — `tar.gz` archives of any directory, stored under
  `~/.local/share/omniterm/backups`, with the exact restore command returned.
- **Local-only** — the API binds `127.0.0.1` and requires a per-launch session
  token. Nothing is sent to any remote service.

## What it is not

- **Not a lightweight terminal.** See the cost above; Kitty/alacritty/Ghostty
  beat it on startup time and memory, and always will.
- **Not cross-platform.** Linux only. macOS and Windows are **not supported**
  and there is no plan to claim otherwise.
- **Not an AI tool.** AI assistance was removed in 1.7.0 — there is no `ai`
  command, no provider configuration and no API keys. See
  [AI: removed](#ai-removed).
- **Not a remote or cloud product.** There is no fleet view, no SSH manager and
  no sync. The health tab reports the machine OmniTerm is running on, and only
  that.
- **Not a shell.** It spawns your shell; it does not wrap, restrict or
  re-implement it.
- **Not a mock-up.** Every number in the UI comes from this machine. Features
  that could not be backed by anything real were deleted rather than decorated.

## Supported platforms

"Fully supported" means CI exercises it. "Best-effort" means the artifact is
built and published but nothing in CI runs it. "Untested" means exactly that.

| Platform                               | Status                    | What is actually verified                                                                                                                     |
| -------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Ubuntu / Debian **x64** `.deb`         | **Fully supported**       | CI builds the `.deb`, installs it on a runner, and checks the binary and desktop entry exist                                                  |
| Ubuntu / Debian **arm64** `.deb`       | Best-effort               | CI builds and publishes it; no CI runner installs it                                                                                          |
| Ubuntu / Debian `.tar.gz` (x64, arm64) | Best-effort               | CI builds it; no smoke test                                                                                                                   |
| AppImage (x86_64)                      | Best-effort               | CI builds it; no smoke test                                                                                                                   |
| RPM (x86_64)                           | Best-effort               | CI builds it; no smoke test                                                                                                                   |
| **X11**                                | Verified on real hardware | Manual testing. CI is headless and does not exercise a display server                                                                         |
| **Wayland**                            | **Untested**              | Nothing. It may work; it is not claimed. See [TROUBLESHOOTING](docs/TROUBLESHOOTING.md)                                                       |
| **bash, zsh, fish**                    | **Fully supported**       | CI shell matrix: prompt, a user alias from the shell's own config, Ctrl+C, the audit entry and its exit code — all checks pass for each shell |
| **dash / POSIX** (`sh`, `ash`)         | Best-effort               | CI runs dash through the same matrix with reduced integration: the shell works, exit codes are reported as blank rather than guessed          |
| Other / unknown shells                 | Reduced-integration mode  | Not tested. The shell still runs; command and exit-code reporting is disabled                                                                 |
| **macOS, Windows**                     | **Not supported**         | No builds, no CI, no plans                                                                                                                    |

Everything except Linux is out of scope. If you need a terminal on macOS or
Windows, this is not it.

## Features

- **Works with your shell, whatever it is** — bash, zsh and fish get full shell
  integration (their own prompt, their own aliases and functions, plus command
  and exit-code reporting to the audit trail). Each shell is hooked the way that
  shell requires: bash through a generated `--rcfile`, zsh through a generated
  `$ZDOTDIR`, fish through `--init-command`. Any other shell (dash, ash, sh)
  still runs as a normal interactive shell; only the exit code cannot be
  reported there, and the app says so instead of guessing.
- **A real terminal, not a command box** — every tab is an actual PTY running
  your login shell, so `vim`, `top`, `less`, `ssh`, job control, colours, Ctrl+C,
  Ctrl+D, Tab completion and your shell's own history all behave exactly as they
  do in GNOME Terminal or Konsole.
- **Your environment, adopted as-is** — `$SHELL`, `PATH` from `/etc/profile` and
  `~/.profile`, your aliases and functions from `~/.bashrc`, your prompt, your
  locale, your `~/.ssh` keys, and every package and tool you already installed.
  OmniTerm does not wrap, restrict or re-implement your shell.
- **Real shell execution for scripts** — one-shot commands run through your
  `$SHELL` with real exit codes and real stderr.
- **Multi-tab sessions**, each with its own shell process, cwd and scrollback
  (10k lines) that survives tab switches.
- **Split panes** — split the terminal area vertically (side by side) or
  horizontally (stacked). Each pane is an independent PTY session, panes are
  closed individually, and the layout lives per tab.
- **Four tabs** — Terminal, Files, System Health and Settings.
- **A Settings tab for the whole app** — replaces the old per-tab clutter:
  built-in terminal colour schemes with a live preview, custom colours
  (background, foreground, cursor, selection, plus the UI accent), font family
  and font size, and an editor for every keyboard shortcut where each action's
  binding can be re-recorded and reset to defaults. Settings persist per machine
  (browser `localStorage`) and apply instantly.
- **Keyboard shortcuts** — every action is remappable in Settings; the defaults
  are in the [shortcut table](#keyboard) below.
- **Prefix history search** — type a prefix such as `git` and press Up/Down to
  cycle only the commands that start with it; with no prefix you get plain
  history. Sources are the commands run in the current session plus the shell's
  own history file (`~/.bash_history` for bash, `~/.zsh_history` for zsh,
  `~/.local/share/fish/fish_history` for fish). It can be turned off in
  Settings.
- **Mouse, the way a terminal should feel** — click to focus, drag to select,
  copy-on-select (toggleable in Settings), right-click for a context menu
  (copy / paste / clear / select all), middle-click to paste, and the wheel to
  scroll the scrollback. `Ctrl`/`Cmd`+click opens `http(s)` links in the system
  browser — only `http`, `https` and `file` are ever opened, validated before
  being handed to the OS. Full-screen apps (vim, htop, tmux) receive mouse events
  when they enable mouse reporting.
- **Command decorations and prompt navigation** — the OSC 133 markers the shell
  integration already installs are parsed into a per-command duration and
  exit-status decoration in the gutter, and jump-to-previous/next-prompt
  navigation skips long outputs.
- **Folder autocomplete** — Tab completes paths inside the terminal, and the
  new-tab folder picker completes directories as you type (`/api/complete`).
- **Real filesystem browser** — browse, read and edit actual files on disk
  (dirs, permissions, owners, symlinks, binary detection). Files are
  colour-coded by type — directory, executable, symlink, image, video, audio,
  archive, code by language, config, document, notebook, binary — each with a
  type badge, plus a legend and filter chips.
- **Live status bar** — the real `git` branch/dirty state of the shell's current
  directory and the actual Docker container count.
- **Command audit trail** — one-shot _and_ interactive shell commands are
  appended to `~/.local/share/omniterm/activity.jsonl` (mode 0600) with exit
  code, cwd and timestamp, exportable as JSONL evidence. Inside the terminal the
  shell reports this via OSC 133/OSC 7 integration, which OmniTerm installs in
  `~/.local/share/omniterm/shell-integration.bash`.
- **Snapshots** — create real `tar.gz` archives of any directory (stored under
  `~/.local/share/omniterm/backups`) and get the exact restore command back.
- **Real host health** — RAM breakdown (used / cached+buffers / swap /
  available), the top processes by memory _and_ an aggregation by program name
  (so 20 chrome processes are shown as one entry), swap usage, every real mount
  with its own usage, live disk I/O with the device name, per-core CPU usage,
  and CPU temperature when the hardware exposes it — plus load, network rates
  from `/proc/net/dev` and uptime. All read from `/proc`, `ps` and `statfs`.
- **Loopback-only API with a per-launch session token** — the local backend
  cannot be driven from a random web page.

## Keyboard

Every binding below is remappable in **Settings** (`Ctrl+,`), and each action can
be reset to its default.

| Shortcut                                                          | Action                                        |
| ----------------------------------------------------------------- | --------------------------------------------- |
| `Ctrl+T` / `Ctrl+Shift+T`                                         | new tab                                       |
| `Ctrl+W`                                                          | close tab                                     |
| `Ctrl+Tab` / `Ctrl+Shift+Tab`                                     | next / previous tab                           |
| `Alt+1…9`                                                         | switch to tab N                               |
| `Ctrl+Shift+E`                                                    | split right                                   |
| `Ctrl+Shift+O`                                                    | split down                                    |
| `Ctrl+Shift+W`                                                    | close pane                                    |
| `Ctrl+Shift+↑` / `Ctrl+Shift+↓` / `Ctrl+Shift+←` / `Ctrl+Shift+→` | move pane focus                               |
| `Ctrl+Shift+C` / `Ctrl+Shift+V`                                   | copy / paste (middle-click pastes too)        |
| `Ctrl+Shift+F`                                                    | search the scrollback                         |
| `Ctrl+Shift+K`                                                    | clear the screen                              |
| `Ctrl+Shift+PageUp` / `Ctrl+Shift+PageDown`                       | jump to previous / next prompt                |
| `Ctrl+,`                                                          | open Settings                                 |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0`                                    | font size up / down / reset                   |
| `Shift+PageUp` / `Shift+PageDown`                                 | scroll the scrollback                         |
| `↑` / `↓`                                                         | prefix history search (see above)             |
| `Tab`                                                             | path and command completion (from your shell) |
| `Ctrl+C`, `Ctrl+D`, `Ctrl+L`, `Ctrl+R`, …                         | handled by your shell, as usual               |

## Nothing is simulated

Fake features were removed rather than decorated: the previous "plugins" module,
"API & unit tests" runner and encryption toggles were UI mock-ups with no
backend. There is no fake cloud backup, no fantasy RBAC and no simulated
metrics — every number in the UI now comes from this machine.

## Screenshots

![Terminal with split panes and per-command exit codes](docs/screenshots/terminal.png)
![Colour-coded file browser](docs/screenshots/files.png)

![What is using your RAM, per-mount usage and per-core CPU](docs/screenshots/system-health.png)
![Themes, custom colours and remappable shortcuts](docs/screenshots/settings.png)

## Install

The **`.deb` is the supported path** on Ubuntu, Debian, Mint and Pop!_OS. The
AppImage, `.tar.gz` and RPM builds are published as a convenience but are
best-effort and not smoke-tested — see
[Supported platforms](#supported-platforms).

### Option 1 — one command (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/zemmike/OmniTerm/main/install-linux.sh | bash
```

### Option 2 — Ubuntu Software / App Center

Download `OmniTerm-<version>-amd64.deb` from the
[releases page](https://github.com/zemmike/OmniTerm/releases) and **double-click
it** — Ubuntu Software opens and installs it, dependencies included.

### Option 3 — apt from the command line

```bash
# Ask GitHub which version is current, so this never goes stale:
VERSION=$(curl -fsSL https://api.github.com/repos/zemmike/OmniTerm/releases/latest \
  | grep -o '"tag_name": *"v[^"]*"' | head -1 | sed 's/.*v//; s/"//')
curl -fsSLO "https://github.com/zemmike/OmniTerm/releases/latest/download/OmniTerm-$VERSION-amd64.deb"
sudo apt install "./OmniTerm-$VERSION-amd64.deb"   # apt resolves the dependencies
omniterm                                           # or launch it from the app grid
```

The installer script does the same thing, and also verifies the download against
the published `SHA256SUMS`:

```bash
curl -fsSL https://raw.githubusercontent.com/zemmike/OmniTerm/main/install-linux.sh | bash
```

Uninstall with `sudo apt remove omniterm`.

### No-install options

- `OmniTerm-<version>-x86_64.AppImage` — `chmod +x` and run.
- `OmniTerm-<version>-x64.tar.gz` — unpack and run `./omniterm`.

(The suffixes come from electron-builder: `amd64` for Debian packages,
`x86_64`/`x64` for the portable builds.)

## Build from source

```bash
git clone https://github.com/zemmike/OmniTerm.git
cd OmniTerm
npm ci                        # Node 24 per .nvmrc
npm run build                 # frontend + backend bundle into dist/
npx electron-builder --linux deb    # → release/OmniTerm-<version>-amd64.deb
```

Requirements: Node.js 22.12 or newer (`.nvmrc` pins 24, which is what CI uses; the accessibility suite pulls in jsdom, which wants 24.15+), and on Debian/Ubuntu the usual Electron runtime libs
(`libgtk-3-0 libnss3 libxss1 libxtst6 libatspi2.0-0 libsecret-1-0 xdg-utils`) —
the `.deb` declares them, apt pulls them in for you.

Contributing? See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, the
gates CI enforces and the rules that are not negotiable.

### Development

```bash
npm run dev        # Express + Vite dev server on http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run format:check
npm test           # vitest
```

## Architecture

```
electron-main.cjs   Electron shell: picks a free loopback port, boots the
                    backend inside Electron's own Node runtime, hands the
                    renderer a session token, streams logs to
                    ~/.config/OmniTerm/omniterm.log
preload.cjs         Sandboxed bridge that exposes the token to the renderer
pty.ts              Real interactive terminals: one node-pty session per tab,
                    shell integration for bash/zsh/fish (OSC 133 + OSC 7),
                    spawned with the user's login shell + bash OSC 133/7
                    integration, exposed over a token-guarded WebSocket at
                    /term and turned into audit records
server.ts           Express API, all of it backed by the real machine:
                      /api/terminal/execute  real shell, real cwd, exit codes
                      /api/terminal/status   PTY availability + live sessions
                      /api/complete          path completion for app dialogs
                      /api/health            real host metrics
                      /api/env               platform, home, shell, version
                      /api/files[/read|/save] real filesystem CRUD
                      /api/repo/status       real git state
                      /api/docker/status     real container state
                      /api/security          firewall, sshd, sockets, sudoers
                      /api/backups[/run]     real tar.gz snapshots
                      /api/activity-logs     audit trail (+ /api/audit/export)
src/                React 19 + Vite + Tailwind frontend (tabbed terminal UI)
src/settings.ts     persisted per-machine settings: theme, colours, font,
                    shortcut bindings (browser localStorage)
src/themes.ts       built-in terminal colour schemes
src/keys.ts         default keybindings and shortcut matching
src/components/SettingsView.tsx  the Settings tab UI
build/              Packaging resources (icon, .deb post-install hooks)
.github/workflows/  CI: build + install-check on every push, tagged releases
```

### Tests and coverage

```bash
npm run test              # unit/integration suites (vitest)
npm run test:coverage     # the same, plus coverage for both halves
npm run test:pty          # node-pty smoke test: prompt, aliases, Ctrl+C
npm run test:pty-matrix   # the shell integration matrix (bash, zsh, fish, dash)
```

Coverage is reported in two halves, because the API suites boot the backend as a
**child process** (`node dist/server.cjs`) and vitest's own coverage instrumentation
only sees the test process:

- `coverage/` — everything the tests load in-process (the React components and the
  accessibility suite). HTML and lcov.
- `coverage/backend/` — `server.ts` and `pty.ts`, measured by
  running the child under `NODE_V8_COVERAGE` and mapping the V8 data back through
  the source map esbuild emits. Printed in the CI log and written as lcov.

Both are published as a CI artifact on every run.

## Security model

OmniTerm executes shell commands, so the backend:

1. binds to `127.0.0.1` only,
2. requires the per-launch `x-omniterm-token` header on every `/api` request,
3. runs the renderer with `contextIsolation`, `sandbox` and no Node integration.

Never expose the backend port to a network.

## Configuration

Everything is optional — with nothing configured OmniTerm is a normal terminal.

### Appearance and shortcuts

Use the **Settings** tab (`Ctrl+,`): choose a built-in terminal colour scheme
with a live preview, set custom colours (background, foreground, cursor,
selection and the UI accent), pick a font family and size, and re-record or reset
any keyboard shortcut. Settings persist per machine in browser `localStorage` and
apply instantly.

### AI: removed

AI assistance was **removed in 1.7.0** — the `ai <prompt>` terminal command, the
provider settings file and every `/api/ai/*` route are gone. OmniTerm runs
commands and reports what happened; it does not send anything to a model
provider, and it holds no API keys.

If you configured a provider in an earlier version,
`~/.local/share/omniterm/ai-config.json` is now unused. OmniTerm neither reads nor
writes it, so you can delete it.

### Other

- `OMNITERM_EXEC_TIMEOUT_MS` — per-command timeout, defaults to 60000.
- `OMNITERM_BACKUP_DIR` — snapshot location, default
  `~/.local/share/omniterm/backups`.
- `OMNITERM_DATA_DIR` — audit trail and shell integration, default
  `~/.local/share/omniterm`.
- `OMNITERM_START_TAB` — tab to open at launch, e.g. `terminal` or `settings`
  (the tabs are `terminal`, `files`, `health` and `settings`).

## Shell support

Every shell below runs as your real interactive shell. What differs is how much
of the _integration_ OmniTerm can install, and therefore what it can report.

| Shell                | Config adopted                                               | Prompt | Audit: command | Audit: exit code                | CI                            |
| -------------------- | ------------------------------------------------------------ | ------ | -------------- | ------------------------------- | ----------------------------- |
| bash                 | `/etc/profile`, `~/.bash_profile`, `~/.profile`, `~/.bashrc` | yes    | yes            | yes                             | all checks pass each run      |
| zsh                  | `$ZDOTDIR` (or `~`) `.zshenv/.zprofile/.zshrc/.zlogin`       | yes    | yes            | yes                             | all checks pass each run      |
| fish                 | `~/.config/fish/config.fish`                                 | yes    | yes            | yes                             | all checks pass each run      |
| dash, ash, sh, other | the shell's own defaults                                     | yes    | yes            | no (unknown, reported as empty) | dash runs; exit code is blank |

A shell that cannot report its exit code shows a blank exit badge rather than a
guess — there is no synthetic `0` anywhere in the UI.

`npm run test:pty-socket` checks one shell end to end; `bash
scripts/shell-matrix-test.sh` checks every installed shell (prompt, command
execution, a user alias from the shell's own config, Ctrl+C, and the audit
entries with their exit codes) against a throwaway `$HOME`. That matrix is what
CI runs, and what "fully supported" in the
[platform table](#supported-platforms) means.

## Roadmap

- Hash-chained audit entries (tamper-evident retention) and a signed apt repo.
- Per-tab tab titles.

## Troubleshooting

[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) covers the failure modes you
are actually likely to hit: the app not starting, `node-pty` unavailable, a shell
that hangs at startup, `401 unauthorized` from the API, Wayland rendering, where
your data lives and how to reset it — and exactly what to include in a bug
report.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md) for the policy,
the supported versions and the threat model, which spells out what counts as a bug
in a tool whose job is to run a shell as you. Dependabot opens weekly dependency
update pull requests.

Every release publishes a `SHA256SUMS` file covering all its assets, and
`install-linux.sh` verifies the `.deb` against it before installing anything.

## Licence

OmniTerm is released under the MIT Licence. See [LICENSE](LICENSE) for the
full text.

MIT © Michael (zemmike)
