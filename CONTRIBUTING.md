# Contributing to OmniTerm

Thanks for looking. This document is the shortest path from a clone to a merged
pull request: how to set up, which commands actually matter, what CI will check
before it lets you in, and the handful of rules that are not open for debate.

By contributing you agree your work is licensed under the project's
[MIT Licence](LICENSE).

- [Setup](#setup)
- [The commands that matter](#the-commands-that-matter)
- [What CI enforces, and where](#what-ci-enforces-and-where)
- [Non-negotiable rules](#non-negotiable-rules)
- [Adding an API route](#adding-an-api-route)
- [Adding a UI component](#adding-a-ui-component)
- [Reporting bugs and requesting features](#reporting-bugs-and-requesting-features)

---

## Setup

```bash
git clone https://github.com/zemmike/OmniTerm.git
cd OmniTerm

# Node 24 — this is what .nvmrc pins and what CI runs.
nvm install && nvm use          # or: fnm use / asdf install nodejs

npm ci                          # not `npm install`: lockfile-exact, like CI
npm run build                   # frontend + backend bundle into dist/
npm run dev                     # Express + Vite dev server on http://localhost:3000
```

`engines.node` is `>=22.12.0`, but **use 24**. The accessibility suite pulls in
jsdom, which requires newer Node than the floor, and the whole point of
`.nvmrc` is that "works on my machine" and CI agree.

**`node-pty` is a native module compiled against Electron's ABI**, not the
system Node. If a shell will not open, or the terminal backend reports
unavailable, rebuild it:

```bash
npm run rebuild:native          # electron-rebuild -f -w node-pty
```

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for what a failed native
load looks like (the app degrades to "PTY unavailable" rather than crashing —
that is intentional and must stay that way).

**System dependencies for development on Debian/Ubuntu:**

```bash
sudo apt install libgtk-3-0 libnss3 libxss1 libxtst6 libatspi2.0-0 \
  libsecret-1-0 xdg-utils zsh fish
```

`zsh` and `fish` are not optional extras — the shell integration matrix runs
against every shell that is installed, and CI installs both so all four shells
(bash, zsh, fish, dash) are actually exercised. If you do not have them
locally, you are not testing what CI tests.

---

## The commands that matter

| Command                     | What it does                                                                 |
| --------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`               | Express + Vite dev server on `http://localhost:3000` (backend serves the UI) |
| `npm run build`             | `vite build` + esbuild bundle of `server.ts` into `dist/`                    |
| `npm test`                  | vitest: the API suites and the accessibility suite                           |
| `npm run lint`              | eslint (not `tsc` — that is `typecheck`)                                     |
| `npm run typecheck`         | `tsc --noEmit`                                                               |
| `npm run format:check`      | Prettier, check-only (use `npm run format` to write)                         |
| `npm run test:pty`          | node-pty smoke test: prompt, aliases, Ctrl+C                                 |
| `npm run test:pty-matrix`   | the shell integration matrix (bash, zsh, fish, dash)                         |
| `npm run test:pty-socket`   | one shell end to end over the token-guarded WebSocket                        |
| `npm run test:pty-features` | prefix history and command durations over the socket                         |
| `npm run test:coverage`     | `npm test` plus coverage for both halves (frontend **and** `server.ts`)      |
| `npm run rebuild:native`    | rebuild `node-pty` against the current Electron                              |

**Before you open a pull request, run at least:**

```bash
npm run typecheck && npm run lint && npm run format:check
npm run build          # the API suites need dist/server.cjs to exist
npm test
npm run test:pty
```

Two notes that save time:

- **`npm test` needs a build.** The API suites boot the _real bundled
  `dist/server.cjs`_ as a child process — nothing is mocked. If the bundle is
  stale, you are testing stale code. `npm run build` first.
- **Coverage has two halves.** The frontend is measured in-process; `server.ts`
  and `pty.ts` run in a child process, so they are measured via `NODE_V8_COVERAGE`
  and mapped back through esbuild's source map into `coverage/backend/`. Both are
  uploaded as CI artifacts on every run.

---

## What CI enforces, and where

Three jobs in `.github/workflows/build.yml`, on every push to `main` and every
pull request:

### 1. `typecheck` — "Lint, types and formatting"

Three separate gates, because a single "lint" step that only ran `tsc` proved
nothing:

| Step       | Command                |
| ---------- | ---------------------- |
| Type check | `npm run typecheck`    |
| Lint       | `npm run lint`         |
| Formatting | `npm run format:check` |

### 2. `test` — "Tests (terminal + API)" (needs `typecheck`)

| Step                                | What it proves                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| installs `zsh` and `fish`           | the matrix has all four shells to run against                                                                               |
| `npm run build`                     | frontend + backend bundle                                                                                                   |
| `npm run test:pty`                  | node-pty really works: prompt, aliases from the user's config, Ctrl+C                                                       |
| `bash scripts/shell-matrix-test.sh` | bash, zsh, fish and dash each get a real server and a real session; prompt, a user alias, Ctrl+C, audit entry and exit code |
| `scripts/pty-features-test.cjs`     | prefix history and per-command durations over the live socket                                                               |
| `npm run test:coverage`             | the vitest suites, with coverage for both halves                                                                            |
| uploads `coverage/` (always)        | the reports from the run, kept 7 days                                                                                       |

The matrix is written to be **exit-code honest**: bash, zsh and fish must report
exit codes (integration expected), dash must _not_ claim to (integration
expected to be `0`/none). A change that makes dash pretend to know an exit code
fails CI, and should.

### 3. `package` — "Package (x64 / arm64)" (needs `typecheck`)

| Arch    | Targets built             | Verification                                                                                                       |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `x64`   | `deb AppImage tar.gz rpm` | the produced `.deb` is installed with apt on the runner, then `omniterm` on PATH and the desktop entry are checked |
| `arm64` | `deb tar.gz`              | build only — no runner installs the arm64 package                                                                  |

This is why the [support matrix](README.md#supported-platforms) says what it
says: x64 `.deb` install is verified, arm64 `.deb` and every other artifact are
built but not smoke-tested. If you want a platform row to say more, add the CI
step that verifies it — not a README claim.

### Other workflows

| Workflow                                | Trigger              | What it enforces                                                                                                                                                 |
| --------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `security.yml` — secret scan (gitleaks) | every pull request   | no secrets in the commits a PR adds, with the repo's config in `.github/gitleaks.toml`                                                                           |
| `security.yml` — dependency review      | every pull request   | fails on **high** and critical advisories introduced by the PR                                                                                                   |
| `artifact-e2e.yml`                      | nightly + manual     | installs the **published** `.deb` on a clean Ubuntu 24.04, launches it under `xvfb-run`, drives the real API, then uninstalls and checks nothing was left behind |
| `release.yml`                           | `v*` tag (or manual) | builds and publishes every artifact, then generates and verifies `SHA256SUMS` over all of them                                                                   |

`artifact-e2e.yml` is the reason a packaging regression gets caught without a
user reporting it: it exercises the artifact that was actually shipped, not the
one this branch just built.

**Do not edit `.github/workflows/**` in a feature pull request.** Workflow
changes need their own PR with a reason, because they change what "passing"
means for everyone else.

---

## Non-negotiable rules

These are the rules a pull request will be closed for breaking. They are not
style preferences.

### 1. Never weaken the security boundary

OmniTerm runs a real shell as your user. The following are load-bearing and a
change that weakens any of them is rejected on sight:

- **Token auth.** Every `/api` request carries `x-omniterm-token`, compared in
  constant time. No route may be added outside the authenticated `/api` router.
  No "temporarily allow unauthenticated" branch. No token in a URL that gets
  logged.
- **Host / Origin allowlist.** Loopback-only, with `Host` and `Origin` checked to
  block DNS rebinding. Do not widen it, and do not special-case an origin.
- **CSP.** The `Content-Security-Policy` in `server.ts` is deliberately strict.
  Do not add `unsafe-eval`, do not loosen `script-src`, do not add a remote
  origin to `connect-src`.
- **Electron sandbox.** The renderer stays sandboxed with `contextIsolation` and
  no Node integration. New renderer→main capability goes through the `preload.cjs`
  bridge with a specific, validated IPC channel — never a generic `ipcRenderer`
  passthrough.

If your feature needs one of these relaxed, that is a discussion in an issue
first, with a threat model — not a line in a diff.

### 2. No simulated terminal output

**Never fabricate terminal output, exit codes, metrics or logs.** If a value
cannot be read from this machine, the correct behaviour is to show nothing and
say why — a blank exit code for a shell that cannot report one, "PTY
unavailable" for a broken native binding. A placeholder that looks real is a bug,
not a mock-up. This is why the frontend/plugin mock-ups were deleted rather than
decorated.

### 3. Treat everything as untrusted input

- **File paths.** Resolve and validate before use; never interpolate a
  user-supplied path into a shell command. Pass arguments, not concatenated
  strings. Path traversal out of the requested directory is a security bug.
- **API input.** Validate bodies and query parameters at the route boundary, and
  reject rather than coerce. `OMNITERM_READONLY` exists and must keep working.
- **AI output.** There is currently **no AI anywhere in this project** — AI
  assistance was removed in 1.7.0 and there are no provider routes, config or
  keys. The rule stands anyway, in two directions: any code you write with an
  assistant is your code and your responsibility to verify (do not commit a
  plausible-looking diff you have not run), and if model output is ever
  introduced into the app it is untrusted input like any other, never something
  to hand to a shell.

### 4. Honest docs

If a feature is best-effort, untested or platform-specific, the README and the
docs say exactly that. Do not upgrade a claim because the code "should" work.
CI is the standard for "fully supported".

---

## Adding an API route

**All routes live in `server.ts`, inside the authenticated `/api` router.** The
token middleware is mounted on that router; a route registered on the bare
`app` bypasses authentication and will be rejected.

1. **Add the route to the `/api` router** in `server.ts`. Pattern:

   ```ts
   app.get('/api/your-thing', async (req, res) => {
     // validate inputs; return 400 on anything that does not parse
     // run the real command / read the real file — no placeholders
     res.json({/* real values */});
   });
   ```

2. **Return real errors.** A failure is a non-2xx status with a JSON `{ error }`
   body. Never swallow an error and return an empty success.

3. **Do not log secrets.** Values that reach a command line or the audit trail
   must be safe to write to `activity.jsonl` (mode 0600, on the user's disk).

4. **Document it if it is public.** `/api/api-docs` documents a subset of the
   surface on purpose — add your route there when it is meant to be used by
   anything other than the UI, and be accurate about what it does.

5. **Test it, hitting the real server.** `tests/api.test.ts` and
   `tests/api-coverage.test.ts` boot `dist/server.cjs` as a child process with a
   fixed token and a temp `$HOME` (see `tests/helpers/server.ts`) — nothing is
   mocked. A new route should come with a test that asserts the real status code
   and body, and the 401 path when the token is missing.

   ```bash
   npm run build && npm run test:api
   ```

Useful helpers already exist: `api()`, `postJson()`, `TOKEN`, `TOKEN_HEADER` and
`startServer()` in `tests/helpers/server.ts`.

---

## Adding a UI component

**Every new UI component must come with an accessibility test that runs axe
against it.** This is a hard requirement, not a nice-to-have: the accessibility
suite exists because the app is a terminal, and a terminal that screen readers
cannot navigate is broken for the people who most need a terminal.

1. **Build the component** under `src/components/`, using semantic HTML first —
   real `button`s, real `role`s, labels bound to inputs, `aria-hidden` on
   decorative icons (the existing components are good examples).

2. **Add a test to `tests/a11y.test.tsx`**, in the existing style:

   ```tsx
   describe('YourView', () => {
     it('renders its populated state and has no violations', async () => {
       const { container } = render(<YourView />);
       const results = await audit(container, 'YourView');
       expect(results).toHaveNoViolations();
     });
   });
   ```

   Also cover the interesting _states_ — an open modal, a recording state, an
   empty list — the way the existing `SettingsView`, `FileManagerView` and
   `ServerHealthView` blocks do.

3. **Make the render populated, not empty.** An axe run against an empty shell
   proves nothing. The suite stubs `fetch` in `tests/helpers/a11y-api.ts` with
   the JSON shapes the components actually read (taken from `server.ts`, not
   invented). If your component calls a new endpoint, add its fixture there: the
   stub records unmatched requests and the suite asserts that list is empty, so a
   forgotten fixture fails loudly instead of quietly rendering an error state.

4. **If axe reports a violation, fix the component.** Do not add a rule
   exclusion to make the suite pass. The suite also tests its own guard with
   deliberately broken fixtures — the guard is expected to fail on those.

5. Run it:

   ```bash
   npm test                    # includes the a11y suite
   npm run test:coverage       # same, plus coverage
   ```

Accessibility is one of the things the release notes talk about, so an a11y
regression is a visible regression.

---

## Reporting bugs and requesting features

- **Bug:** use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
  It asks for version, distro, display server, shell, PTY availability and
  redacted logs — all of which are in
  [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#collecting-diagnostics-for-a-bug-report),
  with the commands to collect them.
- **Feature:** use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).
  Lead with the problem. "Make it do X" is much harder to act on than "here is
  what I cannot do today".
- **Security problem: do not open an issue.** Follow
  [SECURITY.md](SECURITY.md) and report it privately.

Pull requests use the [template](.github/PULL_REQUEST_TEMPLATE.md) — say what
changed and why, which gates you actually ran, and what the security and
accessibility impact is.
