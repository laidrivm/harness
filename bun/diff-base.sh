#!/usr/bin/env bash
# The base a branch is measured from when none is given, printed alone: the
# one copy of the rule, which `diff-budget.sh` and the pre-PR runner both run,
# so the budget and the runner's step list read the same diff.
set -uo pipefail

# The remote-tracking ref is kept whole: `origin/main` resolves wherever
# `main` does and also where the local branch was never checked out.
# Not `rev-parse --abbrev-ref origin/HEAD` — with no origin/HEAD it echoes
# the argument back, and `HEAD...HEAD` is an empty diff, so every branch
# would read PASS at 0 lines.
base=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
echo "${base:-main}"
