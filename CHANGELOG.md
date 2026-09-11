# Changelog

All notable changes to OmniTerm are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.5] - 2026-09-11

### Fixed
- CI now runs on the Node version the toolchain actually requires. 1.6.3 pinned
  Node 20 because that is Electron 38's build floor, but the test stack needs more:
  vitest 5 requires `^22.12`, jsdom 30 requires `^22.22.2 || ^24.15`, and undici,
  whatwg-url and `@electron/rebuild` all ask for 22+ as well. The runner's Node
  20.20 could not even start the accessibility suite
  (`webidl.util.markAsUncloneable is not a function`), and `npm ci` printed about a
  dozen EBADENGINE warnings that were a warning we ignored for too long.
  `.nvmrc` now pins 24 (which is what CI uses), `engines.node` is `>=22.12.0`, and
  both workflows use Node 24 — so "works on my machine" and CI are the same Node.
  The accessibility suite is the canary: it is the only part of the test stack that
  needs a DOM, and it caught this the first time CI ran it.


## [1.6.4] - 2026-09-11

### Added
- A second HTTP test suite (31 tests) covering the 16 endpoints the first one never
  touched, including the security-relevant ones: `/api/security`, `/api/alerts` and
  `mark-read`, `/api/audit/export`, `/api/ai/test`, `POST /api/ai/settings`
  (asserting the API key is never echoed), `POST /api/files/save`, `/api/toolchain`,
  `/api/terminal/status|sessions|kill` and `/api/api-docs`. Endpoint coverage went
  from 12 of 28 routes to 28 of 28; the suite is 79 tests in three files.
- An accessibility regression suite (26 tests): HeaderNavbar (tablist, theme menu,
  alerts drawer), SettingsView (colour pickers, shortcut recording),
  FileManagerView (listing, editor, create-file modal) and ServerHealthView are
  rendered against stubbed API responses and checked with axe. Four deliberately
  broken fixtures prove the guard actually fails. TerminalPane is excluded on
  purpose: jsdom has no canvas, and pretending otherwise would be a fake pass.
- Coverage, via `npm run test:coverage`, reported in two halves and published as a
  CI artifact: in-process for the components the suites load, and the backend via
  `NODE_V8_COVERAGE` on the child process mapped back through the source map.
  `server.ts` went from 68.6% to 83.7% of statements, `ai-provider.ts` from 52.1%
  to 73.6%.

### Fixed
- `POST /api/files/save` no longer leaks a temp file when the write fails, and a
  directory target answers 400 instead of 500. Both were real: the write went
  ahead, failed at the rename, and left `<target>.omniterm-<pid>.tmp` behind.
  There is now a regression guard asserting no stray temp file.
- The version the app reports about itself is read from `package.json`. `/api/env`
  advertised `1.0.0` and `/api/api-docs` `2.4.0` on a 1.6.x build.
- `allowScripts` covers `node-pty@1.1.0`, whose `node-gyp rebuild` produces the
  native binding the terminal needs — on a fresh clone with scripts gated, PTY
  startup failed. `electron-winstaller` is explicitly denied instead of left
  unmentioned; it is a Windows-installer tool this project never runs.

### Changed
- Dependabot's vite group also carries `esbuild`: vite 8 needs esbuild >= 0.27 and
  the project pins 0.25, so a lone vite bump could not install.
- The build workflow's concurrency group is keyed by ref *and* event. Dependabot
  runs its update job on `refs/heads/main`, so keyed on the ref alone it cancelled
  the build of the push before it.


## [1.6.3] - 2026-09-10

### Added
- ESLint 9 (flat config, with `typescript-eslint` and `react-hooks`) and Prettier,
  plus an `.editorconfig`. The rules that matter for this codebase are on:
  `rules-of-hooks`, `exhaustive-deps`, `no-floating-promises`,
  `no-misused-promises`, unused variables and imports, `eqeqeq` and
  `prefer-const`. Until now `npm run lint` was just `tsc --noEmit`, so there was
  no hook-dependency checking and no floating-promise detection at all.
- CI runs three separate gates: type check, lint, and formatting.
- `.nvmrc` pinned to Node 20 and `engines.node` raised to `>= 20`. Electron 38
  needs Node 20 or newer to build, so a contributor on Node 18 hit a wall.
- README badges (build, release, licence, Node, platform), and the apt
  instructions now ask GitHub for the current version instead of hardcoding it.

### Fixed
- The last four stale references to an "AI Settings tab", which has not existed
  since 1.5.0: two warnings in `ai-provider.ts` and two comments in
  `.env.example`. They now point at the `OMNITERM_AI_*` variables and
  `~/.local/share/omniterm/ai-config.json`.
- Real problems the new lint rules found: a non-hook function named
  `useSettingsFont` (the `use` prefix made `rules-of-hooks` fire on every click),
  floating promises in the polling and paste paths, and a set of unused imports,
  variables and state.

### Changed
- The codebase is formatted with Prettier (single quotes, 100 columns, semicolons,
  trailing commas). No behaviour change: the rendered output was verified
  identical, including JSX whitespace.

## [1.6.2] - 2026-09-10

### Added
- Releases now publish a `SHA256SUMS` file covering every asset, generated once
  after both architecture builds finish and verified against the published files
  before the job is allowed to pass. This is what `install-linux.sh` checks, so
  its verification step finally has something to verify.
- `SECURITY.md`: how to report privately, supported versions, and an explicit
  threat model — what is a vulnerability in a terminal emulator that runs a shell
  as you (auth bypass, cross-origin reach, path confusion, scheme handling,
  sandbox escapes) and what is not.
- Dependabot: weekly npm and GitHub Actions update pull requests. Minor and
  patch updates are grouped; a runtime major such as Electron stays separate so
  it gets the packaging and `.deb` install checks on its own.

### Fixed
- The AI error message no longer tells you to use an "AI Settings tab" that does
  not exist; it points at the `OMNITERM_AI_*` environment variables and the
  README.
- The `.deb` and desktop metadata no longer advertise an "AI copilot sidebar".

## [1.6.1] - 2026-09-10

### Fixed
- zsh no longer blocks the terminal. Debian and Ubuntu run `compinit` from
  `/etc/zsh/zshrc` for interactive shells, and when it finds an insecure
  directory it asks `Ignore insecure directories and continue [y] or abort
  compinit [n]?` — a question nobody can answer inside a terminal emulator, so
  the shell waits forever. The session now skips the global `compinit` and
  initialises completions itself, silently, only when your own configuration has
  not already done it.
- fish now receives the configuration file it is meant to read: the test harness
  pinned `XDG_CONFIG_HOME` at the throwaway home instead of picking up whatever
  the environment pointed at.
- The shell matrix in CI is no longer timing-dependent: one port per shell, and
  it waits for the API to answer instead of assuming three seconds is enough.
  When a server does not come up it now prints the log, so a failure is
  diagnosable.

## [1.6.0] - 2026-09-10

### Added
- HTTP API integration suite (22 tests): authentication, file listing and reads,
  command execution, the audit trail, snapshots and the AI settings payload.
  Hermetic — it runs against a temporary home and data directory, so it never
  touches your real audit log.
- CI now runs the terminal suites (`node-pty` smoke test, the bash/zsh/fish/dash
  matrix, prefix-history and command-duration socket tests) and the API suite.
  Before this, CI only type-checked.
- Accessibility pass: `tab`/`tablist`/`tabpanel` semantics with arrow-key
  navigation, labels on every icon-only control, `dialog` and `menu` roles with
  focus handling and Escape, a skip-to-content link, live regions for the
  terminal and status messages, table captions and scopes, and visible focus
  rings. Around 220 ARIA attributes, up from none.
- `OMNITERM_READONLY=1` refuses mutating commands on the one-shot command API
  and records the attempt in the audit trail. Server-side state, so a request
  cannot turn it off.
- MIT licence, this changelog, README screenshots.

### Security
- The API token is fail-closed: with no token configured the server now
  generates one and rejects every unauthenticated request instead of letting
  them through.
- `Origin`/`Host` allowlist, which blocks DNS rebinding — a page on another
  origin resolving its own hostname to 127.0.0.1 can no longer reach the shell.
- Content-Security-Policy plus `X-Frame-Options`, `nosniff` and
  `Referrer-Policy` headers, and a constant-time token comparison.
- Unknown `/api` routes answer with a JSON 404. They previously fell through to
  the single-page-app fallback, which returned HTML with a 200 — a typo in a
  request looked like a successful call.
- Removed the client-supplied RBAC role. The caller chose its own role, so it
  could not restrict anything; permissions are now the OS user's, with
  `OMNITERM_READONLY` as the server-side control.
- Removed `/api/unit-tests/run`, which returned a hardcoded list of tests marked
  as passed.

### Changed
- Express 4 → 5, which clears the audit findings in `qs`; the SPA fallback is a
  plain middleware now.
- The command audit log rotates at 8 MB to `activity.jsonl.1` instead of growing
  without bound.

### Fixed
- The app no longer seeds the terminal with template text: the fake
  "DevTerminal Pro v2.4.0 (macOS Run Engine)" banner, the fabricated
  `/home/user` working directory, the OS preset and the plugin ids are gone. The
  terminal starts empty and the tab takes its real working directory from the
  host.
- Help text, API documentation and the README no longer describe tabs, role
  guards or unsupported features that do not exist.

### Removed
- The remaining AI-Studio scaffolding (`metadata.json`, `Dockerfile`,
  `docker-compose.yml`, `assets/.aistudio/`), stale `allowScripts` entries for
  packages that are no longer installed, the dead OS-preset and role plumbing,
  and unused type definitions.

## [1.5.0] - 2026-09-10

### Added
- Settings tab: themes, colours, fonts and remappable keyboard shortcuts.
- Split panes.
- Mouse support, including copy-on-select and a right-click context menu.
- Prefix history search.
- Command decorations showing the exit code and duration of each command.
- Colour coding in the Files view.
- Expanded System Health panel.

### Removed
- The System & Security tab and the AI Settings tab.

## [1.4.1] - 2026-09-10

### Fixed
- System Health now reports this machine's real values: load, CPU model and
  network interface, `MemAvailable` for memory, and a corrected TCP connection
  counter.

## [1.4.0] - 2026-09-10

### Changed
- AI settings are provider-agnostic instead of being locked to a single vendor.

## [1.3.0] - 2026-09-10

### Added
- Shell integration for bash, zsh and fish.
- Audit entries record the command exit code.

## [1.2.0] - 2026-09-10

### Added
- A real interactive terminal backed by `node-pty`.
- Keyboard shortcuts.
- Folder completion.

### Removed
- The scripts bar.

## [1.1.0] - 2026-09-10

### Changed
- Every mocked layer replaced with real host integrations.

## [1.0.0] - 2026-09-10

### Added
- Real shell execution engine.
- Installable Ubuntu `.deb` packaging.
- Publishing to GitHub Releases.

[Unreleased]: https://github.com/zemmike/OmniTerm/compare/v1.6.5...HEAD
[1.6.5]: https://github.com/zemmike/OmniTerm/compare/v1.6.4...v1.6.5
[1.6.4]: https://github.com/zemmike/OmniTerm/compare/v1.6.3...v1.6.4
[1.6.3]: https://github.com/zemmike/OmniTerm/compare/v1.6.2...v1.6.3
[1.6.2]: https://github.com/zemmike/OmniTerm/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/zemmike/OmniTerm/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/zemmike/OmniTerm/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/zemmike/OmniTerm/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/zemmike/OmniTerm/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/zemmike/OmniTerm/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/zemmike/OmniTerm/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/zemmike/OmniTerm/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zemmike/OmniTerm/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/zemmike/OmniTerm/releases/tag/v1.0.0
