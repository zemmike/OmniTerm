<!--
Thanks for the pull request. Keep it focused: one change, one PR.

Before opening, make sure you have read CONTRIBUTING.md — in particular the
non-negotiable rules (security boundary, no simulated terminal output, treat
everything as untrusted input, honest docs).
-->

## What changed

<!-- The change, in a few sentences. If it is a bug fix, name the bug. -->

## Why

<!-- The problem this solves, and why this approach rather than another. Link the issue: "Closes #123". -->

## How it was tested

<!--
Be specific and honest. "Ran the suite" is not enough on its own — say which
commands, and what you saw. If you tested a shell, name the shell. If you tested
on Wayland, say so (and report it, that row of the support matrix is untested).
-->

## Gates run

Tick what you actually ran. Leave unticked what you did not — an honest gap is
much better than a tick that was not earned.

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run build` (required before the API suites: they test `dist/server.cjs`, not the sources)
- [ ] `npm test`
- [ ] `npm run test:pty`
- [ ] `npm run test:pty-matrix` (bash, zsh, fish, dash — needs zsh and fish installed)
- [ ] `npm run test:coverage`
- [ ] Launched the app manually (`npm run dev` or `npm start`) and exercised the change

## Security impact

<!--
Which applies? Be explicit — this section is read first.
-->

- [ ] **No security impact** — the change does not touch auth, the API surface, the CSP, the sandbox, file paths or command execution.
- [ ] **Touches a security-relevant area**, and here is the reasoning:

<!--
If it touches any of: the token check, the Host/Origin allowlist, the CSP, the
Electron sandbox or `preload.cjs`, path handling, `/api/files*`, backups,
`/api/terminal/execute`, or anything that reaches a shell — say why it is still
safe, and say what an attacker gains if it is wrong. Weakening the boundary
needs an issue and a threat model first, not a line in a diff.
-->

## Accessibility impact

<!--
OmniTerm is a terminal; a terminal a screen reader cannot navigate is broken for
the people who most need it. UI changes must come with an axe run.
-->

- [ ] **No UI change.**
- [ ] **UI changed**, and it has an axe-covered test in `tests/a11y.test.tsx` (rendering the populated state, with its `fetch` fixture added to `tests/helpers/a11y-api.ts` if it calls a new endpoint).
- [ ] **UI changed**, with a reason no a11y test was added:

<!--
Do not add rule exclusions to make the suite pass — fix the component.
-->

## Checklist

- [ ] The change is focused, and I have not reformatted or refactored unrelated code.
- [ ] New/changed API routes live inside the authenticated `/api` router, validate their input, and return real errors.
- [ ] No route, value or log line invents data that is not readable from this machine — blanks and explicit "unavailable" states are used instead.
- [ ] If this changed behaviour users can see, the docs are updated (README / `docs/`, and `CHANGELOG.md` under `[Unreleased]`).
- [ ] I did **not** edit `.github/workflows/**` in this PR (workflow changes need their own PR with a justification).
- [ ] No secrets, tokens or machine-specific paths were committed.
