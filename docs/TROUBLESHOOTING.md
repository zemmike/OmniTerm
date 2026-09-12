# Troubleshooting OmniTerm

Real failure modes, what they look like, and what to do. If none of this helps,
[collect the diagnostics](#collecting-diagnostics-for-a-bug-report) and open an
issue — this document tells you exactly what to paste.

The supported platform matrix (what CI actually verifies, and what is
best-effort) lives in the [README](../README.md#supported-platforms).

- [The app does not start](#the-app-does-not-start)
- [`node-pty` is unavailable and the terminal does not open](#node-pty-is-unavailable-and-the-terminal-does-not-open)
- [A shell hangs at startup (zsh / `compinit`)](#a-shell-hangs-at-startup-zsh--compinit)
- [The API answers `401 unauthorized`](#the-api-answers-401-unauthorized)
- [Wayland rendering is wrong or the window is invisible](#wayland-rendering-is-wrong-or-the-window-is-invisible)
- [Where your data lives, and how to reset it](#where-your-data-lives-and-how-to-reset-it)
- [Collecting diagnostics for a bug report](#collecting-diagnostics-for-a-bug-report)

---

## The app does not start

**Symptom.** Nothing happens when you click the launcher, or the window flashes
and dies. Running `omniterm` in an existing terminal is the fastest way to see
the real error — Electron prints it to stderr.

**Most common cause: missing Electron runtime libraries.** A packaged Electron
app is not self-contained; it links against the system's GTK/NSS stack. The
`.deb` declares its dependencies, so `sudo apt install ./OmniTerm-<version>-amd64.deb`
pulls them in for you. If you installed with `dpkg -i` instead of `apt install`,
or you are running the **AppImage / `.tar.gz`**, nothing resolved those
dependencies for you.

The usual culprits on Debian/Ubuntu:

```bash
sudo apt install libgtk-3-0 libnss3 libasound2
```

The `.deb` itself declares `libgtk-3-0`, `libnss3`, `libnotify4`, `libxss1`,
`libxtst6`, `libatspi2.0-0`, `libsecret-1-0` and `xdg-utils`; `libasound2`
is usually already present, but the AppImage and the tarball pull in **none**
of these, which is why they are the builds that break first.

**Find out exactly what is missing:**

```bash
ldd /opt/OmniTerm/omniterm | grep 'not found'
```

Anything listed there is a package you do not have. (On a source checkout, run
`ldd node_modules/electron/dist/electron | grep 'not found'` instead.)

**If a previous install was interrupted:**

```bash
sudo apt --fix-broken install
```

**Other things worth checking:**

```bash
# Is apt actually on Ubuntu/Debian/Mint/Pop!_OS and the right architecture?
cat /etc/os-release
dpkg --print-architecture    # must match the artifact suffix: amd64 or arm64

# Does a display exist at all? The desktop app needs one; the headless API does not.
echo "$XDG_SESSION_TYPE $DISPLAY $WAYLAND_DISPLAY"
```

If `DISPLAY` and `WAYLAND_DISPLAY` are both empty, you are on a headless session
— the Electron window cannot open there. Run OmniTerm from a real desktop
session, or use the API only ([see the security notes](../SECURITY.md) — never
expose the port to a network).

Finally, read the log — it is written even when the window never appears:

```bash
tail -50 ~/.config/OmniTerm/omniterm.log
```

---

## `node-pty` is unavailable and the terminal does not open

**Symptom.** OmniTerm starts, the UI renders, but terminals do not open and the
status bar at the bottom of the Terminal tab reads:

```
terminal backend unavailable: <the loader's error message>
```

The same thing is in the log:

```
[OmniTerm] Terminal backend: node-pty UNAVAILABLE — <the loader's error message>
```

**This is a degradation, not a crash.** `node-pty` is a native module loaded
lazily and on purpose (see `pty.ts`): if the binding cannot be loaded, the app
records the error and keeps running. Only the terminal is gone — the Files,
System Health and Settings tabs, the audit trail and the rest of the API still
work. That is deliberate: a broken native binding should not take the whole app
down.

`/api/terminal/status` reports it too:

```json
{ "available": false, "error": "<the loader's error message>", "shell": "/bin/bash", "integration": "bash", "sessions": [] }
```

**What the error usually says, and what it means:**

| Message shape                                                    | Meaning                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Cannot find module 'node-pty'`                                   | The module is missing from the install (rare on a packaged build) |
| `... was compiled against a different Node.js version ...`        | `NODE_MODULE_VERSION` mismatch — a source build made for the wrong Node/Electron |
| `... cannot open shared object file ...` / `invalid ELF header`   | Architecture mismatch: an amd64 build on arm64 (or vice versa)    |

**Fixes**

- **Installed from a `.deb` / AppImage / tarball:** check the architecture
  matches — `dpkg --print-architecture` must be `amd64` or `arm64` to match the
  artifact name, and `uname -m` must agree. A wrong-architecture package is the
  most common cause on a packaged install.
- **Building from source:** rebuild the native module against the Electron
  version you are running:

  ```bash
  npm ci
  npm run rebuild:native      # electron-rebuild -f -w node-pty
  ```

  This matters because `node-pty` is compiled for a specific Electron ABI, not
  the system Node. Re-run it after any change to the `electron` version.
- Then confirm the loader is happy:

  ```bash
  npm run test:pty            # node-pty smoke test: prompt, aliases, Ctrl+C
  ```

If the error persists, include its exact text in your bug report — it is the
single most useful line you can give us.

---

## A shell hangs at startup (zsh / `compinit`)

**Symptom.** A new tab opens and the shell never prints a prompt. If you look
carefully at the top of the tab, you may see a question sitting there:

```
Ignore insecure directories and continue [y] or abort compinit [n]?
```

**What is happening.** On Debian and Ubuntu, `/etc/zsh/zshrc` runs `compinit`
for interactive shells. When `compinit` finds an `fpath` directory that is
group- or world-writable it stops and asks that question — which is fine in a
regular terminal and fatal in a brand-new one, because the question arrives
before you have a prompt and the shell simply waits.

**Getting out of it, right now.** The prompt is a real prompt; the shell is
listening.

1. Type `y` and press Enter (or `n`), and you are back at a shell.
2. If that does not take, press **Ctrl+C** to abort the current line, or open a
   second tab with a working shell (`Ctrl+T`, or set `SHELL=/bin/bash omniterm`).

**Fixing it properly.** OmniTerm already defends against this class of problem:
for zsh it generates its own `~/.local/share/omniterm/zdotdir/` whose `.zshenv`
exports `ZSH_DISABLE_COMPFIX=true` and sets `skip_global_compinit=1`, skips the
global `compinit`, and initialises completions itself with `compinit -i` only if
your own config did not. If you are still being asked, something in your
configuration is running `compinit` without `-i` before OmniTerm's hooks.

- Find the offending directories:

  ```bash
  zsh -c 'autoload -Uz compaudit; compaudit'
  ```

  Then either fix the permissions (`chmod go-w` on the offending directories) or
  add `export ZSH_DISABLE_COMPFIX=true` to your own `~/.zshenv`.
- The generated integration files are safe to delete; OmniTerm regenerates them
  on the next launch:

  ```bash
  rm -rf ~/.local/share/omniterm/zdotdir ~/.local/share/omniterm/shell-integration.bash
  ```

  (Use `OMNITERM_DATA_DIR` if you moved the data directory.)

The same shape of problem can come from any shell whose startup file blocks on
input — a `read` waiting for a keypress, a prompt from a completion helper, a
`gpg` passphrase ask. The fix is the same: get to a shell, then make that
startup file non-interactive. OmniTerm cannot and does not answer prompts on
your behalf.

---

## The API answers `401 unauthorized`

**Symptom.** You `curl` the local API and get:

```json
{ "error": "Unauthorized: missing or invalid OmniTerm session token." }
```

**What it means.** The API binds `127.0.0.1` and requires a per-launch session
token on every request, sent as the `x-omniterm-token` header (or `?token=`).
A `401` is not a bug — it is the API working. You are either not sending the
token or sending a **stale** one: the token is generated fresh on every launch
unless you set `OMNITERM_TOKEN` yourself, so a token you copied yesterday is
dead today.

**Where to find the current token.** If no `OMNITERM_TOKEN` was set, the app
generates one and prints it at startup:

```
[OmniTerm] No OMNITERM_TOKEN was set, so one was generated for this run: <token>
[OmniTerm] Send it as the x-omniterm-token header; the API rejects requests without it.
```

Both lines are in the log, with the port the API chose:

```bash
grep -E 'Local API ready|generated for this run' ~/.config/OmniTerm/omniterm.log | tail -5
```

**Using it:**

```bash
PORT=12345                     # from "Local API ready on http://127.0.0.1:<port>"
TOKEN=<the token from the log>

curl -s -H "x-omniterm-token: $TOKEN" "http://127.0.0.1:$PORT/api/terminal/status"
```

**If you want a stable token** (for a script, or to stop re-reading the log):

```bash
OMNITERM_TOKEN=my-token omniterm
```

Note that this is a **secret**: anyone who can read it can run commands as you.
Do not put it in a shared file, and never expose the port beyond loopback —
`SECURITY.md` spells out the threat model.

**Related:** a `403 Forbidden: origin ... is not allowed.` is a different thing —
the `Origin` header came from a non-loopback page, which is the anti-DNS-rebinding
allowlist doing its job. Send requests without a foreign `Origin`.

---

## Wayland rendering is wrong or the window is invisible

**First, the honest position:** OmniTerm's verified display server is **X11**.
Wayland is **untested** — there is no CI coverage, no smoke test, and no claim of
support. On a Wayland session the app normally runs through XWayland
(`XDG_SESSION_TYPE=wayland`), which is also untested but frequently fine.

**Symptoms reported for Electron apps on Wayland** (any of these may apply to
OmniTerm): a black or blank window, a window that will not resize, blurry or
mismatched font rendering, no window at all under a compositor, or a click that
lands in the wrong place.

**Things you can try. These are untested suggestions, not supported
instructions** — we have not verified any of them, and we would genuinely like a
report telling us which one worked.

- Let Chromium pick the backend itself instead of being pinned to one:

  ```bash
  omniterm --ozone-platform-hint=auto
  ```

  Electron passes unknown flags through to Chromium, so this reaches the
  platform hint. The equivalent via the environment is
  `ELECTRON_OZONE_PLATFORM_HINT=auto omniterm` — equally untested.
- Force the verified path by running omniterm in an X11 session (log out and
  choose "X11" or "Xorg" on the login screen). That is the configuration CI
  exists to support.
- If it is a GPU/compositor problem rather than an input problem,
  `omniterm --disable-gpu` is the usual first bisect. Again: untested here.

When you report a Wayland problem, please say whether the flag changed anything
— a confirmed working flag is how this row of the support matrix stops saying
"untested".

---

## Where your data lives, and how to reset it

**Application data** — audit trail, snapshots, and the generated shell
integration:

```
~/.local/share/omniterm/              # or $OMNITERM_DATA_DIR
├── activity.jsonl                    # the command audit trail (mode 0600)
├── activity.jsonl.1                  # one rotated generation (default threshold 8 MB)
├── backups/                          # snapshot .tar.gz archives
├── zdotdir/                          # generated zsh integration (safe to delete)
├── shell-integration.bash            # generated bash rc (safe to delete)
└── ai-config.json                    # legacy, ≤1.6.x only — no longer read or
                                      # written; you can delete it
```

**Logs** live somewhere else:

```
~/.config/OmniTerm/omniterm.log       # app startup log and errors
```

**Environment overrides:** `OMNITERM_DATA_DIR` (whole data directory),
`OMNITERM_BACKUP_DIR` (snapshots only), `OMNITERM_AUDIT_MAX_BYTES` (rotation
threshold, default 8 MB). With nothing set you get the paths above.

**To reset everything OmniTerm keeps:** quit the app first, then move the
directory aside rather than deleting it — the audit trail is your record of what
ran, and it is the one thing here you cannot regenerate:

```bash
# 1. Quit OmniTerm completely.

# 2. Keep a copy (recommended), then start fresh:
mv ~/.local/share/omniterm ~/.local/share/omniterm.bak

# 3. Relaunch. OmniTerm recreates the directory and the shell integration on
#    the next session.
```

**To reset only the shell integration** (keeps your audit trail and snapshots):

```bash
rm -rf ~/.local/share/omniterm/zdotdir ~/.local/share/omniterm/shell-integration.bash
```

**To reset only the UI settings** (theme, colours, font, keybindings): they are
stored in the renderer's `localStorage`, not on disk in the data directory.
Open **Settings** (`Ctrl+,`) and reset the individual bindings, or clear the
app's site data to drop all of them at once.

**To remove absolutely everything:** uninstall with `sudo apt remove omniterm`,
then delete the two directories above. The package does not ship a purge hook
that touches your data, on purpose.

---

## Collecting diagnostics for a bug report

Paste the output of these into the issue. It is short, it is the difference
between a report we can act on and one we cannot, and none of it is sensitive —
**except the token, which you must redact**.

```bash
# 1. Version (the packaged build is the authoritative one)
dpkg -s omniterm | grep -E '^(Package|Version|Status)'

# 2. Distribution and architecture
cat /etc/os-release | head -3
uname -m; dpkg --print-architecture

# 3. Display server
echo "session=$XDG_SESSION_TYPE display=$DISPLAY wayland=$WAYLAND_DISPLAY"
loginctl show-session "$(loginctl | awk '/'"$USER"'/{print $1; exit}')" -p Type 2>/dev/null

# 4. Your shell
echo "$SHELL"; "$SHELL" --version 2>&1 | head -2

# 5. Is the PTY backend available? (the answer is in the log)
grep -E 'Terminal backend|node-pty' ~/.config/OmniTerm/omniterm.log | tail -3

# 6. Recent log lines
tail -60 ~/.config/OmniTerm/omniterm.log
```

**How to tell whether the PTY is available** for the yes/no box in the bug
template: `Terminal backend: node-pty ready` means **yes**;
`Terminal backend: node-pty UNAVAILABLE — <error>` means **no** (and the error
text is the part we need). If the app is running, `/api/terminal/status` reports
the same thing as a JSON `available` boolean — see
[the 401 section](#the-api-answers-401-unauthorized) for how to call it.

> **Redact before you paste.** The log contains the per-launch session token
> (`... one was generated for this run: <token>`), and the audit trail and log
> can both contain command lines, file paths and hostnames from your machine.
> Replace the token with `<redacted>` and remove anything else you would not
> post publicly. A report with a redacted token is worth ten times one with a
> live token that we have to close.

For a security problem, **do not open an issue** — use the private reporting
route in [SECURITY.md](../SECURITY.md).
