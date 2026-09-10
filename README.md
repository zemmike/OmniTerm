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
- **AI copilot** — `ai <question>` in the terminal or the Copilot panel, backed
  by Gemini (`GEMINI_API_KEY`). Works offline with helpful fallbacks.
- **Live host health** — real CPU load, memory, disk (`statfs`), network rates
  from `/proc/net/dev`, process count, top processes and uptime.
- **Backup snapshots** — `backup run` creates a real `tar.gz` of the current
  directory in `~/OmniTerm/backups` and tells you how to restore it.
- **Built-in commands** — `cd`, `pwd`, `clear`, `history`, `help`, `backup`,
  `ai`; everything else goes to the shell.
- **Loopback-only API with a per-launch session token** — the local backend
  cannot be driven from a random web page.

## Install on Ubuntu / Debian / Mint / Pop!_OS

### Option 1 — one command (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/zemmike/OmniTerm/main/install-linux.sh | bash
```

### Option 2 — Ubuntu Software / App Center

Download `OmniTerm-<version>-x64.deb` from the
[releases page](https://github.com/zemmike/OmniTerm/releases) and **double-click
it** — Ubuntu Software opens and installs it, dependencies included.

### Option 3 — apt from the command line

```bash
wget https://github.com/zemmike/OmniTerm/releases/latest/download/OmniTerm-1.0.0-x64.deb
sudo apt install ./OmniTerm-1.0.0-x64.deb     # apt resolves the dependencies
omniterm                                       # or launch it from the app grid
```

Uninstall with `sudo apt remove omniterm`.

### No-install options

- `OmniTerm-<version>-x64.AppImage` — `chmod +x` and run.
- `OmniTerm-<version>-x64.tar.gz` — unpack and run `./omniterm`.

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
server.ts           Express API: /api/terminal/execute (real shell),
                    /api/health (real host metrics), /api/env, /api/files,
                    /api/ai/copilot, /api/backups
src/                React 19 + Vite + Tailwind frontend (tabbed terminal UI)
build/              Packaging resources (icon, .deb post-install hook)
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

- `GEMINI_API_KEY` — enables the AI copilot.
- `OMNITERM_AI_MODEL` — defaults to `gemini-2.5-flash`.
- `OMNITERM_EXEC_TIMEOUT_MS` — per-command timeout, defaults to 60000.

## Roadmap

- Full-screen TTY support (`vim`, `top`, `ssh`) via `node-pty` pseudo-terminals.
- Real file browser (currently the Files tab shows a sample tree).
- Signed apt repository so `sudo apt install omniterm` works without a URL.

## License

MIT © Michael (zemmike)
