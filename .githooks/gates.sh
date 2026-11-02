#!/usr/bin/env bash
# The judged gates `openspec/specs/commit-gates/spec.md` lists, cheapest first,
# run from the repository's root. The pre-push hook runs this, and so does the
# pre-PR runner as `harness.bumpTest`, so a runner `pass` is a commit the push
# accepts. Inert here: git runs only files named after a hook.
set -euo pipefail
bun bun/check-yaml.ts
bun bun/no-suppressions.ts
bunx --no-install biome ci .
bunx --no-install tsc --noEmit
# Absent, they pass: CI runs both from pinned versions, where their verdict binds.
if command -v actionlint >/dev/null; then actionlint; fi
if command -v gitleaks >/dev/null; then
	# The range the push sends, from the base the diff budget reads; CI scans the whole history.
	base=$(bash bun/diff-base.sh)
	gitleaks git . --log-opts="$base..HEAD" -v --redact --no-banner
fi
bun test
