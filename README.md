# OmniTerm

A real terminal emulator for Linux desktop — multi-tab sessions backed by your
**actual shell**, an AI copilot sidebar, live host health monitoring, a backup
snapshot engine and a file browser, packaged as a native Ubuntu/Debian app.

![OmniTerm icon](build/icon.png)

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
- **Real shell execution for scripts and the AI panel** — one-shot commands run
  through your `$SHELL` with real exit codes and real stderr.
- **Multi-tab sessions**, each with its own shell process, cwd and scrollback
  (10k lines) that survives tab switches.
- **Keyboard shortcuts** — `Ctrl+T` new tab, `Ctrl+W` close tab, `Ctrl+Tab`
  next tab, `Alt+1…9` jump to tab, `Ctrl+±` / `Ctrl+0` font size,
  `Ctrl+Shift+C/V` copy/paste, middle-click paste, `Ctrl+Shift+F` scrollback
  search, plus everything the shell itself binds.
- **Folder autocomplete** — Tab completes paths inside the terminal, and the
  new-tab folder picker completes directories as you type (`/api/complete`).
- **Real filesystem browser** — browse, read and edit actual files on disk
  (dirs, permissions, owners, symlinks, binary detection).
- **Live status bar** — the real `git` branch/dirty state of the shell's current
  directory and the actual Docker container count.
- **Command audit trail** — one-shot *and* interactive shell commands are
  appended to `~/.local/share/omniterm/activity.jsonl` (mode 0600) with exit
  code, cwd and timestamp, exportable as JSONL evidence. Inside the terminal the
  shell reports this via OSC 133/OSC 7 integration, which OmniTerm installs in
  `~/.local/share/omniterm/shell-integration.bash`.
- **Snapshots** — create real `tar.gz` archives of any directory (stored under
  `~/.local/share/omniterm/backups`) and get the exact restore command back.
- **AI copilot, local-first** — uses a model on your own machine via Ollama when
  one is running (shell context never leaves the box); falls back to the Gemini
  API only if you configure a key.
- **Real host health** — CPU load, memory, disk (`statfs`), network rates from
  `/proc/net/dev`, process count, top processes and uptime.
- **Security posture** — firewall state, AppArmor, sshd, privileged accounts,
  world-writable files and every listening socket with its scope.
- **Loopback-only API with a per-launch session token** — the local backend
  cannot be driven from a random web page.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl+T` / `Ctrl+W` | new tab / close tab |
| `Ctrl+Tab`, `Alt+1…9` | switch tabs |
| `Ctrl+±`, `Ctrl+0` | font size |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | copy / paste (middle-click pastes too) |
| `Ctrl+Shift+F` | search the scrollback |
| `Tab` | path and command completion (from your shell) |
| `Ctrl+C`, `Ctrl+D`, `Ctrl+L`, `Ctrl+R`, … | handled by your shell, as usual |

## What OmniTerm deliberately does *not* do

Fake features were removed rather than decorated: the previous "plugins" module,
"API & unit tests" runner and encryption toggles were UI mock-ups with no
backend. There is no fake cloud backup, no fantasy RBAC and no simulated
metrics — every number in the UI now comes from this machine.

## Install on Ubuntu / Debian / Mint / Pop!_OS

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
VERSION=1.0.0
wget https://github.com/zemmike/OmniTerm/releases/latest/download/OmniTerm-$VERSION-amd64.deb
sudo apt install ./OmniTerm-$VERSION-amd64.deb   # apt resolves the dependencies
omniterm                                          # or launch it from the app grid
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
npm install
npm run build                 # frontend + backend bundle into dist/
npx electron-builder --linux deb    # → release/OmniTerm-1.0.0-x64.deb
```

Requirements: Node.js 18+, and on Debian/Ubuntu the usual Electron runtime libs
(`libgtk-3-0 libnss3 libxss1 libxtst6 libatspi2.0-0 libsecret-1-0 xdg-utils`) —
the `.deb` declares them, apt pulls them in for you.

### Development

```bash
npm run dev      # Express + Vite dev server on http://localhost:3000
npm run lint     # tsc --noEmit
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
                      /api/env               platform, home, shell, AI provider
                      /api/files[/read|/save] real filesystem CRUD
                      /api/repo/status       real git state
                      /api/docker/status     real container state
                      /api/security          firewall, sshd, sockets, sudoers
                      /api/backups[/run]     real tar.gz snapshots
                      /api/activity-logs     audit trail (+ /api/audit/export)
                      /api/ai/copilot        local-first AI answer
                      /api/ai/status         which provider is in use
src/                React 19 + Vite + Tailwind frontend (tabbed terminal UI)
build/              Packaging resources (icon, .deb post-install hooks)
.github/workflows/  CI: build + install-check on every push, tagged releases
```

## Security model

OmniTerm executes shell commands, so the backend:

1. binds to `127.0.0.1` only,
2. requires the per-launch `x-omniterm-token` header on every `/api` request,
3. runs the renderer with `contextIsolation`, `sandbox` and no Node integration.

Never expose the backend port to a network.

## Configuration

Optional, via environment variables:

- `GEMINI_API_KEY` — enables the cloud AI fallback (prompts leave the machine).
- `OMNITERM_AI_PROVIDER` — `auto` (default, prefers a local model), `ollama`
  (local only, never calls the cloud) or `gemini`.
- `OLLAMA_URL` — default `http://127.0.0.1:11434`.
- `OMNITERM_OLLAMA_MODEL` — default `llama3.1`.
- `OMNITERM_AI_MODEL` — Gemini model, default `gemini-2.5-flash`.
- `OMNITERM_EXEC_TIMEOUT_MS` — per-command timeout, defaults to 60000.
- `OMNITERM_BACKUP_DIR` — snapshot location, default
  `~/.local/share/omniterm/backups`.
- `OMNITERM_DATA_DIR` — audit trail location, default
  `~/.local/share/omniterm`.

### Privacy

With a local Ollama model running, nothing you type leaves the machine — the
copilot status panel in the AI tab tells you which provider is answering. If no
local model is present and no key is configured, the copilot says so instead of
pretending to answer.

## Shell support

| Shell | Config adopted | Prompt | Audit: command | Audit: exit code |
| --- | --- | --- | --- | --- |
| bash | `/etc/profile`, `~/.bash_profile`, `~/.profile`, `~/.bashrc` | yes | yes | yes |
| zsh | `$ZDOTDIR` (or `~`) `.zshenv/.zprofile/.zshrc/.zlogin` | yes | yes | yes |
| fish | `~/.config/fish/config.fish` | yes | yes | yes |
| dash, ash, sh, other | the shell's own defaults | yes | yes | no (unknown, reported as empty) |

`npm run test:pty-socket` checks one shell end to end; `bash
scripts/shell-matrix-test.sh` checks every installed shell (prompt, command
execution, a user alias from the shell's own config, Ctrl+C, and the audit
entries with their exit codes) against a throwaway `$HOME`.

## Roadmap

- Hash-chained audit entries (tamper-evident retention) and a signed apt repo.
- Split panes and per-tab tab titles.

## License

MIT © Michael (zemmike)
