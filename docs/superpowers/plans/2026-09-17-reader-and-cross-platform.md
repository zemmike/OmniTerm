# AI Reader and Cross-Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OmniTerm's AI Reader render readable TeX-rich output and make the terminal, files, audit, snapshots, metrics, packages, and documentation work honestly across Linux, macOS, and Windows.

**Architecture:** Keep the HTTP and WebSocket contracts stable while moving OS behavior behind dependency-injected platform modules. Keep terminal parsing pure, emit typed block/inline tokens, and let React render those tokens with bundled KaTeX. Verify portable logic with Vitest and verify native PTY/package behavior on one GitHub Actions runner per operating system.

**Tech Stack:** TypeScript 5.8, React 19, Electron 44, Vite 6, Vitest 5, node-pty 1.1, KaTeX, electron-builder 26, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-17-reader-and-cross-platform-design.md`

## Global Constraints

- Linux retains its current complete feature set and package formats.
- macOS uses `$SHELL` with `/bin/zsh` fallback and ships x64/arm64 DMG and ZIP artifacts.
- Windows requires ConPTY-era Windows, prefers `pwsh.exe`, then `powershell.exe`, then `cmd.exe`, and initially ships x64 NSIS and ZIP artifacts.
- WSL and Git Bash discovery are not part of this release.
- The renderer never inserts terminal-provided HTML and never writes to the PTY.
- Missing platform capabilities must be reported as unavailable, never as invented zero values.
- Existing routes, Linux data, settings, audit logs, and `.tar.gz` backups remain compatible.
- Platform packages are built and smoke-tested on native runners.

---

## File Map

- `src/readerMarkdown.ts`: pure block and inline tokenization, including math and Windows paths.
- `src/components/AiReader.tsx`: semantic reader UI and safe KaTeX rendering.
- `src/index.css`: bundled KaTeX import and reader-specific overflow/layout rules.
- `tests/reader-markdown.test.ts`: parser regression suite.
- `tests/ai-reader.test.tsx`: reader component behavior and accessibility.
- `platform/types.ts`: shared shell, metrics, archive, and path contracts.
- `platform/paths.ts`: OS-standard data-directory selection.
- `platform/shell.ts`: shell discovery and command invocation for all platforms.
- `platform/metrics.ts`: platform-neutral health facade and OS probes.
- `platform/archive.ts`: tar/ZIP creation, listing, and restore instructions.
- `pty.ts`: consume selected shell profile for PTY and history behavior.
- `server.ts`: consume platform services and return capability-aware responses.
- `electron-main.cjs`: pass Electron's user-data directory to the backend.
- `src/types.ts`: health capability and archive format types.
- `src/components/ServerHealthView.tsx`: neutral labels and unavailable states.
- `tests/platform-paths.test.ts`: data-directory matrix.
- `tests/platform-shell.test.ts`: shell selection and invocation matrix.
- `tests/platform-metrics.test.ts`: normalized metrics and probe failure behavior.
- `tests/platform-archive.test.ts`: snapshot format, cleanup, and listing behavior.
- `tests/api.test.ts`: additive API contract coverage.
- `scripts/pty-smoke-windows.cjs`: native Windows PTY smoke test.
- `.github/workflows/build.yml`: portable gates plus native test/package matrix.
- `.github/workflows/release.yml`: native release matrix and unified checksums.
- `package.json` / `package-lock.json`: KaTeX/types and multi-platform packaging.
- `README.md`: concise product, support, install, development, and security guide.

---

### Task 1: Typed Reader Parser and TeX Tokens

**Files:**
- Modify: `src/readerMarkdown.ts`
- Modify: `tests/reader-markdown.test.ts`

**Interfaces:**
- Produces: `ReaderBlock`, `InlineToken`, `parseReaderText(raw)`, `parseInlineText(text)`, and cross-platform `looksLikePath(candidate)`.
- Consumed by: Task 2's React renderer.

- [ ] **Step 1: Add failing block-math and inline-math tests**

```ts
expect(parseReaderText('Euler: $e^{i\\pi}+1=0$.')).toEqual([
  { kind: 'paragraph', content: [
    { kind: 'text', value: 'Euler: ' },
    { kind: 'math', value: 'e^{i\\pi}+1=0' },
    { kind: 'text', value: '.' },
  ] },
]);
expect(parseReaderText('$$\\int_0^1 x^2 dx$$')).toEqual([
  { kind: 'math', value: '\\int_0^1 x^2 dx', display: true },
]);
expect(parseReaderText('Price is $20 and tax is $2.')).toMatchObject([
  { kind: 'paragraph' },
]);
expect(parseReaderText('$$\\frac{1}{2}')).toMatchObject([
  { kind: 'paragraph' },
]);
```

- [ ] **Step 2: Run the focused parser suite and verify RED**

Run: `npm test -- tests/reader-markdown.test.ts`

Expected: FAIL because paragraph/math token kinds and `parseInlineText` do not exist.

- [ ] **Step 3: Implement typed block and inline parsing**

Use these public shapes:

```ts
export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'emphasis'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'path'; value: string }
  | { kind: 'math'; value: string };

export type ReaderBlock =
  | { kind: 'heading'; level: number; content: InlineToken[] }
  | { kind: 'paragraph'; content: InlineToken[] }
  | { kind: 'list'; ordered: boolean; start: number; items: InlineToken[][] }
  | { kind: 'code'; text: string; lang: string }
  | { kind: 'quote'; content: InlineToken[] }
  | { kind: 'table'; headers: InlineToken[][]; rows: InlineToken[][][] }
  | { kind: 'math'; value: string; display: true };
```

Tokenize `\\(...\\)` and matched dollar delimiters before emphasis/path matching.
Require paired `$` delimiters and at least one TeX signal (`\\`, `^`, `_`, `{`, `}`,
or an operator adjacent to a letter/number) so currency stays text. Treat unmatched
display delimiters as paragraph source.

- [ ] **Step 4: Add failing list, table, and Windows-path tests**

```ts
expect(parseReaderText('- one\n- two')).toMatchObject([
  { kind: 'list', ordered: false, items: [[{ kind: 'text', value: 'one' }], [{ kind: 'text', value: 'two' }]] },
]);
expect(parseReaderText('| Name | Value |\n| --- | ---: |\n| CPU | 42% |')[0].kind).toBe('table');
expect(looksLikePath('C:\\work\\src\\App.tsx')).toBe(true);
expect(looksLikePath('\\\\server\\share\\notes.md')).toBe(true);
expect(looksLikePath('yes\\no')).toBe(false);
```

- [ ] **Step 5: Run tests to verify RED, then implement grouping/table/path rules**

Run: `npm test -- tests/reader-markdown.test.ts`

Expected before implementation: FAIL on list/table/Windows path assertions. Implement
consecutive-list grouping, conservative pipe-table recognition with a separator row,
drive/UNC path rules, and line/column suffix preservation.

- [ ] **Step 6: Run the parser suite and verify GREEN**

Run: `npm test -- tests/reader-markdown.test.ts`

Expected: all parser tests pass, including every existing ANSI/furniture/path case.

- [ ] **Step 7: Commit the parser checkpoint**

```bash
git add src/readerMarkdown.ts tests/reader-markdown.test.ts
git commit -m "feat: parse structured reader content and TeX"
```

---

### Task 2: Safe KaTeX Reader UI

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/AiReader.tsx`
- Modify: `src/index.css`
- Create: `tests/ai-reader.test.tsx`

**Interfaces:**
- Consumes: Task 1's `ReaderBlock` and `InlineToken`.
- Produces: semantic, accessible reader rendering with safe math fallback.

- [ ] **Step 1: Install KaTeX and its TypeScript declarations**

Run: `npm install katex && npm install --save-dev @types/katex`

- [ ] **Step 2: Write failing component tests**

```tsx
render(<AiReader text={'## Result\n\n$e^{i\\pi}+1=0$\n\n$$x^2$$'} onClose={() => {}} />);
expect(screen.getByRole('heading', { name: 'Result' })).toBeVisible();
expect(document.querySelector('.katex')).not.toBeNull();
expect(document.querySelector('.katex-display')).not.toBeNull();
expect(document.querySelector('script')).toBeNull();
```

Also test malformed TeX source remains visible, grouped `<ol>/<ul>` semantics, table
scroll containment, copy, zoom, follow toggle, close, and current accessibility labels.

- [ ] **Step 3: Run the component test and verify RED**

Run: `npm test -- tests/ai-reader.test.tsx`

Expected: FAIL because the component still expects old blocks and has no KaTeX output.

- [ ] **Step 4: Implement semantic block/inline renderers**

Render math only through:

```ts
katex.renderToString(value, {
  displayMode,
  throwOnError: false,
  strict: 'warn',
  trust: false,
  output: 'htmlAndMathml',
});
```

The only `dangerouslySetInnerHTML` call may receive that KaTeX return value. Catch
unexpected exceptions and render the original delimiters in `<code>`. Render lists as
`<ul>/<ol>`, tables with `<table>`, and other tokens as React nodes. Keep copy sourced
from the original pane text.

- [ ] **Step 5: Add bundled KaTeX CSS and responsive reader layout**

Import `katex/dist/katex.min.css` from `src/index.css`. Add stable overflow rules for
`.reader-code`, `.reader-table`, and `.reader-math`, and constrain prose measure without
reducing the mobile panel width.

- [ ] **Step 6: Run reader, accessibility, type, and lint checks**

Run: `npm test -- tests/ai-reader.test.tsx tests/reader-markdown.test.ts tests/a11y.test.tsx`

Run: `npm run typecheck && npm run lint`

Expected: all commands exit 0.

- [ ] **Step 7: Commit the reader UI checkpoint**

```bash
git add package.json package-lock.json src/components/AiReader.tsx src/index.css tests/ai-reader.test.tsx
git commit -m "feat: render TeX and structured AI output"
```

---

### Task 3: Platform Paths and Shell Selection

**Files:**
- Create: `platform/types.ts`
- Create: `platform/paths.ts`
- Create: `platform/shell.ts`
- Create: `tests/platform-paths.test.ts`
- Create: `tests/platform-shell.test.ts`
- Modify: `pty.ts`
- Modify: `server.ts`
- Modify: `electron-main.cjs`

**Interfaces:**
- Produces: `PlatformName`, `ShellProfile`, `resolveDataDir`, `discoverShellProfile`.
- Consumed by: PTY spawning, one-shot execution, history lookup, backups, and env API.

- [ ] **Step 1: Write failing data-directory matrix tests**

```ts
expect(resolveDataDir({ platform: 'linux', home: '/home/m', env: {} }))
  .toBe('/home/m/.local/share/omniterm');
expect(resolveDataDir({ platform: 'darwin', home: '/Users/m', env: {} }))
  .toBe('/Users/m/Library/Application Support/OmniTerm');
expect(resolveDataDir({ platform: 'win32', home: 'C:\\Users\\m', env: { APPDATA: 'C:\\Users\\m\\AppData\\Roaming' } }))
  .toBe('C:\\Users\\m\\AppData\\Roaming\\OmniTerm');
```

- [ ] **Step 2: Run path tests RED, implement `resolveDataDir`, run GREEN**

Run: `npm test -- tests/platform-paths.test.ts`

Expected before implementation: module-not-found failure. Respect explicit
`OMNITERM_DATA_DIR`, then OS conventions; preserve the exact Linux fallback.

- [ ] **Step 3: Write failing shell-selection tests with injected executable lookup**

```ts
expect(discoverShellProfile({ platform: 'win32', which: fakeWhich(['pwsh.exe']) }).kind)
  .toBe('powershell');
expect(discoverShellProfile({ platform: 'win32', which: fakeWhich(['powershell.exe']) }).executable)
  .toBe('powershell.exe');
expect(discoverShellProfile({ platform: 'win32', which: fakeWhich(['cmd.exe']) }).kind)
  .toBe('cmd');
expect(discoverShellProfile({ platform: 'darwin', env: {} }).executable).toBe('/bin/zsh');
```

Assert `pwsh`/`powershell` one-shot arguments are `-NoLogo -NoProfile -Command`, cmd is
`/d /s /c`, and POSIX shells keep `-lc`.

- [ ] **Step 4: Run shell tests RED, implement profiles, run GREEN**

Run: `npm test -- tests/platform-shell.test.ts`

Use `where.exe` on Windows and PATH lookup on POSIX through an injected `which`
function. Generate a PowerShell integration script under the data directory that
emits OSC 7 and OSC 133 prompt/command markers without modifying user profiles.

- [ ] **Step 5: Refactor PTY and one-shot execution to consume `ShellProfile`**

Replace direct `$SHELL || /bin/bash` selection and universal `['-lc', command]` with
the discovered profile. Keep the existing bash/zsh/fish integration functions and
map them into the profile. History lookup returns an empty list when a shell has no
safe known history format.

- [ ] **Step 6: Pass Electron's user-data path and expose capabilities**

Add `OMNITERM_DATA_DIR: app.getPath('userData')` to the backend environment. Extend
`/api/env` with `shellKind` and `shellIntegration` while preserving existing fields.

- [ ] **Step 7: Run focused and existing terminal tests**

Run: `npm test -- tests/platform-paths.test.ts tests/platform-shell.test.ts tests/api.test.ts tests/history-nav.test.ts`

Run: `npm run build && npm run test:pty`

Expected: all commands exit 0 on the current platform.

- [ ] **Step 8: Commit the platform shell checkpoint**

```bash
git add platform/types.ts platform/paths.ts platform/shell.ts tests/platform-paths.test.ts tests/platform-shell.test.ts pty.ts server.ts electron-main.cjs tests/api.test.ts
git commit -m "feat: add cross-platform shell and data paths"
```

---

### Task 4: Capability-Aware Host Metrics

**Files:**
- Create: `platform/metrics.ts`
- Create: `tests/platform-metrics.test.ts`
- Modify: `server.ts`
- Modify: `src/types.ts`
- Modify: `src/components/ServerHealthView.tsx`
- Modify: `tests/api.test.ts`
- Modify: `tests/a11y.test.tsx`

**Interfaces:**
- Produces: `collectHealthSnapshot(deps): Promise<HealthSnapshot>`.
- Consumed by: `/api/health` and `ServerHealthView`.

- [ ] **Step 1: Write failing normalized-contract tests**

```ts
expect((await collectHealthSnapshot(linuxFixture)).capabilities).toEqual({
  memoryBreakdown: true,
  processDetails: true,
  mounts: true,
  diskIO: true,
  perCoreCpu: true,
  cpuTemperature: true,
  networkRates: true,
});
expect((await collectHealthSnapshot(failingWindowsFixture)).diskIO).toBeNull();
expect((await collectHealthSnapshot(failingWindowsFixture)).capabilities.diskIO).toBe(false);
```

- [ ] **Step 2: Run metrics tests and verify RED**

Run: `npm test -- tests/platform-metrics.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Move Linux probes behind the metrics facade**

Preserve existing formulas and fixture their `/proc`, `ps`, and statfs inputs. A probe
returns `{ value, available }`; exceptions affect only that capability.

- [ ] **Step 4: Add macOS and Windows probes**

Use Node `os` data for common CPU/memory/uptime fields. Invoke `ps`, `df`, and `sysctl`
on macOS with argument arrays. Invoke bounded `powershell.exe`/`pwsh.exe` CIM queries
on Windows with `-NoProfile -NonInteractive -Command` and parse JSON. Apply a four
second timeout per external probe.

- [ ] **Step 5: Make `/api/health` asynchronous and additive**

Return the existing response fields plus `capabilities`. Represent unavailable scalar
details as `null` and unavailable collections as `[]`; update `src/types.ts` exactly.

- [ ] **Step 6: Write failing neutral-label UI tests, then update the view**

Assert the view says `Memory breakdown`, `Mounted filesystems`, and `Unavailable on
this platform`, and does not hard-code `/proc/meminfo`, `ps --sort=-rss`, or
`statfs on /proc/mounts` for non-Linux fixture data.

- [ ] **Step 7: Run metrics, API, accessibility, type, and lint suites**

Run: `npm test -- tests/platform-metrics.test.ts tests/api.test.ts tests/a11y.test.tsx`

Run: `npm run typecheck && npm run lint`

Expected: all commands exit 0.

- [ ] **Step 8: Commit the metrics checkpoint**

```bash
git add platform/metrics.ts tests/platform-metrics.test.ts server.ts src/types.ts src/components/ServerHealthView.tsx tests/api.test.ts tests/a11y.test.tsx
git commit -m "feat: add capability-aware host metrics"
```

---

### Task 5: Cross-Platform Snapshots

**Files:**
- Create: `platform/archive.ts`
- Create: `tests/platform-archive.test.ts`
- Modify: `server.ts`
- Modify: `src/types.ts`
- Modify: `tests/api.test.ts`

**Interfaces:**
- Produces: `createSnapshot`, `listSnapshots`, `removePartialArchive`.
- Consumed by: `backup` built-in and `/api/backups` routes.

- [ ] **Step 1: Write failing archive-adapter tests**

Test that Linux/macOS build a tar argument array, Windows builds a PowerShell
`Compress-Archive` invocation, listing accepts `.tar.gz` and `.zip`, restore text is
platform-appropriate, and a failed command deletes only its partial destination.

- [ ] **Step 2: Run archive tests and verify RED**

Run: `npm test -- tests/platform-archive.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement archive creation and listing**

Expose:

```ts
interface SnapshotResult {
  path: string;
  format: 'tar.gz' | 'zip';
  sizeBytes: number;
  restoreHint: string;
}
```

Create into a temporary sibling filename, rename atomically on success, and remove the
temporary file on failure. Pass source/destination as command arguments, not string
interpolation.

- [ ] **Step 4: Replace duplicate backup logic in the server**

Use the same adapter for the terminal built-in and HTTP endpoint. Keep existing
response fields and add `format` and `restoreHint`.

- [ ] **Step 5: Run archive and API suites GREEN**

Run: `npm test -- tests/platform-archive.test.ts tests/api.test.ts`

Expected: all tests pass, including existing `.tar.gz` fixtures.

- [ ] **Step 6: Commit the snapshot checkpoint**

```bash
git add platform/archive.ts tests/platform-archive.test.ts server.ts src/types.ts tests/api.test.ts
git commit -m "feat: add cross-platform snapshots"
```

---

### Task 6: Native Packaging and CI

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/pty-smoke-windows.cjs`
- Modify: `.github/workflows/build.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: platform shell behavior from Task 3.
- Produces: native Linux, macOS, and Windows artifacts and PTY evidence.

- [ ] **Step 1: Add package scripts and electron-builder targets**

Add `dist:mac`, `dist:win`, and `test:pty:windows`. Configure mac targets `dmg` and
`zip` for x64/arm64 and Windows targets `nsis` and `zip` for x64. Keep Linux config
unchanged. Add platform-specific icons only if valid `.icns`/`.ico` files already
exist; otherwise let electron-builder use the PNG and record the limitation.

- [ ] **Step 2: Add a Windows native PTY smoke test**

Spawn the discovered profile through node-pty, wait for a prompt, write
`Write-Output OMNITERM_PTY_OK`, verify output, send Ctrl+C to a bounded wait, then
exit. Fail with captured output and the selected executable.

- [ ] **Step 3: Run portable package configuration checks locally**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

Expected: all commands exit 0 before CI changes are committed.

- [ ] **Step 4: Refactor build CI into portable and native jobs**

Keep lint/types/format and portable Vitest on Ubuntu. Add native matrix entries for
`ubuntu-latest`, `macos-14`, and `windows-2025`; each runs `npm ci`, rebuilds node-pty
for Electron, runs its PTY smoke test, builds, and packages only its own OS. Use
PowerShell syntax in Windows steps and Bash on Unix runners.

- [ ] **Step 5: Add native artifact smoke checks**

Linux retains the `.deb` install check. macOS verifies the `.app` within the DMG/ZIP
has its executable and `Info.plist`. Windows runs the NSIS installer silently into a
temporary directory, checks `OmniTerm.exe --version`, and silently uninstalls it.

- [ ] **Step 6: Refactor release CI and unified checksums**

Build releases on the same native runner matrix, upload artifacts from each job, and
generate `SHA256SUMS` in a final Ubuntu job after downloading all artifacts. Do not
claim signing/notarization when certificate secrets are absent.

- [ ] **Step 7: Validate workflow syntax and action pins**

Run: `npm run format:check`

Run: `bash scripts/check-action-pins.sh`

Expected: all workflow actions are pinned to 40-character commit SHAs and formatting
passes.

- [ ] **Step 8: Commit packaging and CI**

```bash
git add package.json package-lock.json scripts/pty-smoke-windows.cjs .github/workflows/build.yml .github/workflows/release.yml
git commit -m "build: package and test OmniTerm on three platforms"
```

---

### Task 7: Concise Cross-Platform README

**Files:**
- Modify: `README.md`
- Modify: `docs/TROUBLESHOOTING.md`
- Modify: `docs/PERFORMANCE.md`

**Interfaces:**
- Consumes: verified support and commands from Tasks 1-6.
- Produces: accurate public installation and development instructions.

- [ ] **Step 1: Replace README with the approved short structure**

Keep: one-paragraph purpose, six-to-eight feature bullets, compact support table,
release installation for each OS, source build, verification commands, local/security
note, screenshots, and links to detailed docs. Remove duplicated installer commands,
the long architecture inventory, repeated shell matrix, stale `AI: removed` section,
and claims that Windows/macOS are permanently unsupported.

- [ ] **Step 2: Document unsigned preview behavior precisely**

State that Linux remains fully supported; macOS and Windows are supported when their
native CI jobs pass. Until signing credentials are configured, explain Gatekeeper and
SmartScreen warnings without instructing users to disable system security globally.

- [ ] **Step 3: Move durable details to existing documents**

Update troubleshooting with OS-specific log/data locations, shell selection failures,
ConPTY minimum, macOS permissions, and unsigned-build warnings. Update performance
language so Linux measurements are not presented as macOS/Windows measurements.

- [ ] **Step 4: Verify README commands and stale-claim removal**

Run: `rg -n "AI assistance was removed|Not cross-platform|macOS, Windows.*Not supported|Everything except Linux" README.md`

Expected: no matches.

Run: `npm run format:check`

Expected: exit 0.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs/TROUBLESHOOTING.md docs/PERFORMANCE.md
git commit -m "docs: add concise cross-platform setup guide"
```

---

### Task 8: Full Verification and Review

**Files:**
- Review: all changed files from Tasks 1-7

**Interfaces:**
- Confirms every acceptance criterion in the approved specification.

- [ ] **Step 1: Run the complete local gate**

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run format:check`

Run: `npm test`

Run: `npm run build`

Run: the current platform's native PTY smoke command.

Expected: every command exits 0 with no test failures.

- [ ] **Step 2: Verify the regression tests detect the reader fix**

Temporarily revert only the math dispatch in the working tree, run
`npm test -- tests/reader-markdown.test.ts tests/ai-reader.test.tsx`, and confirm the
math tests fail for the expected missing-render reason. Restore the implementation and
rerun the same command to GREEN.

- [ ] **Step 3: Audit the acceptance criteria**

Confirm TeX safety/fallbacks, structured reader blocks, Linux compatibility, shell
fallback order, capability-aware metrics, snapshots, native CI/package definitions,
and concise installation instructions. Record any criterion that cannot be locally
proven as awaiting its native CI runner rather than claiming success.

- [ ] **Step 4: Request an independent code review**

Use `superpowers:requesting-code-review` with the design, this plan, the base commit,
and current HEAD. Fix every Critical and Important finding, then rerun the affected
tests and the complete local gate.

- [ ] **Step 5: Inspect final repository state**

Run: `git status --short`

Run: `git log --oneline --decorate -10`

Expected: only intentional changes remain and each checkpoint is represented by a
focused commit.
