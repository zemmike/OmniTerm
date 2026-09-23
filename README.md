# OmniTerm

**A desktop terminal that makes long terminal output easy to read.**

OmniTerm is a terminal app for Windows, macOS and Linux. It works like the terminal you
already use (tabs, split panes, your normal shell), and adds a few things on top:

- **AI Reader** - turns messy terminal output, such as answers from Claude Code or Codex,
  into a clean document with real headings, lists, tables and code blocks.
- **File browser** - browse and edit files, and click a file path in the terminal to open it.
- **System health** - see CPU, memory and disk use at a glance.
- **Snapshots and command history** - back up a folder and keep a local record of commands.
- **Themes** - pick a theme or your own colours and fonts; changes apply instantly.

Everything runs on your own computer. Nothing is sent to the internet or to an AI service.

![Terminal with split panes](docs/screenshots/terminal.png)

## Install

Download OmniTerm from the **[Releases page](https://github.com/zemmike/OmniTerm/releases)**.
Open the newest release, scroll down to **Assets**, and pick the file for your computer:

| Your computer                           | Download this file                   |
| --------------------------------------- | ------------------------------------ |
| Windows 10 or 11                        | `OmniTerm-<version>-win-x64.exe`     |
| Mac with Apple silicon (M1, M2, M3, M4) | `OmniTerm-<version>-mac-arm64.dmg`   |
| Mac with an Intel processor             | `OmniTerm-<version>-mac-x64.dmg`     |
| Linux: Debian or Ubuntu                 | `OmniTerm-<version>-amd64.deb`       |
| Linux: any other distribution           | `OmniTerm-<version>-x86_64.AppImage` |

> **"Unknown publisher" warning?** OmniTerm is not code-signed yet, so Windows and macOS
> will ask you to confirm the first time you open it. The steps below show how. Never
> turn off your system's security checks to do this.

<details>
<summary><b>Windows</b> (Windows 10 version 1809 or newer)</summary>

1. Double-click the `.exe` you downloaded.
2. If Windows says _Windows protected your PC_, click **More info**, then **Run anyway**.
3. Follow the installer. It installs for your account only and does not need an admin
   password.
4. Open OmniTerm from the **Start menu**.

No admin rights? Download the `win-x64.zip` instead, unzip it anywhere, and run
`OmniTerm.exe`.

**Uninstall:** Settings → Apps → Installed apps → OmniTerm → Uninstall.

</details>

<details>
<summary><b>macOS</b> (macOS 13 Ventura or newer)</summary>

1. Not sure which Mac you have? Apple menu → **About This Mac**. "Apple M1/M2/M3/M4"
   means Apple silicon; "Intel" means Intel.
2. Open the `.dmg` and drag **OmniTerm** onto **Applications**.
3. The first time only: right-click OmniTerm in Applications → **Open** → **Open**.
   (Or run `xattr -dr com.apple.quarantine /Applications/OmniTerm.app` in Terminal.)

**Uninstall:** drag OmniTerm to the Bin. To remove your settings too, delete
`~/Library/Application Support/OmniTerm`.

</details>

<details>
<summary><b>Linux</b></summary>

- **Debian / Ubuntu:** `sudo apt install ./OmniTerm-<version>-amd64.deb`
- **Fedora / openSUSE:** `sudo dnf install ./OmniTerm-<version>-x86_64.rpm`
- **Any distribution, no install:**
  `chmod +x OmniTerm-<version>-x86_64.AppImage` then `./OmniTerm-<version>-x86_64.AppImage`
- **Build from source:**
  `curl -fsSL https://raw.githubusercontent.com/zemmike/OmniTerm/main/install-linux.sh | bash`

After installing, you can start it by typing `omniterm`. Linux needs an X11 session; on
Wayland-only systems install XWayland (see [Troubleshooting](docs/TROUBLESHOOTING.md)).

</details>

More detail, including how to check that your download is genuine, is in the
**[install guide](docs/INSTALL.md)**.

## Getting started

1. Open OmniTerm. Press **Ctrl+Shift+T** to open a terminal tab.
2. Split the screen with **Ctrl+Shift+E** (side by side) or **Ctrl+Shift+O** (top and
   bottom).
3. Press **Ctrl+,** to open Settings and choose a theme, font and shortcuts.

OmniTerm uses your usual shell automatically: PowerShell on Windows, and your login shell
(zsh, bash, fish) on macOS and Linux.

## Reading AI answers with the AI Reader

Tools like Claude Code print their answers in the terminal, mixed with progress spinners,
commands and tool output. The **AI Reader** shows the same answer as a clean document,
like a page in Word or Google Docs.

1. Run your AI tool in a terminal pane, for example `claude`.
2. Click **AI Reader** in the terminal toolbar. A panel opens next to the terminal.
3. Use the two filters at the top:
   - **Answer only** - shows only the latest answer, without the run history before it.
   - **No noise** - hides spinners, timers, token counters and tool-call lines.

The reader also works when your AI tool runs inside a split-screen tool such as **tmux,
zellij, screen or herdr**. It reads only the pane you are typing in (the one with the
cursor), not the whole screen.

In the reader, **links** open in your browser and **file paths** open in the Files tab.
You can switch between a light and dark page, change the text size, and copy the text.

The reader only looks at what is already on screen. It never types into your terminal.

## Copy and paste

| To do this                       | Press                                                  |
| -------------------------------- | ------------------------------------------------------ |
| Copy selected text               | **Ctrl+C** (when text is selected) or **Ctrl+Shift+C** |
| Stop a running command           | **Ctrl+C** (when nothing is selected)                  |
| Paste                            | **Ctrl+V** or **Ctrl+Shift+V**                         |
| Select text in tmux, herdr, vim… | Hold **Shift** while dragging (**Option** on Mac)      |

When you paste several lines, or something that looks risky, OmniTerm shows it to you
first so you can confirm it. Programs such as tmux, herdr and vim can also copy text to
your clipboard.

## Useful shortcuts

| Action                        | Shortcut                    |
| ----------------------------- | --------------------------- |
| New tab / close tab           | Ctrl+Shift+T / Ctrl+W       |
| Next / previous tab           | Ctrl+Tab / Ctrl+Shift+Tab   |
| Split right / split down      | Ctrl+Shift+E / Ctrl+Shift+O |
| Close pane                    | Ctrl+Shift+W                |
| Move between panes            | Ctrl+Shift+Arrow keys       |
| Search the output             | Ctrl+Shift+F                |
| Clear the screen              | Ctrl+Shift+K                |
| Bigger / smaller / reset text | Ctrl+= / Ctrl+- / Ctrl+0    |
| Settings                      | Ctrl+,                      |

You can change any shortcut in **Settings**.

![Themes and settings](docs/screenshots/settings.png)

## Is it safe?

- OmniTerm runs commands as **you**, exactly like any other terminal, so it can reach the
  same files you can.
- It only listens on your own computer (`127.0.0.1`) and uses a new secret key each time
  it starts. **Do not expose its port to a network** or share that key.
- Snapshots are ordinary archives. They are **not encrypted**.

To report a security problem privately, see [SECURITY.md](SECURITY.md).

## Need help?

- **Something not working?** See [Troubleshooting](docs/TROUBLESHOOTING.md) for logs,
  where data is stored, and fixes for each platform.
- **Found a bug or have an idea?**
  [Open an issue](https://github.com/zemmike/OmniTerm/issues).
- **What changed in each version?** See the [changelog](CHANGELOG.md).

---

## For developers

<details>
<summary>Build, run and test from source</summary>

You need Git and Node.js 22.12 or newer (CI uses Node 24, pinned in `.nvmrc`). Building
`node-pty` may also need your platform's C/C++ build tools and Python.

```bash
git clone https://github.com/zemmike/OmniTerm.git
cd OmniTerm
npm ci
npm run dev             # web version at http://localhost:3000
npm run start:desktop   # desktop app
```

Build installers (run each on its own operating system):

```bash
npm run dist:linux
npm run dist:mac
npm run dist:win
```

Checks run by CI:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Native terminal checks: `npm run test:pty` (Linux/macOS) and `npm run test:pty:windows`.

**Platform notes.** Linux x64/arm64 builds `.deb`, AppImage and `.tar.gz` (plus RPM on
x64). macOS builds DMG and ZIP. Windows builds an installer and ZIP and needs ConPTY
(Windows 10 1809+); WSL and Git Bash discovery are not included yet. Linux is the most
established platform.

**More docs:** [contributing](CONTRIBUTING.md) ·
[theme integration](docs/THEME-INTEGRATION.md) · [performance](docs/PERFORMANCE.md) ·
[security model](SECURITY.md)

**Security design:** the backend binds to `127.0.0.1` and requires a per-launch token for
API and WebSocket access (the WebSocket also checks the page origin). Electron runs with
context isolation, sandboxing and no Node integration in the renderer.

</details>

## License

[MIT](LICENSE) © Michael (zemmike)
