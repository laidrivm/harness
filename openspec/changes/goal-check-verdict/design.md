# goal-check-verdict — design

## Context

The motivation is in proposal.md, *Why*, and the requirement is in
`specs/stage-goal/spec.md`.

`pullRequest()` in `bun/goal-check.ts` makes one call,
`gh pr list --head <branch> --state open --json headRefOid`, and takes the
condition as held when one of the heads it returns is `HEAD`. If the call
exits non-zero, cannot be spawned or prints something that is not JSON, the
function returns `the pull request's state could not be read`. The check is
a script with top-level code, spawned both by the stage session (its `/goal`
condition) and by `board-loop`'s runner from a copy of the pinned `bun/`.
Its tests spawn it too, through `bun/goal-check.fixture.ts`, with a stub `gh`
on a `PATH` of its own that answers one exact argument list.

`gh pr list` returns pull requests newest first, at most 30 by default. Each
record's `state` reads `OPEN`, `CLOSED` or `MERGED`. A pull request merged
by squash or by rebase keeps the `headRefOid` its branch had when it merged.

## Goals / Non-Goals

**Goals:**

- One verdict per stage, change, step and commit, once `gh` answers.
- The merge leaves the verdict where it was.
- A transient failure of `gh`, like the TLS handshake timeout the live run
  hit, no longer decides the verdict.

**Non-Goals:**

- Telling an unreadable state apart from `open` in the exit status (see
  proposal.md, *Non-goals*).
- Any change to `board-loop.ts`, which reruns the pinned check and reads its
  last line as it does now.
- Telling a network failure apart from a missing or unauthenticated `gh`.

## Decisions

### D1. One query over every state, matched on head and state together

The query becomes `gh pr list --head <branch> --state all --limit 1000
--json headRefOid,state`. `gh` lists 30 records by default, newest first, so
without the limit 30 later closed pull requests on the branch could hide an
open or merged one at `HEAD`. The condition holds when some record has
`headRefOid` equal to the full `HEAD` and `state` equal to `OPEN` or
`MERGED`. A record with any other state, or none, never satisfies it.

The open line names what was found:

- no record is open or merged: `no open or merged pull request for <branch>`;
- otherwise, the first open or merged one has another head:
  `the pull request's head is <short>, not <short>`.

A closed pull request at `HEAD` therefore reads as the first case, since
closing without a merge withdraws the step.

*Alternatives.* Two queries, one for `open` and one for `merged`, double the
calls that can fail. `gh pr view <branch>` reads only the newest pull request
of a branch, so a closed one opened after a merged one would hide the merge.
The 30-record default is kept: a branch is never reused once its pull request
has merged (`core/git-and-prs.md`), so 30 pull requests on one branch name
do not occur.

### D2. Three tries, two seconds apart, for any failure

`pullRequest()` tries the read up to three times and pauses two seconds
between tries, never after the last one. A try fails on the same grounds as
today: a non-zero exit, a spawn that throws, or output that is not a JSON
array. The first try that succeeds decides the condition by D1. If all three
fail, the line is the one it is today, `the pull request's state could not be
read`. At most four seconds are added, and only to a run that would otherwise
read `open` for want of an answer.

The retry does not sort failures by cause. `gh` gives no exit status that
reliably separates a network failure from a missing login. A missing `gh`
waits four seconds for an `open` it would have reached anyway. That costs
less than a classifier that misreads one network failure as permanent.

The pause uses `Bun.sleepSync`, since the script is synchronous from top to
bottom.

*Alternatives.* Retrying only in the runner leaves the session's own `/goal`
loop flipping, as the live run's 18:21:49 record shows. A longer back-off
lengthens every unattended stop while `gh` is down, for a failure the live run
recovered from within eight seconds.

### D3. The pause is read from the environment, and the fixture sets it to 0

The check reads the pause in milliseconds from `GOAL_CHECK_RETRY_MS`. When the
variable is unset, or is not a whole number of zero or more, the pause is
2000. The fixture sets it to `0` in the environment it builds. The tests that
drive `gh` to fail then run with no real sleep, and the number of tries stays
exactly what ships.

The check runs as a spawned script with no exports, so a parameter cannot
reach it from a test. A command-line flag would change the usage line and
the malformed-call contract that *A malformed call* fixes. The environment
is already how the fixture steers the check (`XDG_STATE_HOME`, `PATH`).

### D4. The stub counts its calls in a file

A retry test needs a `gh` that fails some number of times and then answers.
The stub is a shell script and keeps no memory between calls, so the fixture's
`Gh` gains an optional `fails` count. The stub appends a line to a file in its
own `bin` directory on each call. It exits 1 while the file has no more than
`fails` lines, and answers after that. The same file lets a case assert how
many tries were made.

### D5. The requirement is modified, not added beside

The edits change the wording of two scenarios, *A proposal ready for review*
and *An apply step*, from an open pull request to an open or merged one. Only
a `MODIFIED` copy can change a live scenario's wording. An `ADDED`
requirement beside it would leave those scenarios naming *open* and read as
if a merge were not enough. The copy is about 100 lines, inside the budget.
Before archiving, diff it against the live requirement as
`core/feature-workflow.md` asks.

## Risks / Trade-offs

- [`gh` stays unreachable for longer than four seconds] → The check reads
  `open` and says why, as today. The session's goal loop runs the check again
  on its next stop, and the runner's pass records `open` with that reason.
  That is the case the deferred `unknown` outcome would serve.
- [A merged pull request at `HEAD` reads `met` long after the step shipped]
  → That is the intent. The verdict describes the commit, and the commit
  shipped. A new commit on the branch moves `HEAD` and reads afresh. The
  merged-branch guard refuses that commit anyway.
- [`GOAL_CHECK_RETRY_MS` set in a user's shell lengthens or removes the
  pause] → It changes only the pause, never the number of tries or the
  verdict. A value that is not a whole number falls back to 2000.

## Migration Plan

None. A consumer picks the fix up with its next harness pin bump. No ledger
record, exit status or gate line changes shape.
