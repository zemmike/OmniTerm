#!/usr/bin/env bash
# ==============================================================================
# Fails if any action referenced from .github/workflows is not pinned to a full
# 40-character commit SHA.
#
# A mutable tag such as `actions/checkout@v4` is a supply-chain hole: whoever
# controls that tag (or compromises the upstream account) can re-point it at new
# code that then runs with this repository's token. A commit SHA cannot be
# re-pointed, and the version stays legible in the trailing comment:
#
#   - uses: actions/checkout@11d5960a...677262 # v4.4.0
#
# Local actions (`./path`) and container images (`docker://`) are skipped - they
# are not resolved through a tag.
#
# Usage: bash scripts/check-action-pins.sh [workflows-dir]
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOWS_DIR="${1:-${SCRIPT_DIR}/../.github/workflows}"

# `${var#*@}` on a sha-only string yields the whole string, so compare against
# the whole match instead: 40 lowercase hex characters and nothing else.
SHA_RE='^[0-9a-f]{40}$'

shopt -s nullglob
FILES=("$WORKFLOWS_DIR"/*.yml "$WORKFLOWS_DIR"/*.yaml)
if [ "${#FILES[@]}" -eq 0 ]; then
  echo "check-action-pins: no workflow files found in ${WORKFLOWS_DIR}" >&2
  exit 1
fi

errors=0
checked=0
warnings=0

for file in "${FILES[@]}"; do
  display="${file#"$(dirname "$(dirname "$WORKFLOWS_DIR")")"/}"
  # `uses:` appears as a list item ("- uses:") under steps/jobs.
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    lineno="${hit%%:*}"
    content="${hit#*:}"

    # Everything after the `uses:` key, then drop any trailing inline comment.
    value="${content#*uses:}"
    value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    case "$value" in
      '' | '#'*) continue ;;
    esac
    ref="$(printf '%s' "${value%%#*}" | sed -e 's/[[:space:]]*$//')"
    case "$ref" in
      ./* | docker://*) continue ;;
    esac

    pin="${ref##*@}"

    if [ "$pin" = "$ref" ]; then
      printf '::error file=%s,line=%s::%s has no @<ref>\n' "$display" "$lineno" "$ref"
      errors=$((errors + 1))
      continue
    fi
    if ! [[ $pin =~ $SHA_RE ]]; then
      printf '::error file=%s,line=%s::%s is not pinned to a 40-character commit SHA\n' \
        "$display" "$lineno" "$ref"
      errors=$((errors + 1))
      continue
    fi

    checked=$((checked + 1))
    if ! [[ $value =~ \#[[:space:]]*v?[0-9] ]]; then
      # Not a failure: a pin is still a pin. But the version comment is what
      # makes the pin reviewable and upgradable, so say so.
      printf '::warning file=%s,line=%s::%s is pinned but has no "# <version>" trailing comment\n' \
        "$display" "$lineno" "$ref"
      warnings=$((warnings + 1))
    fi
  done < <(grep -nE '^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*[^[:space:]]' "$file" || true)
done

if [ "$errors" -ne 0 ]; then
  printf '\ncheck-action-pins: %d unpinned action reference(s) across %d workflow file(s).\n' \
    "$errors" "${#FILES[@]}" >&2
  printf 'Resolve a tag to its SHA with:\n' >&2
  printf '  gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha\n' >&2
  exit 1
fi

printf 'check-action-pins: %d action reference(s) pinned to commit SHAs (%d warning(s)).\n' \
  "$checked" "$warnings"
