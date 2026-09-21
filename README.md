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

Every release is on [GitHub Releases](https://github.com/zemmike/OmniTerm/releases). Full
step-by-step instructions - including the first-launch warnings, how to verify a download,
and how to uninstall - are in **[docs/INSTALL.md](docs/INSTALL.md)**.

**Pick your file.** Open the release, scroll to the **Assets** section, and download the
line that matches your machine:

| Your machine                            | Download                             |
| --------------------------------------- | ------------------------------------ |
| Windows 10/11, 64-bit                   | `OmniTerm-<version>-win-x64.exe`     |
| Mac with Apple silicon (M1, M2, M3, M4) | `OmniTerm-<version>-mac-arm64.dmg`   |
| Mac with an Intel processor             | `OmniTerm-<version>-mac-x64.dmg`     |
| Linux, Debian or Ubuntu                 | `OmniTerm-<version>-amd64.deb`       |
| Linux, any distribution (no install)    | `OmniTerm-<version>-x86_64.AppImage` |

### Windows (Windows 10 version 1809 or newer)

1. Download `OmniTerm-<version>-win-x64.exe` from the release's **Assets** section.
2. Double-click the file. Windows will say _Windows protected your PC_ - that is because
   the installer is not code-signed yet. Click **More info**, then **Run anyway**.
3. Follow the installer. It installs for your user account only, so it never asks for an
   administrator password.
4. Start OmniTerm from the **Start menu**. Open your first terminal with **Ctrl+Shift+T**.
5. No installer, or no admin rights? Download `OmniTerm-<version>-win-x64.zip` instead,
   extract it anywhere, and run `OmniTerm.exe`.
6. To remove it: **Settings → Apps → Installed apps → OmniTerm → Uninstall**.

### macOS (macOS 13 Ventura or newer)

1. Check your chip: menu → **About This Mac**. "Apple M1/M2/M3/M4" means Apple silicon,
   "Intel" means Intel.
2. Download the matching file: `OmniTerm-<version>-mac-arm64.dmg` (Apple silicon) or
   `OmniTerm-<version>-mac-x64.dmg` (Intel).
3. Open the DMG, then drag **OmniTerm** onto the **Applications** shortcut in the same
   window.
4. Eject the disk image (the ⏏ button next to it in Finder), then launch OmniTerm from
   **Applications**.
5. macOS blocks the first launch because these builds are **not notarised** yet. Do one of:
   - right-click (or Control-click) OmniTerm in Applications → **Open** → **Open** again, or
   - in Terminal: `xattr -dr com.apple.quarantine /Applications/OmniTerm.app`

   You only need to do this once. Never disable Gatekeeper globally.

6. OmniTerm uses your login shell automatically (`$SHELL`, falling back to `/bin/zsh`).
7. To remove it: drag OmniTerm from Applications to the Bin. To also remove your settings
   and logs, delete `~/Library/Application Support/OmniTerm`.

### Linux

1. Debian/Ubuntu: download `OmniTerm-<version>-amd64.deb`, then
   `sudo apt install ./OmniTerm-<version>-amd64.deb`
2. Any distribution, no install: download `OmniTerm-<version>-x86_64.AppImage`, run
   `chmod +x OmniTerm-<version>-x86_64.AppImage`, then `./OmniTerm-<version>-x86_64.AppImage`
3. Fedora/openSUSE: `sudo dnf install ./OmniTerm-<version>-x86_64.rpm`
4. Or build and install from source:
   `curl -fsSL https://raw.githubusercontent.com/zemmike/OmniTerm/main/install-linux.sh | bash`

`omniterm` is then on your `PATH`, and `omniterm --version` prints the version without
opening a window. Linux needs an X11 session; on Wayland-only systems install XWayland
(see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)).

### Check the download before you run it

Every release ships `SHA256SUMS`. Compare it with what you downloaded:

- **Linux / macOS**: `shasum -a 256 -c SHA256SUMS --ignore-missing` (macOS has `shasum`,
  not `sha256sum`)
- **Windows (PowerShell)**: `Get-FileHash .\OmniTerm-<version>-win-x64.exe -Algorithm SHA256`
  and compare the hash with the line in `SHA256SUMS`

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
