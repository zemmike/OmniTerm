# OmniTerm

OmniTerm is a desktop terminal for real local shells, with tabs and split panes,
a file browser, host health, snapshots, command auditing, and a readable view of
terminal output. It runs on Linux, macOS, and Windows through Electron and
`node-pty`.

![Terminal with split panes](docs/screenshots/terminal.png)
![Themes and settings](docs/screenshots/settings.png)

## Highlights

- Real PTY sessions with tabs, split panes, scrollback, search, and remappable shortcuts.
- Bash, zsh, fish, PowerShell, and Command Prompt support with capability-aware integration.
- AI Reader view for structured terminal output, including headings, lists, tables, code,
  paths, inline TeX, and display TeX rendered locally with KaTeX.
- File browsing and editing, clickable terminal paths, Git status, and Docker status.
- Live host metrics that show unavailable platform capabilities instead of invented values.
- Local command audit records and `.tar.gz` or ZIP directory snapshots.
- Persistent themes, custom colors, cross-platform font stacks, and live terminal previews.
- Loopback-only, token-protected local API.

## Platform Support

| Platform        | Native CI and packages                                 | Default shell behavior                                                           |
| --------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Linux x64/arm64 | `.deb`, AppImage, `.tar.gz`; RPM is also built for x64 | Uses `$SHELL`, then Bash or `sh`; Bash, zsh, and fish receive richer integration |
| macOS x64/arm64 | DMG and ZIP                                            | Uses `$SHELL`, falling back to `/bin/zsh`                                        |
| Windows x64     | NSIS installer and ZIP                                 | Prefers PowerShell 7 (`pwsh.exe`), then Windows PowerShell, then `cmd.exe`       |

Linux remains the most established platform. macOS and Windows are supported
when their native **Build native packages** and **Release** workflow jobs pass.
Windows requires a ConPTY-capable release (Windows 10 version 1809 or newer).
WSL and Git Bash discovery are not included in this release.

Current preview packages are unsigned. macOS Gatekeeper or Windows SmartScreen
may therefore ask you to confirm the downloaded application. Inspect the release
and its `SHA256SUMS`, then use the operating system's per-app **Open** or **Run
anyway** action if you trust it; do not disable system-wide security checks.

## Install

Packages for every platform are on
[GitHub Releases](https://github.com/zemmike/OmniTerm/releases). Each release also
ships `SHA256SUMS`, so a download can be verified before it is run:
`sha256sum -c SHA256SUMS --ignore-missing`.

### Linux

1. Download `OmniTerm-<version>-amd64.deb` and install it:
   `sudo apt install ./OmniTerm-<version>-amd64.deb`
2. Or use the portable build: `chmod +x OmniTerm-<version>-x86_64.AppImage` and run it.
   An `.rpm` and a `.tar.gz` are published as well.
3. Or install from source with the script:
   `curl -fsSL https://raw.githubusercontent.com/zemmike/OmniTerm/main/install-linux.sh | bash`

After install, `omniterm` is on `PATH`, and `omniterm --version` prints the version
without opening a window.

### macOS

1. Download `OmniTerm-<version>-universal.dmg` and drag OmniTerm into Applications, or
   extract the `.zip` and move `OmniTerm.app` there yourself. One build covers Apple
   Silicon and Intel.
2. These builds are **not notarised yet**, so Gatekeeper blocks the first launch. Either
   right-click the app and choose Open, or clear the quarantine flag:
   `xattr -dr com.apple.quarantine /Applications/OmniTerm.app`

### Windows

1. In the release's **Assets** section, download `OmniTerm-<version>-win-x64.exe` and run
   the installer (NSIS). It installs per user and adds an uninstaller.
2. The installer is **not code-signed yet**, so SmartScreen shows a warning: choose
   _More info_ → _Run anyway_.
3. Or extract the `.zip` and run `OmniTerm.exe` without installing.

## Develop

Prerequisites: Git and Node.js 22.12 or newer. Node 24 is used by CI and pinned
in `.nvmrc`. Native `node-pty` compilation may also require your platform's C/C++
build tools and Python.

```bash
git clone https://github.com/zemmike/OmniTerm.git
cd OmniTerm
npm ci
npm run dev
```

`npm run dev` starts the Express and Vite development server at
`http://localhost:3000`. To launch the desktop build:

```bash
npm run start:desktop
```

Build native packages on their matching operating system:

```bash
npm run dist:linux
npm run dist:mac
npm run dist:win
```

## Settings And Reader

Open **Settings** with `Ctrl+,` to change the theme, colors, font family, font
size, history behavior, paste confirmation, and keyboard shortcuts. Changes are
stored locally and applied to open terminals immediately.

Select **AI Reader** in the Terminal toolbar to format the active pane's output.
The reader is local and observational: it strips terminal control sequences,
organizes supported Markdown-like structures, safely renders TeX with bundled
KaTeX, and never writes to the shell or sends content to an AI service.

## Verify

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Native PTY checks are `npm run test:pty` on Linux/macOS and
`npm run test:pty:windows` on Windows. The **Build native packages** workflow
runs portable checks plus native PTY, build, package, and installer checks on
Ubuntu, macOS, and Windows.

## Security Limits

OmniTerm intentionally executes commands with your user account and can read or
edit files that account can access. The backend binds to `127.0.0.1`, requires a
per-launch token for API and WebSocket access, and runs Electron with context
isolation, sandboxing, and no renderer Node integration. Do not expose its port
to a network, share session tokens, or treat snapshots as encrypted backups.

See [SECURITY.md](SECURITY.md) for the threat model and private vulnerability
reporting. Logs, data locations, unsigned-build guidance, and platform fixes are
in [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). Linux benchmark results
and methodology are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md). Development
rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Michael (zemmike)
