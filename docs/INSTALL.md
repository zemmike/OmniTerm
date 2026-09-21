# Installing OmniTerm

OmniTerm is a desktop app: you download a file, open it once, and it runs a real shell on
your own machine. Nothing to configure, no account, no cloud.

This page is the long version, with every click. If you just want the file names, the
[README](../README.md#install) has the short version.

- [Which file do I need?](#which-file-do-i-need)
- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
- [Verify your download](#verify-your-download)
- [Where your settings and logs live](#where-your-settings-and-logs-live)
- [If something goes wrong](#if-something-goes-wrong)

## Which file do I need?

Every release is published on the
[Releases page](https://github.com/zemmike/OmniTerm/releases). Open the newest release and
find the **Assets** section - a list of files below the release notes. Download the line
that matches your computer:

| Your computer                            | Download                           |
| ---------------------------------------- | ---------------------------------- |
| Windows 10 or 11, 64-bit                 | `OmniTerm-<version>-win-x64.exe`   |
| Mac with Apple silicon (M1, M2, M3, M4)  | `OmniTerm-<version>-mac-arm64.dmg` |
| Mac with an Intel processor              | `OmniTerm-<version>-mac-x64.dmg`   |
| Linux, Debian or Ubuntu                  | `OmniTerm-<version>-amd64.deb`     |
| Linux, any distribution, no install      | `OmniTerm-<version>-x86_64.AppImage` |

`<version>` is the release's version number, for example `OmniTerm-1.14.0-win-x64.exe`.

Every release also ships a `SHA256SUMS` file, so you can check a download before running
it - see [Verify your download](#verify-your-download).

**How to tell which Mac you have:** click the  menu, then **About This Mac**. If the Chip
line says "Apple M1", "M2", "M3" or "M4", you have Apple silicon. If it says "Intel", you
have an Intel Mac. All Macs sold since late 2020 are Apple silicon.

**How to tell your Windows version:** press **Windows key + R**, type `winver`, press
Enter. You need version 1809 (October 2018) or newer - every supported Windows 10 and 11
build qualifies.

## Windows

### What you need

- Windows 10 version 1809 or newer, 64-bit (Windows 11 is fine)
- About 500 MB of free disk space
- No administrator password: the installer installs for your user only

### Install, step by step

1. On the release page, under **Assets**, click `OmniTerm-<version>-win-x64.exe`. The file
   lands in your **Downloads** folder.
2. Open **Downloads** in File Explorer and double-click the file.
3. Windows shows a blue box: _Windows protected your PC_. This appears because the
   installer is not code-signed yet, not because something is wrong with the file.
   - Click **More info**, then the **Run anyway** button that appears.
   - If you would rather check the file first, use
     [Verify your download](#verify-your-download) before step 2.
   - Do **not** turn off SmartScreen or your antivirus.
4. The installer runs without questions and finishes in a few seconds. There is no
   "Next, Next, Finish": it is a one-click install for your user account.
5. Open the **Start menu**, type `OmniTerm`, and press Enter. A terminal window appears.
6. Open a first terminal tab with **Ctrl+Shift+T**, and start typing commands. OmniTerm
   uses PowerShell 7 (`pwsh.exe`) if you have it, then Windows PowerShell, then `cmd.exe`.

### Prefer not to install anything?

Download `OmniTerm-<version>-win-x64.zip` instead, right-click it → **Extract All**, and
run `OmniTerm.exe` from the extracted folder. Same app, no installer, no Start-menu entry.

### Check which version you are running

Open PowerShell and run (adjust the path if you installed elsewhere):

```powershell
& "$env:LOCALAPPDATA\Programs\OmniTerm\OmniTerm.exe" --omniterm-version
```

The installer's default location is `%LOCALAPPDATA%\Programs\OmniTerm`.

### Uninstall

**Settings → Apps → Installed apps → OmniTerm → Uninstall**. Your settings and logs stay in
`%APPDATA%\OmniTerm`; delete that folder too if you want them gone.

## macOS

### What you need

- **macOS 13 Ventura or newer.** Electron 44, the framework OmniTerm is built on, requires
  macOS 13 - macOS 12 Monterey and older cannot run it.
- An Apple silicon or Intel Mac (there is a download for each)
- About 600 MB of free disk space

### Install, step by step

1. On the release page, under **Assets**, click the DMG for your Mac:
   `OmniTerm-<version>-mac-arm64.dmg` for Apple silicon or
   `OmniTerm-<version>-mac-x64.dmg` for Intel.
2. Open **Downloads** in Finder and double-click the `.dmg`. A window opens with the
   OmniTerm icon on the left and an **Applications** folder shortcut on the right.
3. Drag **OmniTerm** onto the **Applications** shortcut and wait for the copy to finish.
4. Close that window, then eject the disk image: click the ⏏ button next to "OmniTerm" in
   the Finder sidebar, or right-click it on the desktop → **Eject**.
5. Open **Applications** and double-click **OmniTerm**.

### The first-launch block, explained

On the first launch macOS shows a dialog saying OmniTerm cannot be opened because Apple
cannot check it for malicious software. That is Gatekeeper, and it appears because these
builds are **not notarised** yet (notarisation requires a paid Apple Developer account).
You have two ways past it, both one-time:

- **Right-click route:** in Applications, right-click (or Control-click) **OmniTerm** →
  **Open** → in the dialog click **Open** again. After this, double-clicking works normally.
- **Terminal route:** run

  ```bash
  xattr -dr com.apple.quarantine /Applications/OmniTerm.app
  ```

  then open OmniTerm normally.

Do **not** disable Gatekeeper system-wide, and do not run the app with `sudo`.

### Which shell it uses

OmniTerm starts your login shell: `$SHELL` if it is set, otherwise `/bin/zsh`. To check
what that resolves to, run `echo "$SHELL"` in Terminal. macOS may separately ask for
permission when OmniTerm reads a protected folder such as Desktop, Documents or Downloads -
grant only the folder you actually want to browse.

### Check which version you are running

```bash
/Applications/OmniTerm.app/Contents/MacOS/OmniTerm --omniterm-version
```

### Uninstall

Drag **OmniTerm** from Applications to the Bin. Your settings and logs stay in
`~/Library/Application Support/OmniTerm`; delete that folder too if you want them gone.

## Linux

1. **Debian/Ubuntu:** download `OmniTerm-<version>-amd64.deb` and run
   `sudo apt install ./OmniTerm-<version>-amd64.deb`
2. **Any distribution, no install:** download `OmniTerm-<version>-x86_64.AppImage`, then
   `chmod +x OmniTerm-<version>-x86_64.AppImage` and run it
3. **Fedora/openSUSE:** `sudo dnf install ./OmniTerm-<version>-x86_64.rpm`
4. **From source:** `curl -fsSL https://raw.githubusercontent.com/zemmike/OmniTerm/main/install-linux.sh | bash`

Afterwards `omniterm` is on your `PATH`, and `omniterm --version` prints the version
without opening a window. A plain `.tar.gz` is published for everything else.

Linux needs an X11 session. On a Wayland-only desktop, install XWayland - see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Verify your download

Every release ships a `SHA256SUMS` file listing the SHA-256 hash of each asset. Download
that file into the same folder as the file you downloaded, then compare:

**Linux**

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

**macOS** (uses `shasum`, which is `sha256sum`'s equivalent)

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
```

**Windows, PowerShell**

```powershell
Get-FileHash .\OmniTerm-<version>-win-x64.exe -Algorithm SHA256
```

Compare the printed hash with the matching line in `SHA256SUMS`. If they differ, do not run
the file: download it again, and open an issue if it keeps happening.

The output for a good file looks like this:

```
OmniTerm-1.14.0-amd64.deb: OK
```

## Where your settings and logs live

| Platform | Folder                                             |
| -------- | -------------------------------------------------- |
| Linux    | `~/.local/share/omniterm`                          |
| macOS    | `~/Library/Application Support/OmniTerm`            |
| Windows  | `%APPDATA%\OmniTerm`                               |

A startup log is written to `omniterm.log` in that folder, which is the first thing to look
at if the app fails to start. Deleting the folder resets OmniTerm to defaults.

## If something goes wrong

- **Windows: no shell starts, or the window is empty.** OmniTerm needs Windows 10 1809 or
  newer for ConPTY, and looks for `pwsh.exe`, then `powershell.exe`, then `cmd.exe`.
  Check what is available with
  `Get-Command pwsh.exe,powershell.exe,cmd.exe -ErrorAction SilentlyContinue`.
- **macOS: "OmniTerm.app is damaged and can't be opened".** The quarantine flag was not
  cleared. Run the `xattr` command above.
- **Linux: the app will not start on Wayland.** Install XWayland, or launch with
  `--enable-features=UseOzonePlatform --ozone-platform=wayland` and expect an unverified
  GPU path.

More symptoms are covered in [TROUBLESHOOTING.md](TROUBLESHOOTING.md), including what to
paste into a bug report.

## A note on signing

The macOS and Windows builds are **not signed or notarised** yet, which is why both
platforms show a security warning on first launch. That is a deliberate, stated limitation
rather than something you should work around by weakening your own protections. Linux
packages are unaffected.
