# Changelog

All notable changes to OmniTerm are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Clickable file paths in terminal output.** Absolute, home-relative,
  dot-relative, project-relative and bare filename links open the containing
  directory in Files and select the file. Compiler-style `:line:column` suffixes
  are recognised without becoming part of the filesystem path, and relative
  paths resolve against the pane's live cwd. Common extensionless project files
  such as `Makefile`, `Dockerfile`, `LICENSE` and `README` are recognised too.
- **Terminal workspace recovery across renderer reloads.** Tab order, working
  directories, split orientation, pane IDs and the active tab/pane are stored as
  a small validated snapshot. Reloading reconnects to the live backend PTYs and
  their scrollback instead of replacing the workspace with one blank tab.
- Workspace snapshots are versioned and bounded (20 tabs, 6 panes per tab), and
  deliberately never copy command history or scrollback into browser storage.
- **An opt-in WebGL renderer setting** (`Settings → Experimental: WebGL renderer`),
  built on `@xterm/addon-webgl`, with a live toggle and a disposal path on context
  loss. It is **off by default**, and that is a finding rather than a default: on
  this build machine enabling it loaded the addon successfully and then threw
  inside xterm's render loop (`Cannot read properties of undefined (reading
  '_isDisposed')` / `'dimensions'`), which unmounted the app and left a blank
  window. The DOM renderer was verified painting 38 rows with all four tabs
  present in the same environment. Until it is verified on real GPU hardware, the
  faster renderer is a switch the user can try, not something we turn on for them.

### Fixed
- Up/Down history requests and keystrokes entered while the terminal socket is
  still connecting are now queued behind the required session-start frame. An
  early arrow press can no longer leave history navigation permanently stuck in
  an in-flight state.
- The application shell now uses a bounded viewport flex layout. The terminal
  status bar and global host-status footer reserve their own height instead of
  overlapping or clipping the bottom rows of full-screen tools such as Claude
  Code.
- Closing a terminal tab now terminates every PTY in that tab instead of leaving
  invisible shells running until OmniTerm exits. Closing the final tab remains a
  no-op so its shell is not accidentally killed.
- The app connection badge now reports `OFFLINE` when health polling fails, and
  the header describes the app as `LOCAL` instead of claiming an unmeasured
  online state.
- The primary tab panel no longer overrides the native `<main>` landmark role;
  the real header states now pass the accessibility suite with zero violations.

### Security
- Upgraded Electron from 38 to 44.4.1, removing the published sandbox,
  context-isolation and archive-extraction advisories reported against the
  previous packaged runtime.

### Notes
- Measured with CDP against the running window rather than assumed; the probe and
  the reproduction are described in the plan document.

## [1.14.0] - 2026-09-21

### Added
- **AI Reader filters.** "Last reply" keeps only what follows the last prompt in the pane,
  and "No noise" drops the status furniture - spinners, elapsed times, token counts,
  progress bars and tool chatter. Both are on by default and can be switched off
  independently. When a pane has no prompt marker to cut at, the reader says so instead of
  pretending a filter did something.
- **Reader typography.** Sans-serif prose at a readable measure (~70ch), a larger 14px
  base, a clearer heading hierarchy, spaced lists, bordered tables and monospace code
  throughout. The serif experiment is reverted: it read worse at these sizes.

### Fixed
- **Switching theme blacked out half the terminal text.** A colour change no longer
  refits (which was corrupting the grid) but it does repaint, which is what was missing.
- **The reader's noise filter could never match a status line**, because it ran after the
  spinner glyph had already been stripped; it now matches the wording, and only on short
  lines so a sentence mentioning tokens survives.
- **A trailing `$` was treated as a prompt marker**, which swallowed text such as
  `Malformed: $\frac{$`. A prompt line now has to look like one.
- Reader zoom produced font sizes with seventeen decimals.

### Tests
- 343 across 26 files (up from 333), including 14 new cases for the noise classifier,
  last-reply trimming and the parser's filter options.

## [1.13.0] - 2026-09-21

### Added
- **macOS and Windows support.** OmniTerm builds and runs on all three platforms:
  platform-neutral shell selection and data paths, capability-aware host metrics (a
  metric this OS cannot provide is reported as unavailable rather than as a plausible
  zero), native snapshots, and platform packaging - `OmniTerm-<version>-universal.dmg`
  for macOS and `OmniTerm-<version>-win-<arch>.exe` for Windows.
- **Reader: TeX and structured output**, so formulas and structured agent replies render
  as content instead of escapes.
- CI builds and smoke-tests each platform natively, and publishes the checksums for all
  of them in one job.

### Fixed
- **`omniterm --version` printed the Electron version.** Chromium claims that flag before
  the app sees it, and `/usr/bin/omniterm` was a symlink to that binary. It is now a
  launcher that rewrites `--version`/`-v` to OmniTerm's own flag and forwards every other
  argument unchanged.
- **Copy in the AI Reader did nothing on Linux.** Electron refuses a page clipboard write
  it cannot tie to a gesture; copying now goes through a validated IPC bridge, capped at
  4,000,000 characters, with the browser clipboard as the development fallback.
- **A settings change could corrupt the terminal grid.** Refits now require the pane to be
  active, the document visible and the host laid out; a colour change never refits, a font
  change refits only when visible, and returning to the tab does one fit and repaint.
- **macOS packaging failed** because node-pty 1.1.0 ships its Darwin `spawn-helper` as
  0644 and macOS reports only "posix_spawnp failed"; both workflows repair the permission
  before the smoke test.
- **Three releases contained no packages.** Lint failed on an async `setTimeout` callback,
  and the packaging workflow tested before it built, so the Package jobs were skipped
  while `Release` still reported success.
- Clicking a terminal path with a relative path or a `:line` suffix, and the Files tab
  going blank after such a click.

### Notes
- macOS builds are **not notarised** and Windows installers are **not code-signed** yet;
  both are documented with the workaround in the README.
- Reader prose is set in a serif stack with code left monospace.

## [1.12.3] - 2026-09-17

### Fixed
- **Releases from v1.12.0 onwards contained no packages.** An async callback passed to
  `setTimeout` in the Files-tab search tripped `@typescript-eslint/no-misused-promises`.
  Lint runs before packaging in the build workflow, so the Lint step failed, the Package
  jobs were skipped, and the Release job still reported success - three releases with
  nothing to install. The callback is wrapped so it returns void. Lint is now checked by
  exit code and not by eye.

## [1.12.2] - 2026-09-17

### Fixed
- **Clicking a path could leave the Files tab on an empty page.** Two defects in the
  same function. The entry was looked up with a strict path comparison, so a file the
  API reports under a resolved path - a symlink, a different prefix - was never found
  in the folder listing. The fallback then filtered the list to the file's name
  unconditionally, and when the folder does not list that name (hidden files are the
  everyday case) the filter matched nothing and the page went blank, with no error and
  no explanation. The folder now stays visible, the entry match falls back to matching
  by name inside the folder that was listed, and a genuine failure shows the attempted
  path, the reason, and two ways out: search everywhere for the name, or open the
  containing folder.

### Tests
- 256 across 16 files. The new guard in `tests/files-open-target.test.tsx` was run
  against the unfixed code and fails there with exactly the reported symptom
  (`Unable to find an element with the text: other.txt`), so a green run means
  something.

## [1.12.1] - 2026-09-17

### Fixed
- **The AI Reader looked like the terminal it was meant to replace.** Agents style
  their headings with SGR bold rather than markdown, and the reader stripped the
  escapes before classifying anything, so every heading arrived as an ordinary line
  and the panel was a monospace copy of the terminal. Bold/italic/underline are now
  converted to markers *before* the escapes are dropped, a whole-line bold line
  becomes a heading (keeping its level when the text itself carries `#`s), emphasis
  renders as real emphasis, and prose is set in a sans-serif face while code stays
  monospace. Bold inside a sentence stays part of that sentence.

## [1.12.0] - 2026-09-16

### Added
- **Files tab: search beyond the folder you are in.** The filter box only knew about
  the folder on screen, which is useless for the actual question - where is that file?
  There is now an "Everywhere" scope beside the filter: type two or more characters and
  it searches subfolders, showing each match with the folder it lives in. Clicking a
  match opens that folder and selects the file. Matches carry the full path, so a
  result is useful before you click it.
- `GET /api/files/search` - bounded by design, because it is reachable from a local UI
  and must never hang it: at most 200 results, 20,000 entries examined, depth 8, and it
  does not walk into `node_modules`, `.git`, `.cache`, virtualenvs, build output or
  coverage directories. A truncated search **says so** rather than implying it
  finished, and it sits behind the same per-launch token as every other route (verified
  returning 401 without one).
- `fileSearch.ts` - the walker, as a separately testable module like `limits.ts`.

### Tests
- 249 across 14 files (up from 239), including 10 cases for the search: matches in
  subdirectories, case-insensitivity, that skipped directories are genuinely not
  walked, the result and visited caps reporting truncation, the depth cap, an empty
  query, a missing directory, and directories being marked as directories.

## [1.11.1] - 2026-09-16

### Fixed
- **Clicking a file path failed for the two shapes agents print most.** A path from
  the terminal was used verbatim and the local API only opens absolute paths, so
  relative paths (`src/app.ts`) and line-suffixed paths (`src/app.ts:42`) could never
  resolve. Paths are now resolved where the pane's working directory is known:
  normalise, strip the `:line`/`:col` suffix, expand `~`, then make absolute. Applies
  to terminal links and to the AI Reader panel. Trade-off, asserted in a test: a
  filename genuinely ending in `:digits` is misread, which is the reasonable price for
  making every `file:line` click work.

## [1.11.0] - 2026-09-16

### Added
- **AI Reader** - an optional side panel that presents the focused pane's terminal
  output as formatted text: headings, bullets and numbered steps, quotes, fenced and
  inline code, code blocks dedented of their container's margin, and clickable file
  paths that open in the Files tab. Off by default, toggled from the terminal toolbar,
  remembered between launches, with reader text size, Copy, and Following/Paused that
  stops following the moment you scroll up. This is aimed at coding agents (Claude
  Code, Codex, Herdr) whose markdown is rendered for a fixed-width screen and then
  wrapped in box borders.
- The panel only **observes** the pane: it reads the rendered buffer through a new
  read-only `PaneApi.readBuffer()` and never writes to the PTY, so a full-screen agent
  cannot be disturbed by the panel being open.

### Implementation
- `src/readerMarkdown.ts` (new, pure): `stripAnsi`, `stripTerminalFurniture`,
  `dedent`, `parseReaderText`, `looksLikePath`.
- `src/components/AiReader.tsx` (new): the panel, rendering every string as a React
  child - no `dangerouslySetInnerHTML` anywhere.
- `src/components/TerminalPane.tsx`: `PaneApi` gains `readBuffer()`.
- `src/components/TerminalView.tsx`: toolbar toggle, the panel, and a 1.2s poll of the
  focused pane while it is open.

### Tests
- 228 across 13 files, including 16 new parser cases: ANSI and OSC stripping, box
  drawing (rounded corners included), spinner frames, headings by level, bullets and
  numbered steps, fenced code with its language, an unterminated fence (a response
  still streaming), quotes, wrapped paragraphs, and a realistic agent screen asserted
  block by block, plus path recognition and its negatives.

### Known gaps
- The panel was not exercised in a running window on the build machine; the parser,
  the build and the suite are what is verified.
- No axe test for the new panel yet, and no search inside the reader.
- No transcript adapters for specific agents (the structured-data path).

## [1.10.0] - 2026-09-14

### Added
- **Resizable split panes.** Every pair of panes now has a divider between them:
  drag it, or focus it and use the arrow keys (Shift for a bigger step). This works
  for both orientations - side by side (`Ctrl+Shift+E`) and stacked (`Ctrl+Shift+O`) -
  and matches the file-list divider added in 1.9.2. A drag moves only the two panes
  either side of it, no pane can go below 12% of the split, and sizes are saved with
  the rest of the workspace so they survive a restart. This closes the known gap
  recorded against 1.9.2.

### Implementation
- `src/splitSizes.ts` (new): pane sizes as fractions summing to 1, with pure
  `normalizeSizes` and `resizeNeighbours` functions so the clamping rules are
  testable in isolation.
- `src/components/TerminalView.tsx`: `role="separator"` dividers with
  `aria-valuenow`/`aria-valuemin`/`aria-valuemax`, pointer capture while dragging,
  and arrow-key resizing; panes size themselves with `flex-basis` instead of `flex-1`.
- `src/workspace.ts`: `sizes` is persisted, and only accepted when it describes
  exactly the panes present, so a closed pane or a hand-edited file cannot load a
  broken layout.

### Tests
- 209 across 12 files, including 11 new cases for the split maths: equal defaults,
  renormalising, wrong-length lists (what a closed pane leaves behind), garbage
  values, dragging in both directions, the minimum clamp on both sides, no-op at the
  ends, and a 200-drag sequence asserting the total stays 1.

### Note
- The pointer drag was verified by maths, build and the full suite, not by hand in a
  running window on the build machine.

## [1.9.3] - 2026-09-14

### Fixed
- **The terminal fills the pane instead of leaving dead space on the right.** xterm
  derives its column count from the measured cell width, and two paths refitted
  against the wrong font: the live settings effect fitted *before* applying the new
  font (so changing size or family left the old column count, and a larger font left
  the rest of the pane empty), and the first fit could run before the terminal font
  had loaded. Refits now happen after the font options are applied, on the next
  frame, when `document.fonts.ready` resolves, and once more shortly after.
- **One bottom bar instead of two on the Terminal tab.** The app-level footer was
  stacked directly above the terminal's own status row; the footer is now hidden on
  the Terminal tab, where the terminal row already reports the connection, the shell
  and the audit integration.

### Note
- Confirmed in the running window after the fact: the pane is 1278 px wide and the
  rendered terminal 1268 px, so it fills 99% of the pane (the remaining 10 px is the
  pane's own border and padding), with 40 rows painted. Visible app footers on the
  Terminal tab: 0, which is the merged single bottom bar.
- The font-change path was fixed by ordering and is not covered by that measurement:
  settings are only persisted once changed, so the harness could not switch fonts.
  If dead space reappears, it will be after a font size or family change.

## [1.9.2] - 2026-09-14

### Fixed
- **Clicking a file path in the terminal now opens it.** Navigation used to require
  the file to appear in its parent directory listing and threw "Path not found"
  otherwise, so a perfectly readable path was refused - for example a file the
  listing did not return, or a name that only matched after normalisation. The
  parent listing is now a convenience rather than a gate: if the entry is not in it,
  the file is read directly and opened. Paths are also normalised first, so the
  punctuation that trails a path in a sentence ("see /etc/hosts,") no longer
  becomes part of the path.
- **A clicked file is shown in the list.** Opening a path now sets the list filter to
  that file's name, so the folder's other files with the same name are visible
  instead of the opened file hiding behind an active filter.

### Added
- **The file list panel is resizable.** Drag the divider between the list and the
  viewer, or focus it and use the arrow keys (Shift for a larger step). The width is
  clamped to a usable range and remembered between sessions.

### Tests
- 199 across 11 files (up from 192), including new coverage for path normalisation
  (trailing punctuation, quotes, duplicate slashes), basename/dirname splitting, and
  the panel width clamp.

### Known gap
- **Terminal split panes are not yet resizable.** The divider work landed for the
  Files tab only; the split-pane divider is still to do.

## [1.9.1] - 2026-09-14

### Fixed
- **Arrow keys now reach an interactive prompt.** Up/Down were being claimed by
  history navigation while a program was running, so a yes/no chooser — Claude
  Code's prompts, an installer, any inline CLI menu — could not be driven with the
  keyboard. The shell integration already brackets a running command (OSC 133 `;C`
  to `;D`), so the PTY now broadcasts that start and end and the renderer hands the
  arrows over for the duration. The alternate screen and application-cursor-key
  modes are checked too, which covers programs that run without shell integration.
  History navigation resumes the moment the program exits.
- **The terminal is ready to type as soon as it opens.** The window could be
  visible and focused while the pane still did not hold the keyboard, so the first
  keystrokes went nowhere until the terminal was clicked. The pane now focuses
  itself on mount and whenever the window regains focus.

### Verified
- Arrows reach a running program: a real `cat -v` in non-canonical mode received
  `^[[A ^[[B ^[[C` as literal bytes over the same WebSocket the UI uses, and history
  answered again with 50 entries after that program exited.
- Focus without a click: on a fresh launch, `document.activeElement` is
  `xterm-helper-textarea` and `document.hasFocus()` is true.
- 192 tests across 10 files (up from 189), typecheck, build and lint clean.

## [1.9.0] - 2026-09-14

### Added
- **A tamper-evident audit log.** Every entry now carries `seq`, `prevHash` and a
  `hash` (sha256 over a documented canonical form), so an entry that is edited,
  deleted or hand-written after the fact no longer verifies. `npm run audit:verify`
  (or `node dist/audit-verify.cjs [file] [--json] [--prefix]`) reports
  `intact` / `tampered` / `legacy` / `empty` and the first bad index, exiting 2 on
  tampering. Logs written before this release have no hashes and are reported as
  `legacy`, never as corrupt. Rotation keeps the chain continuous across
  `activity.jsonl.1` and `activity.jsonl`.
- **A reproducible benchmark harness** (`npm run bench`) and
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md) with the measured numbers, the machine,
  the method and an explicit list of what is not measured.
- **An opt-in WebGL renderer** setting (`Settings → Experimental: WebGL renderer`),
  off by default — see the note below.

### Changed
- **Corrected memory claims with measurements.** The README said "~200 MB
  resident" and "several seconds to first paint". Measured: **250 MB** PSS for one
  idle tab, and **1212 ms** from launch to a usable prompt. The new figure is worse
  than the old claim, which is why it is now measured rather than estimated.

### Notes
- **Wayland remains untested.** An investigation was started (weston is installed on
  the build machine) but did not complete, so the platform matrix still says
  untested rather than guessing. This is the next Phase 1 item.
- **The WebGL renderer could not be verified working.** Enabling it on this build
  machine loaded the addon and then threw inside xterm's render loop, unmounting the
  app and leaving a blank window, while the DOM renderer in the same environment
  painted correctly. It is therefore opt-in and labelled experimental, not a default.

## [1.8.1] - 2026-09-12

### Fixed
- **Up/Down now walk every previous command when the line is empty.** The handler
  handed an empty prompt to the shell ("plain shell history"), which appears to do
  nothing when the interactive rcfile has no history of its own — so the arrow keys
  felt dead. An empty line now requests the full history (session entries plus the
  shell's own history file) and steps through it. Verified over the app's own
  WebSocket: an empty prefix returns every entry, newest first.
- **The first press is no longer swallowed.** The list is fetched over the
  WebSocket, and the press that triggered the fetch was consumed and forgotten, so
  the first Up appeared to do nothing and the press had to be repeated. The
  direction now travels with the request and is applied the moment the answer
  arrives; presses that land while a request is in flight are counted rather than
  dropped.
- **Arrow keys belong to full-screen programs again.** Up/Down are no longer
  intercepted while the alternate screen is active, so vim, less and htop get their
  own keys.
- **Stepping past the newest entry restores what you typed** instead of clearing the
  line.

### Changed
- The navigation logic moved to `src/historyNav.ts` as pure functions
  (`decideHistoryKey`, `stepIndex`) with 14 tests, including a guard that no step can
  ever return an index outside the list.


## [1.8.0] - 2026-09-12

### Security
- **Links in terminal output can no longer reach `file:`.** The handler accepted
  `http:`, `https:` and `file:`; terminal output is attacker-controlled (an SSH
  banner, a log line), and handing a path to the desktop's MIME handler is how a
  crafted `.desktop` file or script gets executed. Only `http(s)` is passed to the
  OS now, which is all the link detector ever emits.
- **The IPC bridge validates its caller.** `omniterm:open-external` refuses any
  frame that is not the app's own window on loopback, instead of assuming the
  renderer is the only caller.
- **The window can no longer navigate away from the app**, and permission requests
  (camera, microphone, geolocation, notifications) are denied by default.
- **The renderer can no longer influence how the shell is started.** It used to be
  able to send `env` with the session's `start` message, which was merged into the
  spawn environment — enough to set `LD_PRELOAD` or `BASH_ENV` for the shell. The
  UI never sent it, so the field is gone.
- **Requests are rate limited and work is capped.** Every `/api` request now runs
  against a per-caller budget (default 120 per 10s) and the endpoints that spawn
  work — command execution and snapshots — share a concurrency cap (default 4).
  Both answer 429 with a JSON body, so a runaway loop spawns a bounded number of
  shells instead of one per request. Configurable via `OMNITERM_RATE_LIMIT_*` and
  `OMNITERM_MAX_CONCURRENCY`.

### Added
- **A paste guard.** Pasting into the terminal now goes through a review step when
  the text is multi-line or matches a known risk pattern. `src/risk.ts` classifies
  a command against 20 inspectable rule groups and reports which ones it actually
  checked; the dialog shows the exact text, the reasons, and waits. `Esc` cancels,
  and focus starts on Cancel so a stray Enter cannot run anything. Low-risk
  single-line pastes are untouched.
- **`DELETE /api/audit-log` and `DELETE /api/backups`**, with a "Your data" section
  in Settings. Deleting the audit trail records one entry saying it was cleared,
  so a silent wipe cannot hide itself.
- **A keyboard-shortcut cheat sheet** in Settings, reading the live binding
  registry (a re-bound key shows its real binding).

### Changed
- New tests for all of the above: the classifier (53 cases, including that the
  module cannot reach a process API), the limits (unit boundary conditions plus
  real HTTP 429s), the paste dialog and the new panels through the axe suite, and
  the two delete routes. The suite is 140 tests across 5 files, up from 67.


## [1.7.0] - 2026-09-12

### Removed
- **AI assistance, completely.** The `ai <prompt>` terminal command, `ai-provider.ts`
  (677 lines), the provider settings file, and all seven `/api/ai/*` routes
  (`chat`, `copilot`, `settings`, `test`, `models`, `status`) are gone. `POST`ing to
  any of them now answers the standard JSON 404, and `ai <prompt>` falls through to
  your real shell, which reports `command not found` like any other missing binary.
- `aiEnabled` from `/api/env`, the AI entries in `/api/api-docs`, the AI types in
  `src/types.ts`, and the desktop file's `ai` keyword.
- 12 tests that existed only to cover the AI endpoints; the suite is 67 tests and
  still covers every remaining route.

### Changed
- Nothing is sent to a model provider any more, and the app holds no API keys. If
  you configured a provider before, `~/.local/share/omniterm/ai-config.json` is
  left untouched but is no longer read or written — you can delete it.
- The README no longer claims an AI assistant, and `SECURITY.md` no longer
  describes an AI data flow (there is none to describe).

### Note
- This is a feature removal, so it is a minor version rather than a patch: any
  script that called `/api/ai/*` or the `ai` command will need to change.


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

[Unreleased]: https://github.com/zemmike/OmniTerm/compare/v1.14.0...HEAD
[1.14.0]: https://github.com/zemmike/OmniTerm/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/zemmike/OmniTerm/compare/v1.12.3...v1.13.0
[1.12.3]: https://github.com/zemmike/OmniTerm/compare/v1.12.2...v1.12.3
[1.12.2]: https://github.com/zemmike/OmniTerm/compare/v1.12.1...v1.12.2
[1.12.1]: https://github.com/zemmike/OmniTerm/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/zemmike/OmniTerm/compare/v1.11.1...v1.12.0
[1.11.1]: https://github.com/zemmike/OmniTerm/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/zemmike/OmniTerm/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/zemmike/OmniTerm/compare/v1.9.3...v1.10.0
[1.9.3]: https://github.com/zemmike/OmniTerm/compare/v1.9.2...v1.9.3
[1.9.2]: https://github.com/zemmike/OmniTerm/compare/v1.9.1...v1.9.2
[1.9.1]: https://github.com/zemmike/OmniTerm/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/zemmike/OmniTerm/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/zemmike/OmniTerm/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/zemmike/OmniTerm/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/zemmike/OmniTerm/compare/v1.6.5...v1.7.0
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
