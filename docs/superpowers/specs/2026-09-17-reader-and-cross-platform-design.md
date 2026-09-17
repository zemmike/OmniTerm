# AI Reader and Cross-Platform Design

## Summary

OmniTerm will remain a local-first terminal and operations console while expanding
from Linux-only packaging to Linux, macOS, and Windows. The work has three connected
parts:

1. render AI and coding-agent output as readable structured content, including TeX;
2. isolate operating-system behavior behind small platform modules; and
3. publish concise, accurate installation and support documentation.

The terminal, file workspace, audit trail, and reader are first-class on all three
platforms. Host-health details are platform-specific and may report a capability as
unavailable rather than fabricate a value.

## Goals

- Render inline and display TeX in the AI Reader without executing arbitrary HTML.
- Improve the reader's hierarchy, paragraph flow, lists, code, tables, and spacing.
- Preserve incomplete streamed content and malformed TeX as readable source text.
- Run real PTY sessions on Linux, macOS, and supported Windows versions.
- Prefer PowerShell 7 on Windows, with Windows PowerShell 5.1 and `cmd.exe` fallbacks.
- Use native filesystem paths, user-data locations, metrics, and archive formats.
- Build and test native packages on Linux, macOS, and Windows CI runners.
- Replace the current README with a short, accurate guide.

## Non-Goals

- Bundling PowerShell, WSL, Git Bash, or another shell with OmniTerm.
- Making every host-health metric identical across operating systems.
- Adding remote terminals, cloud synchronization, or an AI provider integration.
- Parsing arbitrary HTML emitted by terminal programs.
- Supporting Windows versions without ConPTY.
- Shipping signed or notarized artifacts before signing credentials are configured.

## Support Policy

### Linux

Linux keeps the existing complete feature set. Bash, zsh, and fish retain enhanced
OSC 133/OSC 7 integration. Other shells remain usable with reduced command metadata.
Existing Debian, AppImage, RPM, and tarball packages remain available.

### macOS

macOS supports terminal sessions, tabs, panes, file operations, audit logs,
snapshots, the AI Reader, and host health. The default shell comes from `$SHELL`,
falling back to `/bin/zsh`. Packages are produced for Intel and Apple Silicon as DMG
and ZIP artifacts. Unsigned artifacts must be clearly labeled until signing and
notarization are configured.

### Windows

Windows 10 version 1809 or newer and Windows 11 are supported through node-pty and
ConPTY. Shell selection uses the first available executable in this order:

1. `pwsh.exe` (PowerShell 7);
2. `powershell.exe` (Windows PowerShell 5.1);
3. `cmd.exe`.

Terminal sessions, tabs, panes, files, audit logs, ZIP snapshots, and the AI Reader
are supported. PowerShell integration emits OSC 7 for cwd and OSC 133 markers when
the active shell can load the generated integration script. Windows packages are
produced as NSIS installers and portable ZIP artifacts for x64. Windows ARM64 is
deferred until x64 behavior is verified on a real runner.

WSL and Git Bash profile discovery are future enhancements, not release blockers.

## Architecture

### Platform Boundary

The current backend mixes portable API behavior with Linux-specific commands and
`/proc` parsing. New modules under `platform/` will own these differences:

- `platform/index.ts` selects the implementation for `process.platform`.
- `platform/shell.ts` exposes shell discovery, launch arguments, one-shot command
  invocation, integration metadata, and history locations.
- `platform/metrics.ts` exposes normalized health data and explicit capability
  metadata.
- `platform/archive.ts` creates and describes snapshots in a platform-native format.
- `platform/paths.ts` resolves application data and backup directories.

`server.ts` and `pty.ts` consume these interfaces and do not directly inspect
`/proc`, assume POSIX shell flags, or build Unix-only data paths outside the Linux
implementation.

### Shell Interface

Shell discovery returns a `ShellProfile`:

```ts
interface ShellProfile {
  id: string;
  label: string;
  executable: string;
  args: string[];
  commandArgs(command: string): string[];
  kind: 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'plain';
  integration: string;
  historyFiles: string[];
}
```

The PTY launcher receives the profile instead of reading `$SHELL` directly.
One-shot execution uses `commandArgs`, avoiding the current universal `-lc`
assumption. No renderer-provided environment overrides are accepted.

The environment endpoint returns the selected shell and a capability summary so the
UI can label reduced integration honestly.

### Host Metrics

All platform implementations return the current health response shape plus:

```ts
interface HealthCapabilities {
  memoryBreakdown: boolean;
  processDetails: boolean;
  mounts: boolean;
  diskIO: boolean;
  perCoreCpu: boolean;
  cpuTemperature: boolean;
  networkRates: boolean;
}
```

Linux keeps `/proc`, `ps`, and `statfs`. macOS uses Node `os` APIs plus stable system
commands such as `ps`, `df`, and `sysctl` where Node has no equivalent. Windows uses
Node APIs and bounded, non-interactive PowerShell/CIM queries. Commands use argument
arrays rather than interpolated shell strings. A failed probe returns `null`, an
empty collection, or `false` capability metadata; it never returns a made-up zero.

The health view changes Linux-specific labels such as `/proc/meminfo` to neutral
labels and shows `Unavailable on this platform` only for unsupported sections.

### Snapshots

Linux and macOS continue to create `.tar.gz` archives. Windows creates `.zip`
archives through PowerShell `Compress-Archive` or a small JavaScript ZIP dependency
chosen during implementation. The archive adapter returns the artifact path, size,
format, and a platform-appropriate restore instruction. Backup listing recognizes
both formats.

### Data Locations

Electron passes its `userData` directory to the backend as `OMNITERM_DATA_DIR`.
Development mode falls back to an OS-standard location:

- Linux: `$XDG_DATA_HOME/omniterm` or `~/.local/share/omniterm`;
- macOS: `~/Library/Application Support/OmniTerm`;
- Windows: `%APPDATA%\\OmniTerm`.

Existing Linux data is not moved.

## AI Reader

### Parsing Model

The parser remains pure and testable. It expands `ReaderBlock` to represent headings,
paragraphs, block quotes, fenced code, ordered and unordered list items, tables, and
display math. Inline parsing represents text, emphasis, code, links/paths, and inline
math as typed tokens rather than reparsing independently in React.

Supported TeX delimiters are:

- inline: `$...$` and `\\(...\\)`;
- display: `$$...$$` and `\\[...\\]`.

Currency-like text such as `$20` is not treated as math unless it has a matching
delimiter and TeX-like content. Escaped dollar signs remain text. Incomplete display
math in a streaming response stays visible as source until its closing delimiter
arrives.

### TeX Rendering

KaTeX renders math with `throwOnError: false`, strict trust disabled, and no HTML
from the terminal inserted directly into the DOM. Unsupported commands display a
readable error-styled source representation. KaTeX CSS is bundled with the renderer;
there is no CDN dependency.

### Reader Layout

The side panel keeps its current non-invasive behavior: it observes the focused
terminal pane and never writes to the PTY. Content uses a constrained reading width,
clear heading rhythm, grouped lists, distinct display-math spacing, horizontally
scrollable code/table blocks, and responsive full-width behavior on small screens.
Zoom, follow/pause, copy, close, keyboard focus, and clickable paths remain.

Unix paths, Windows drive paths (`C:\\work\\file.ts`), UNC paths, and line/column
suffixes are recognized conservatively. Ordinary prose containing slashes or
backslashes is not turned into a file target.

## Packaging and CI

`package.json` gains explicit scripts and electron-builder configuration for:

- Linux: current formats and architectures;
- macOS: DMG and ZIP for x64 and arm64;
- Windows: NSIS and portable ZIP for x64.

CI uses a native operating-system matrix. Each runner installs dependencies, rebuilds
`node-pty` for its Electron ABI, runs portable unit tests, builds the app, and creates
its native packages. PTY smoke tests run with bash on Linux, zsh on macOS, and the
selected PowerShell on Windows. Release jobs publish each platform's artifacts and a
single checksum manifest.

Package creation is distinct from code signing. CI must not claim signed/notarized
status when credentials are absent. The README documents the resulting OS warning for
unsigned preview builds.

## README Structure

The README is reduced to:

1. one-paragraph product description;
2. a concise feature list;
3. a platform-support table;
4. install instructions for Linux, macOS, and Windows;
5. development and verification commands;
6. a short security/local-data note;
7. links to troubleshooting, contributing, performance, and security documents.

Detailed architecture, shell matrices, performance measurements, and troubleshooting
stay in dedicated documents. Contradictory statements that AI is absent or that
cross-platform support is permanently out of scope are removed.

## Testing

### Reader

- parser tests for all TeX delimiters, escaped dollars, currency, malformed TeX,
  streaming display math, tables, list grouping, ANSI cleanup, and Windows paths;
- component tests proving KaTeX output, fallback behavior, keyboard controls, copy,
  zoom, and accessible labels;
- existing path false-positive cases remain covered.

### Platform Modules

- unit tests inject platform, environment, executable lookup, filesystem, and command
  results rather than mutating the host;
- contract tests run the same shell/metrics/archive assertions for each adapter;
- API tests verify capability metadata and platform-neutral responses;
- native CI PTY smoke tests verify a real prompt, command, cwd update, interrupt, and
  exit code on every supported operating system.

### Packaging

- each native runner builds its artifacts;
- Linux retains its `.deb` installation check;
- Windows performs a silent NSIS install/uninstall smoke check;
- macOS mounts or inspects the DMG and verifies the application bundle;
- checksum generation covers every published artifact.

## Error Handling

- Missing preferred shells fall through to the next supported shell.
- If no shell can launch, the UI receives a specific startup error naming the probes.
- Metrics failures are isolated per probe and surfaced through capability metadata.
- Snapshot failures preserve stderr without exposing secrets or deleting partial user
  data; partial archives are removed.
- TeX parse/render failures preserve the original source text.
- Native packaging failures block only the affected matrix job and therefore prevent
  a release from being marked complete.

## Migration and Compatibility

- Existing Linux settings, audit trails, backups, and workspace state remain valid.
- The existing HTTP and WebSocket routes remain stable; new capability fields are
  additive.
- Older frontends can ignore the new fields.
- Existing `.tar.gz` backups remain listable after the archive abstraction lands.
- No user shell configuration file is modified directly; generated integration files
  live under OmniTerm's data directory.

## Acceptance Criteria

- Reader tests demonstrate correct inline/display TeX rendering and safe fallbacks.
- Reader output has structured headings, paragraphs, lists, tables, code, and math.
- Linux behavior and current shell integrations do not regress.
- macOS and Windows native CI jobs launch a PTY and produce installable artifacts.
- Windows selects PowerShell 7 when available and falls back without configuration.
- Unsupported health details are labeled unavailable rather than reported as zero.
- Snapshots can be created and listed on all supported platforms.
- The README is concise, accurate, and includes install/build instructions for all
  three operating systems.
- Type checking, linting, formatting, unit/API tests, native smoke tests, and package
  builds pass on their corresponding runners.
