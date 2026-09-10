# Security policy

## Reporting a vulnerability

Please report privately. Do not open a public issue for a security problem.

- Preferred: [private vulnerability reporting](https://github.com/zemmike/OmniTerm/security/advisories/new)
- Or email: zemuim@gmail.com

Please include the version (`omniterm --version`, or `dpkg -s omniterm`), what
you did, what happened, and the smallest reproduction you have. You will get an
acknowledgement within 72 hours. Anything rated high or critical gets a fix or a
documented mitigation within 30 days, and you are credited in the release notes
unless you ask not to be.

## Supported versions

Only the latest release receives security fixes. This project releases often and
security fixes ship as a patch release, so please confirm the problem still
reproduces on the newest tag before reporting.

## Threat model

OmniTerm runs a real shell, as your user, on your machine. That shapes what is
and is not a vulnerability here.

### In scope

- **Bypassing local API authentication.** The API binds `127.0.0.1` and requires
  the per-launch token in the `x-omniterm-token` header. Anything that gets a
  request to run a command without that token is a vulnerability — including
  reading the token out of the renderer and using it from a foreign page.
- **Cross-origin reach.** A page on another origin getting the API to answer:
  the `Host` and `Origin` headers are allowlisted to loopback to block DNS
  rebinding, and the CSP restricts what the renderer may load or connect to.
- **Path confusion in the file API.** Reading or writing outside the path the
  user asked for.
- **Injection through a non-terminal path.** The AI provider layer, the
  completion endpoint, backup paths, or the audit log — anywhere a value is
  interpolated into a command rather than passed as an argument.
- **Handing an unexpected scheme to the OS.** Links in terminal output are
  limited to `http`, `https` and `file` before they reach the operating system.
- **Sandbox escapes in the packaged app.** `contextIsolation`, the preload
  surface, and anything that gets renderer JavaScript to Node APIs.

### Out of scope

- Anyone who can already run code as your user, or who already has your shell.
  They do not need OmniTerm: the terminal is the feature.
- Commands you type yourself, and output produced by programs you run.
- Running destructive commands with `OMNITERM_READONLY` unset. That mode is an
  opt-in guard for the one-shot API, not a sandbox, and it is documented as such.
- Exposing the API beyond loopback yourself, for example by changing
  `OMNITERM_HOST` or port-forwarding it. The design assumes loopback only.
- Resource exhaustion caused by pasting a very large amount of text into your own
  terminal, or by a command you chose to run.

## What the app already does

- The API is **fail-closed**: with no token configured the server generates one
  and rejects unauthenticated requests, rather than allowing them.
- Requests must present the token (constant-time comparison) and pass the
  loopback `Host`/`Origin` allowlist.
- Unknown API routes answer a JSON 404 rather than falling through to the app
  shell.
- AI provider keys are write-only from the UI: stored `0600` under
  `~/.local/share/omniterm/`, never returned by the API, never logged.
- The command audit log lives at `0600` and rotates at 8 MB.
- No telemetry, no analytics, no network calls other than to the AI provider you
  configure, and to GitHub if you ask for release information.

## Dependencies

Dependabot opens weekly update pull requests for npm packages and GitHub
Actions. Minor and patch updates are grouped; runtime majors (notably Electron,
which carries Chromium and therefore most of the attack surface) are kept
separate because they need a packaging and install test before release — the CI
`Package` jobs and the `.deb` install check gate those.
