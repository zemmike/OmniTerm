# Task 3 Report: Platform Paths and Shell Selection

## Status

Implemented the Task 3 platform contracts and consumers on Windows. The task commit is
`feat: add cross-platform shell and data paths`.

## RED/GREEN Evidence

- PATH RED: `npm test -- tests/platform-paths.test.ts` -> exit 1, expected
  `Cannot find module '../platform/paths'`.
- PATH GREEN: same command -> exit 0, 1 file and 6 tests passed.
- SHELL RED: `npm test -- tests/platform-shell.test.ts` -> exit 1, expected
  `Cannot find module '../platform/shell'`.
- SHELL GREEN: same command -> exit 0, initially 8/8 passed; final suite is 9/9 after
  adding the POSIX interactive-argument compatibility case.
- ENV RED: `npm test -- tests/api.test.ts -t "returns real platform/home/cwd/user strings"`
  -> exit 1 because `shellKind` was undefined.
- ENV GREEN: same command after the server refactor and Windows `USERPROFILE` test isolation
  -> exit 0, 1 passed and 20 filtered out.
- POSIX compatibility RED: `npm test -- tests/platform-shell.test.ts` -> exit 1 because an
  unknown POSIX shell received `['-i']` instead of the existing `['-l', '-i']` behavior.
- POSIX compatibility GREEN: same command -> exit 0, 9/9 passed.
- Focused final: `npm test -- tests/platform-paths.test.ts tests/platform-shell.test.ts
  tests/api.test.ts tests/history-nav.test.ts tests/file-search.test.ts` -> exit 0,
  5 files and 62 tests passed.
- Current-platform build/PTY: `npm run build && npm run test:pty` -> exit 0. Vite,
  server, and audit verifier built; Windows PowerShell PTY reported `STAGE-5`, aliases,
  Ctrl+C recovery, and a real prompt as true.
- Generated-profile probe: a temporary `node-pty` session using the actual discovered
  PowerShell profile observed command output plus OSC 7, OSC 133 C, and OSC 133 D.
- Final static checks: `npm run typecheck` and `npm run build` -> exit 0.
- Full suite (run once before commit): `npm test` -> exit 1, 287/289 passed. The two
  remaining failures are recorded under Concerns.

## Integration Details

- `resolveDataDir` honors `OMNITERM_DATA_DIR`, then Windows roaming app data, macOS
  Application Support, Linux XDG data, and the exact Linux fallback.
- `discoverShellProfile` uses injected executable lookup, with Windows precedence
  `pwsh.exe`, `powershell.exe`, `cmd.exe`; POSIX one-shot execution retains `-lc`.
- PowerShell integration is generated inside the data directory and loaded only for the
  OmniTerm session. It does not edit user profiles and emits cwd and command markers.
- PTY spawning, status, and history use `ShellProfile`; bash/zsh/fish integration remains
  intact, and shells without a safe known history format return no disk history.
- One-shot execution uses `ShellProfile.commandArgs`. `/api/env` adds `shellKind` and
  `shellIntegration` without removing fields.
- Electron passes `app.getPath('userData')` as `OMNITERM_DATA_DIR`.
- Windows test paths are normalized only in `tests/file-search.test.ts`; search production
  behavior is unchanged. The production SPA fallback uses Express's Windows-safe
  root-relative `sendFile` form.
- Renderer security is unchanged: PTY clients still cannot provide environment overrides.

## Files

- Added: `platform/types.ts`, `platform/paths.ts`, `platform/shell.ts`,
  `tests/platform-paths.test.ts`, `tests/platform-shell.test.ts`.
- Modified: `pty.ts`, `server.ts`, `electron-main.cjs`, `scripts/pty-smoke.cjs`,
  `tests/api.test.ts`, `tests/file-search.test.ts`, `tests/helpers/server.ts`.

## Self-Review

- `git diff --check` passed (line-ending conversion warnings only).
- Verified no renderer-controlled shell executable, arguments, or environment were added.
- Verified explicit command argument arrays for PowerShell, cmd, and POSIX shells.
- Verified data-directory overrides remain authoritative for tests and Electron packaging.
- Reviewed scope against the brief; no metrics/archive/packaging implementation was pulled
  forward except the Windows-safe SPA fallback needed by the live API suite.

## Concerns

- Full-suite `GET /api/security` expects zero SSH keys in the temporary home, but the
  current Windows Bash-based metrics probe reports one. That hardcoded Bash metrics path is
  intentionally deferred to the later cross-platform metrics task.
- Full-suite audit integrity expects POSIX mode `0600`; Windows reports mode bits `0666`.
  The assertion needs platform-aware semantics in the later audit/platform work.
- Vite reports the existing JavaScript chunk-size warning. The generated-profile probe
  also logged a non-fatal ConPTY `AttachConsole failed` stack during teardown after all OSC
  evidence had already passed.
