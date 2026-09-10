# Changelog

All notable changes to OmniTerm are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/zemmike/OmniTerm/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/zemmike/OmniTerm/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/zemmike/OmniTerm/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/zemmike/OmniTerm/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/zemmike/OmniTerm/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/zemmike/OmniTerm/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/zemmike/OmniTerm/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zemmike/OmniTerm/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/zemmike/OmniTerm/releases/tag/v1.0.0
