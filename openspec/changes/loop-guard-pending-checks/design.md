# Design

## Context

The guard counts every `PostToolUseFailure` it receives (`bun/loop-guard.ts`,
`guard()`); for Bash the error's first line is `Exit code <n>`, followed by
the output. gh 2.97.0 documents `8: Checks pending` under `gh pr checks
--help`, and on 2026-11-06 a pull request with one check pending gave exit 8
for `gh pr checks <N> -R <repo>`, and 0 for the same command with
`--json name,state,bucket` and for `gh pr view <N> --json statusCheckRollup`.
A pending read's output changes little between reads: durations are digits,
which the fingerprint already folds, so three reads a minute apart count as
one call failing the same way. The session transcripts on this machine hold
`gh pr checks` in these forms: bare with a number, with `-R` or `--repo`,
with a trailing `2>&1`, and inside pipes and `;` chains.

## Goals / Non-Goals

**Goals:**
- A pending read is never counted, in the forms agents use that leave gh's
  exit code as the call's.

**Non-Goals:**
- Not counting `gh pr checks` exiting 1 on a failed check. That is a real
  state too, but a session reading it three times without acting is the
  loop the guard is for.
- Any other command's documented non-error exit code. None has been seen to
  trip the guard; each would be its own change.

## Decisions

### Match the whole command, and only exit 8

The exemption holds when the trimmed command is `gh pr checks`, then words of
letters, digits and `./:@=_-` separated by spaces or tabs, then at most one
trailing `2>&1`, and the error's first line is exactly `Exit code 8`. Any
other character — a quote, `$`, a backtick, `;`, `|`, `&` outside `2>&1`, a
newline — leaves the call counted, since the shell may then run more than
gh, and the exit code need not be gh's. A newline is a command separator,
so the separator between words is spaces and tabs, never any whitespace.

- *Alternative: any command that starts with `gh pr checks`.* A chain such as
  `gh pr checks 1; false` exits with the last command's code, so its exit 8
  would not be gh's.
- *Alternative: parse the command with the command guard's scanner.* It
  finds commands in a line, but deciding whose exit code the call returns
  needs more than that — pipes, `&&`, `||`, `pipefail` — for a case the
  agents' real forms do not need.
- *Alternative: a convention to read CI with `--json`.* Proposal, *What
  Changes*.

### Skip before the count is touched

The check sits in `guard()` beside the existing `is_interrupt` check: a
skipped call neither loads nor writes the count, so no earlier count of the
same call is raised and no bar is written. A `PreToolUse` event is decided
as today; a pending read is never barred, because it is never counted.

### No pin on gh's code

The guard holds `8` as a literal, with a comment naming gh's help. If gh
ever renumbers *Checks pending*, the exemption stops matching and the guard
counts the read as it does today — the behaviour before this change, not a
silent pass — so no test reads gh's help, which CI's runner may not have.

## Risks / Trade-offs

- [A pending read that loops — an agent polling CI in a tight loop] → It is
  no longer warned. The briefs and `orchestrator/runner/session-rules.md`
  already forbid waiting on CI in a loop, and a poll is cheap; the false
  warning cost two agents their CI read.
- [A form agents use that the match leaves out, such as a pipe into `cut`]
  → That call is counted as today, and its exit code is the pipe's last
  command's anyway, so gh's 8 does not reach it.

## Migration Plan

None: the next session that loads the harness at the merged commit runs the
new guard; the count files need no change.
