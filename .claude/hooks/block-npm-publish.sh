#!/usr/bin/env bash
# PreToolUse hook: block `npm publish` from agentic Bash calls.
# Publishing is irreversible (unpublish window is 72h and only if untouched).
# The user should run /npm-publish-checklist first, then publish themselves.

set -u

input=$(cat)

# Extract the Bash command. Prefer jq; fall back to a regex scan if jq is missing.
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')
else
  cmd=$(printf '%s' "$input" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1)
fi

# Match `npm publish` as a whole word (avoid matching `npm publish-tag` etc.).
if printf '%s' "$cmd" | grep -qE '(^|[^[:alnum:]_-])npm[[:space:]]+publish([[:space:]]|$|;|&)'; then
  cat >&2 <<'MSG'
Blocked: `npm publish` must be run manually, not from an agentic session.

Why: publishing is effectively irreversible (unpublish window is 72h and only
applies if no one has installed the version).

What to do instead:
  1. Run `/npm-publish-checklist` to validate version, files whitelist, and tarball.
  2. Run `npm publish` yourself in your own terminal.
MSG
  exit 2
fi

exit 0
