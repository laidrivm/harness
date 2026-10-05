#!/usr/bin/env bash
# The review budget for one pull request: how many lines a reviewer must
# actually read between <base> and HEAD. Prints one gate line and exits
# non-zero when the diff is over budget or cannot be measured.
#
# Its two callers read that exit differently, on purpose. CI fails on it, so an
# unmeasured diff never passes. The pre-push hook wraps the call in `|| true`
# and absorbs every non-zero, including the unmeasurable one — a developer
# whose base branch is not fetched is not blocked by a measurement, and CI
# fails the check instead. That asymmetry is required by `change-slicing`
# §*The gate is hard in CI and soft before the push*, not an oversight in
# `package.json`, which carries no comment of its own to say so.
set -uo pipefail

WARN_AT=500
FAIL_AT=800

# An unmeasured diff must never read as a passing one, so every way of
# failing to measure leaves through here.
die() {
	echo "DIFF gate: ERROR — $1" >&2
	exit 2
}

base="${1:-}"
if [ -z "$base" ]; then
	# The remote-tracking ref is kept whole: `origin/main` resolves wherever
	# `main` does and also where the local branch was never checked out.
	# Not `rev-parse --abbrev-ref origin/HEAD` — with no origin/HEAD it echoes
	# the argument back, and `HEAD...HEAD` is an empty diff, so every branch
	# would read PASS at 0 lines.
	base=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
	base="${base:-main}"
fi

git rev-parse --verify --quiet "${base}^{commit}" >/dev/null ||
	die "cannot resolve base ref '${base}'"
git merge-base "$base" HEAD >/dev/null 2>&1 ||
	die "no merge base between '${base}' and HEAD"

# Artefacts nobody reads line by line. Everything else counts, `openspec/**`
# included — a proposal too large to read is the case this gate exists for.
EXCLUDE=(':(exclude)bun.lock' ':(exclude)*.woff2' ':(exclude)src/fixtures/snapshot.json')
# Classification is by pathspec, so `src/app/latest.ts` stays source.
TESTS=('*.test.ts' '*.test.tsx' 'e2e/**')

# `-M -l0` for the reason `authored_proposal` carries them, and here they
# decide the number rather than a branch of it: a moved file is nothing to read
# where the rename is detected and its whole length twice where it is not, so
# the same branch measured PASS at 0 and FAIL at 800 across `diff.renames`. The
# gate exists to give one answer, so it asks rather than inheriting a
# preference.
count() {
	git diff -M -l0 "${base}...HEAD" -- "$@" "${EXCLUDE[@]}" | awk '
		/^diff --git / { inhunk = 0; next }
		/^@@/          { inhunk = 1; next }
		!inhunk && /^\+\+\+ / {
			# A deleted file reads `+++ /dev/null`, which needs no fallback to
			# the `---` header: it contributes removed lines only, and a pair
			# needs one of each.
			path = substr($0, 5)
			sub(/^b\//, "", path)
			next
		}
		!inhunk { next }
		/^[+-]/ {
			sign = substr($0, 1, 1)
			text = substr($0, 2)
			# A task line differs from every other line in one way: ticking it
			# changes state, not content. Only that flip is free.
			if (text ~ /^[ \t]*- \[[ xX]\] /) {
				box = (text ~ /^[ \t]*- \[ \] /) ? " " : "x"
				norm = text
				sub(/- \[[ xX]\] /, "- [] ", norm)
				key = path SUBSEP norm
				seen[key] = 1
				if (sign == "+") add[key, box]++; else rem[key, box]++
				boxes++
				next
			}
			lines++
		}
		END {
			# A pair is one file, one text, opposite boxes: a tick or its
			# reverse. Anything else — a rewritten task, a task moved between
			# files, a task moved with its box unchanged — pairs with nothing
			# and is read like any other line.
			for (key in seen) {
				ticked   = (rem[key, " "] < add[key, "x"]) ? rem[key, " "] : add[key, "x"]
				unticked = (rem[key, "x"] < add[key, " "]) ? rem[key, "x"] : add[key, " "]
				paired += ticked + unticked
			}
			print lines + boxes - 2 * paired
		}
	'
}

# The change directories in which this branch authored a proposal: those where
# it added both `proposal.md` and `tasks.md`. Printing nothing means the branch
# is not a propose-stage one, or is one half of a split.
#
# `:(glob)` is what stops `*` at a path separator. A plain pathspec's wildcard
# crosses one, so `openspec/changes/archive/<date>-<slug>/proposal.md` would
# match and reduce to the `archive` directory — an archive holding both files
# would then read as an unsplit proposal. `--diff-filter=A` tells authoring
# from moving: `/opsx:archive` relocates the pair, and a relocation adds
# nothing.
#
# `-M -l0` is what makes that second half hold whatever the developer's config
# says: `diff.renames=false` turns detection off outright, and without it a
# change directory renamed to a new slug reads as deletions plus additions —
# the additions match the glob, so the branch would be refused for authoring a
# proposal it merely moved.
#
# `-l0` cannot be exercised here and is carried anyway, so that both calls ask
# git the same question. `diff.renameLimit` skips detection once the candidate
# matrix outgrows the limit, but git pairs same-basename files before it
# consults one, and every path this pathspec matches is named `proposal.md` or
# `tasks.md` — measured, a limit of 1 changes nothing here. Where basenames
# differ it does bite, which is `count`'s case and where the flag is tested.
authored_proposal() {
	git diff -M -l0 --diff-filter=A --name-only "${base}...HEAD" -- \
		':(glob)openspec/changes/*/proposal.md' \
		':(glob)openspec/changes/*/tasks.md' |
		sed -E 's|^openspec/changes/([^/]+)/.*|\1|' | sort | uniq -d
}

# A pipeline that died partway still prints a number, so the exit status is
# what says the count is whole; the numeric test catches an empty half, which
# arithmetic would otherwise read as a zero.
test_lines=$(count "${TESTS[@]}") || die "could not count the tests"
source_lines=$(count . "${TESTS[@]/#/:(exclude)}") || die "could not count the source"
[[ "$test_lines$source_lines" =~ ^[0-9]+$ ]] || die "counted no lines at all"
total=$((source_lines + test_lines))

if [ "$total" -ge "$FAIL_AT" ]; then
	verdict="FAIL"
	tail=" — over ${FAIL_AT}"
	if [ -n "$(authored_proposal)" ]; then
		# The body is not read at all here: the marker admits a diff the
		# project cannot make smaller, and this one it can, along the seam the
		# four artefacts already are. Naming the two branches answers the
		# reader holding the branch, so the failure needs no trip to the
		# capability — including when the marker carries no reason, since the
		# reason it would ask for is one this refusal would not accept.
		tail="${tail}, split it: proposal.md and the delta specs on"
		tail="${tail} spec/<slug>, design.md and tasks.md on spec/<slug>-plan"
	else
		# The override lives in the pull request body, which the caller passes
		# in `PR_BODY`; a marker with nothing after it names no reason and
		# clears nothing. GitHub bodies arrive with CRLF line endings, and the
		# trailing `[[:space:]]` strip below takes the carriage return with it.
		markers=$(printf '%s\n' "${PR_BODY:-}" | grep -E '^[[:space:]]*oversize:' || true)
		if [ -n "$markers" ]; then
			# The first marker that carries a reason decides, so an empty one
			# earlier in the body does not shadow a later valid one.
			reason=$(printf '%s\n' "$markers" |
				sed -E 's/^[[:space:]]*oversize:[[:space:]]*//; s/[[:space:]]+$//' |
				grep -m1 -v '^$' || true)
			if [ -n "$reason" ]; then
				verdict="OVERRIDE"
				tail=" — over ${FAIL_AT}, oversize: ${reason}"
			else
				tail=" — over ${FAIL_AT}, oversize: marker carries no reason"
			fi
		fi
	fi
elif [ "$total" -ge "$WARN_AT" ]; then
	verdict="WARN"
	tail=" — over ${WARN_AT}, fails at ${FAIL_AT}"
else
	verdict="PASS"
	tail=""
fi

echo "DIFF gate: ${verdict} — ${total} lines (${source_lines} source / ${test_lines} test)${tail}"
[ "$verdict" = "FAIL" ] && exit 1
exit 0
