# OmniTerm

A real terminal emulator for Linux desktop — multi-tab sessions backed by your
**actual shell**, an AI copilot sidebar, live host health monitoring, a backup
snapshot engine and a file browser, packaged as a native Ubuntu/Debian app.

![OmniTerm icon](build/icon.png)

## Features

- **Real shell execution** — commands run through your `$SHELL` (bash/zsh) with
  your environment, your `PATH`, your working directory. Real exit codes, real
  stdout/stderr, real errors.
- **Multi-tab sessions** with per-tab working directory, command history
  (`↑`/`↓` recall) and themes.
- **Real filesystem browser** — browse, read and edit actual files on disk
  (dirs, permissions, owners, symlinks, binary detection). No sample tree.
- **Live status bar** — the real `git` branch/dirty state of the session
  directory and the actual Docker container count, not decorations.
- **Command audit trail** — every command, its exit code, duration and working
  directory is appended to `~/.local/share/omniterm/activity.jsonl` (mode 0600)
  and can be exported as JSONL evidence.
- **Snapshots** — create real `tar.gz` archives of any directory (stored under
  `~/.local/share/omniterm/backups`) and get the exact restore command back.
- **AI copilot, local-first** — uses a model on your own machine via Ollama when
  one is running (shell context never leaves the box); falls back to the Gemini
  API only if you configure a key. Answers in the terminal via `ai <question>`.
- **Real host health** — CPU load, memory, disk (`statfs`), network rates from
  `/proc/net/dev`, process count, top processes and uptime.
- **Security posture** — firewall state, AppArmor, sshd, privileged accounts,
  world-writable files and every listening socket with its scope.
- **Loopback-only API with a per-launch session token** — the local backend
  cannot be driven from a random web page.

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
server.ts           Express API, all of it backed by the real machine:
                      /api/terminal/execute  real shell, real cwd, exit codes
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

## Roadmap

- Full-screen TTY support (`vim`, `top`, `ssh`) via `node-pty` pseudo-terminals.
- Hash-chained audit entries (tamper-evident retention) and a signed apt repo.
- Split panes and scrollback search.

## License

MIT © Michael (zemmike)
