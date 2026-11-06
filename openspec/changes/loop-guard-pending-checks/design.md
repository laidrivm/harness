# Design

## Context

The guard counts every `PostToolUseFailure` it receives (`bun/loop-guard.ts`,
`guard()`); for Bash the error's first line is `Exit code <n>`, followed by
the output. gh 2.97.0 documents `8: Checks pending` under `gh pr checks
--help`, and on 2026-11-06 a pull request with one check pending gave exit 8
for `gh pr checks <N> -R <repo>`, and 0 for the same command with
`--json name,state,bucket` and for `gh pr view <N> --json statusCheckRollup`.
A pending read's output often does not change between reads: a check still
pending shows `0` as its time, as CodeRabbit's did on #437, and the finished
checks' durations are digits the fingerprint folds, so reads count as one
call failing the same way until a check changes state or a duration crosses
a unit (`45s`, `1m5s`). The session transcripts on this machine hold
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

The exemption holds when the trimmed command is words separated by spaces
or tabs — `gh`, `pr`, `checks`, then words of letters, digits and
`./:@=_-`, then at most a last word `2>&1`, so `4372>&1` is no match — and the error's first line is exactly `Exit code 8`. Any
other character — a quote, `$`, a backtick, `;`, `|`, `&` outside `2>&1`, a
newline — leaves the call counted, since the shell may then run more than
gh, and the exit code need not be gh's. A newline is a command separator,
so the separator between words is spaces and tabs, never any whitespace.

Such a line is one simple command with at most one redirect, and a simple
command's exit status is its program's. No character of the set starts an
expansion that could add a command: no `$`, quote, backtick, glob character
or `~`. The one expansion left is zsh's `=word`, which replaces a leading
`=` word with a program's path or fails the line with status 1 before gh
runs, so it never yields an 8 that is not gh's. A run of the form under
dash, bash and zsh, with `gh` a function returning 8, was refused here by
the command guard as an unreadable program, so task 1.1 makes that run a
case.

- *Alternative: any command that starts with `gh pr checks`.* A chain such as
  `gh pr checks 1; false` exits with the last command's code, so its exit 8
  would not be gh's.
- *Alternative: parse the command with the command guard's scanner.* It
  finds commands in a line, but deciding whose exit code the call returns
  needs more than that — pipes, `&&`, `||`, `pipefail` — for a case the
  agents' real forms do not need.
- *Alternative: a convention to read CI with `--json`.* Proposal, *What
  Changes*.
- *Alternative: a table of command patterns and harmless exit codes.* One
  pair is known; a table waits for a second.

### Skip before the count is touched

The check sits in `guard()` beside the existing `is_interrupt` check: a
skipped call neither loads nor writes the count, so no earlier count of the
same call is raised and no bar is written. A `PreToolUse` event is decided
as today, by the call key alone: pending reads never bar a call, but a bar
left by three `Exit code 1` reads of the same command still refuses a later
pending read under that prompt (*Risks*).

### No pin on gh's code

The guard holds `8` as a literal, with a comment naming gh's help. If gh
ever renumbers *Checks pending*, the exemption stops matching and the guard
counts the read as it does today — the behaviour before this change, not a
silent pass — so no test reads gh's help, which CI's runner may not have.

## Risks / Trade-offs

- [A pending read that loops — an agent polling CI in a tight loop] → It is
  no longer warned, and no rule in this tree forbids polling; only the
  launch briefs of 2026-11-06 said to read CI once. Accepted: polling a
  pending state is not a call failing, which is what the guard is for, and
  the false warning cost two agents their CI read.
- [A bar by three failed-check reads refuses the read after a fix, under
  the same prompt] → As for any barred call: the warning and refusal tell
  the agent to change approach, and `gh pr checks <N> --json name,state`,
  a different call key that exits 0 while pending, reads CI on.
- [`gh` an alias or function in the user's shell, whose own exit 8 is then
  exempt] → Accepted: the guard cannot see the shell's definitions, and a
  wrapper's 8 is still one more uncounted call, not a refused one.
- [`gh pr checks $N` unpiped, which the word set leaves out though `$N`
  cannot add a command] → Counted as today; transcripts hold `$N` only in
  loops and pipes, so widening the set waits for a form seen alone.
- [A form agents use that the match leaves out, such as a pipe into `cut`]
  → That call is counted as today, and its exit code is the pipe's last
  command's anyway, so gh's 8 does not reach it.

## Migration Plan

None: the next session that loads the harness at the merged commit runs the
new guard; the count files need no change.
