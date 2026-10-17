# gh-timeout

## Why

Two places read a branch's pull requests through `gh pr list`, and neither
bounds the call: `pullRequests()` in `bun/goal-check.ts`, which since #131
tries it up to three times, and `consider()` in `bun/board-loop.ts`. A `gh`
that neither answers nor fails — a stalled connection, say — holds its caller
for as long as it stalls:

- **The board loop's runner waits for ever.** `consider()` runs before any
  session starts, and the runner's own goal check after the stage session is
  spawned with no limit. The hour `board-loop` gives a stage session covers the
  session, not either read.
- **A stage session gets no verdict.** An agent runs the goal check through
  its Bash tool, which ends a call after two minutes by default. The call then
  ends with no `goal met` or `goal open` line, rather than with the check's
  own `the pull request's state could not be read`.

The two reads were written apart and have already drifted: the check passes
`--limit 1000`, and `consider()` takes `gh`'s default of 30 records.

## What Changes

- Each read of a branch's pull requests ends once it has had no answer for a
  fixed time, and counts as a failed read. In the goal check that is one
  failed try of the three it makes, so a later try can still answer and the
  whole check ends within a known bound. In the runner it is a failed pull
  request query, which already makes the change untakeable.
- The read is lifted into one module that both callers import, with its
  limit, its query (`--state all --limit 1000`) and its reading of the
  answer. The goal check keeps its retry around it, and `consider()` makes one
  read as now. `consider()` gains the `--limit 1000` the check already had.
- Neither caller's output changes: a read that runs out of time reads exactly
  like one that failed.

### Non-goals

- **A limit on other spawned commands.** `git`, `bun install` and the
  runner's spawn of the goal check stay unbounded. The goal check becomes
  bounded through this change, and nothing has hung in the others.
- **A retry in the runner.** A failed query makes the change untakeable for
  one pass, and the next pass reads again.
- **Telling a hang apart from a failure** in the check's line or the runner's
  reason.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stage-goal`: a new requirement, *A pull request read that does not answer
  is a failed try*.
- `board-loop`: a new requirement, *A pull request query that does not answer
  fails*.

## Impact

- `bun/pull-requests.ts`: new, the one read with its time limit.
- `bun/goal-check.ts`: `pullRequests()` calls the shared read inside its
  retry.
- `bun/board-loop.ts`: `consider()` calls the shared read.
- `bun/goal-check.fixture.ts` and `bun/board-loop.fixture.ts`: a stub `gh`
  that can hang.
- `bun/goal-check-io.test.ts`, `bun/board-loop-takeable.test.ts`: cases for a
  hanging `gh`.
- The judge copy `board-loop` takes of the pinned `bun/` copies the whole
  directory, so the new module travels with the check. A consumer receives
  the change with its next pin bump.
