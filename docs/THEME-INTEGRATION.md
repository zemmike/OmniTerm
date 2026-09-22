# Terminal integration: colours, and what a program can ask for

OmniTerm is a terminal, so the rules that apply to it are the terminal rules: a program
inside it can ask about colours, and can ask to be told when they change. This page is what
OmniTerm answers, what it announces, and the cases it deliberately cannot reach.

## What OmniTerm tells a program

| Signal                    | Value                                                 |
| ------------------------- | ----------------------------------------------------- |
| `TERM_PROGRAM`            | `OmniTerm`                                            |
| `COLORTERM`               | `truecolor`                                           |
| `OMNITERM`                | `1`                                                   |
| `OMNITERM_SESSION`        | the session id, for logs                              |
| `TERM`                    | `xterm-256color`                                      |
| `OSC 10` / `OSC 11` / `OSC 12` | answered live with the current theme's foreground, background and cursor |
| `OSC 4`                   | answered from the current theme's palette              |

The `OSC` answers are live, not cached: the value a program gets is the theme that is on
screen when it asks.

## The colour-scheme protocol

```text
program  ->  CSI ? 996 n        which scheme is this terminal?
terminal ->  CSI ? 997 ; 1 n    dark
             CSI ? 997 ; 2 n    light

program  ->  CSI ? 2031 h       tell me when the scheme changes
terminal ->  CSI ? 997 ; 1 n    it is dark now   (or ;2 for light)
```

The payload is deliberately "re-ask", not the colour itself: a program that receives
`997;1` or `997;2` should re-issue its `OSC 10`/`OSC 11` probe and update its rendering.
OmniTerm sends that report when the theme changes, to any pane whose program has enabled
`DECSET 2031`.

Check it by hand:

```bash
# ask for the background colour (the terminal replies on its own line)
printf '\033]11;?\007' ; sleep 0.2

# ask which scheme, then watch for a report while you change the theme in Settings
printf '\033[?996n' ; printf '\033[?2031h'
```

## Why a session did not follow a theme change

This was a real report: a coding agent running inside a multiplexer kept its old colours
after the OmniTerm theme changed. The cause is at the top of this page - **programs read
the terminal's colours once, at startup, and keep them**. Nothing in the terminal can
change a value the program has already cached; it has to be told to look again, which is
what `DECSET 2031` is for. OmniTerm now answers the query, and announces the change.

If a program still keeps its old colours, it is reading the palette once and not asking to
be notified. That cannot be fixed from the terminal side. What helps:

1. Enable the program's own "follow the terminal" / "auto theme" setting, which usually
   re-probes at startup only.
2. Restart that session after changing the theme, which makes it re-read the palette.
3. Ask the program's maintainers for `DECSET 2031` support - it is a two-line change on
   their side, and the terminal half is already in place.

## Matching Herdr to your theme

Herdr is a terminal multiplexer for coding agents with its own interface, and its config has
a `[theme]` table. Settings → **Herdr → Match Herdr to this theme** writes three keys into
`config.toml` and asks Herdr to reload:

```toml
[theme]
auto_switch = true
dark_name = "terminal"
light_name = "terminal"
```

`terminal` means Herdr paints itself with the terminal's own palette — the colours OmniTerm
is actually drawing with — and `auto_switch` makes it follow the light/dark switch, which is
the protocol above. So Herdr ends up matching this theme exactly rather than approximately,
and it follows when you change theme.

What the button guarantees:

- It writes **those three keys and nothing else**. Every other line, comment and section of
  your `config.toml` is copied through untouched, including `[theme.custom]` colour overrides.
- The config path is **asked for, not assumed**: OmniTerm reads Herdr's own reported socket
  location, so it edits the file Herdr reads.
- One backup is taken before the first change, at `config.toml.omniterm-backup`, and kept.
  **Restore my config** puts it back and reloads. If no config existed before, restoring
  removes the file again.
- Every write is validated with `herdr config check` before Herdr is asked to reload. If
  Herdr rejects the file, the change is **rolled back immediately** and the error is shown.
- It never runs on its own — not at startup, not when you change theme.

This styles **Herdr's own interface**. It does not, and cannot, restyle what runs inside a
Herdr pane: those programs draw their own colours from the palette they read.

## What OmniTerm cannot reach

- **Another program's own palette.** A full-screen TUI draws its own colours; a theme change
  in OmniTerm changes the terminal's device colours, not the TUI's choices. Herdr's chrome,
  a tmux status bar, or an editor with its own theme will look the same.
- **A program that never asks.** If it hardcodes a dark theme and never queries the
  terminal, no terminal can restyle it.

For Herdr specifically, restyling Herdr's own interface means integrating with Herdr rather
than the terminal - a native OmniTerm workspace driven by Herdr's own API, where OmniTerm
renders the panes with its own components. That design is
[written up separately](superpowers/specs/2026-09-22-herdr-integration-design.md) and is a
project of its own, not a styling option.

## The other direction: what OmniTerm reads

OmniTerm reads the pane's working directory from the shell (`OSC 7`), and a clicked file
path is resolved against it. When a path does not exist there - an agent can outlive the
directory it was started in - the file is looked up by name under that directory before the
Files tab reports it missing.
