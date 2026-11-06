#!/usr/bin/env bash
# The judged gates `openspec/specs/commit-gates/spec.md` lists, cheapest first,
# run from the repository's root. The pre-push hook runs this, and so does the
# pre-PR runner as `harness.bumpTest`, so a runner `pass` is a commit the push
# accepts. Inert here: git runs only files named after a hook.
set -euo pipefail
bun bun/check-yaml.ts
bun bun/no-suppressions.ts
# Errors alone, uncoloured: its warnings, a colour code per character, filled every run's output; `biome lint` shows them.
bunx --no-install biome ci --colors=off --diagnostic-level=error .
bunx --no-install tsc --noEmit
# Absent, they pass: CI runs both from pinned versions, where their verdict binds.
if command -v actionlint >/dev/null; then actionlint; fi
if command -v gitleaks >/dev/null; then
	# The range the push sends, from the base the diff budget reads; CI scans the whole history.
	base=$(bash bun/diff-base.sh)
	# `warn`: a finding is logged at it, while the counts it logs on a clean scan are `info`.
	gitleaks git . --log-opts="$base..HEAD" -v --redact --no-banner --log-level=warn
fi
# Without the runner's base: the suite's cases read `diff-base.sh` with none set.
env -u HARNESS_BASE bun test
# Two commands, so a crashed Stryker fails here and the floor never reads a stale report. Over current stored
# results the step mutates nothing; a module it re-runs fails until its rewritten stored file is committed.
bun bun/mutation-run.ts
bun bun/mutation-floor.ts
