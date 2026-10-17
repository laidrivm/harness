# gh-timeout — design

## Context

The motivation is in proposal.md, *Why*. The requirements are in
`specs/stage-goal/spec.md` and `specs/board-loop/spec.md`.

The goal check's `pullRequests()` (`bun/goal-check.ts`) spawns
`gh pr list --head <branch> --state all --limit 1000 --json headRefOid,state`
through `Bun.spawnSync`, up to three times with a pause read from
`GOAL_CHECK_RETRY_MS` between tries. A try fails on a non-zero exit, a spawn
that throws, or output that is not a JSON array. `consider()`
(`bun/board-loop.ts`) spawns
`gh pr list --head <branch> --state all --json number,state` once, through
the runner's `sh()`, with the same three ways to fail. Neither passes
`timeout`, and no spawn in `bun/` outside a test does.

The goal check is a script with no exports, spawned by a stage session, by
the runner from a copy of the whole pinned `bun/` directory, and by its tests
through `bun/goal-check.fixture.ts`. The runner's tests spawn it through
`bun/board-loop.fixture.ts`. Both fixtures build a `PATH` holding stubs only.

Probed on bun 1.4.2: `Bun.spawnSync(cmd, { timeout })` returns at the limit
with `exitCode` `null` and `exitedDueToTimeout` `true`, even while a child of
the command still holds its stdout open. With the default `SIGTERM`, a
command that ignores the signal holds the call until it exits on its own (a
stub ignoring it returned after 4.3 s against a 0.5 s limit). With
`killSignal: "SIGKILL"` the same stub returned at 0.5 s.

## Goals / Non-Goals

**Goals:**

- Every read of a branch's pull requests ends within a known time, so the
  goal check and the runner's candidate scan both end whatever `gh` does.
- One copy of that read, so the next fix to it reaches both callers.

**Non-Goals:**

- A limit on any other command either caller spawns (see proposal.md,
  *Non-goals*).
- A different number of tries or a different pause in the goal check.

## Decisions

### D1. One read, in a module of its own, without the retry

`bun/pull-requests.ts` exports one function that takes a branch and the
`--json` fields, spawns
`gh pr list --head <branch> --state all --limit 1000 --json <fields>` with
the time limit of D2, and returns the parsed array, or `undefined` for a
read that failed: a non-zero or missing exit status, a spawn that throws, or
output that is not a JSON array. It keeps both callers' existing comments on
why each failure reads as it does.

The goal check's `pullRequests()` keeps its loop of three tries and its
pause, and calls the read once per try. `consider()` calls it once, as it
calls `sh()` now, and keeps its own reading of the records. The module sits
in `bun/`, so the runner's judge copy, which copies the whole directory,
carries it beside the check.

`consider()` thereby gains `--limit 1000`. Its only effect is that 30 newer
closed pull requests on one branch name can no longer hide an open one, a
case `core/git-and-prs.md` already makes unlikely.

*Alternatives.*

- **The limit added at both call sites.** It is the smallest diff, and it
  keeps two copies of a read that have already drifted apart on
  `--limit 1000`. `core/rules.md`'s Code rule on lifting logic into one module
  asks for the lift.
- **The retry lifted as well.** The runner would gain three tries, and every
  runner case with a failing `gh` would wait out the pause or need the
  goal check's variable set. A failed query costs the runner one pass, and the
  next pass reads again.
- **A limit in `sh()`.** It would bound `git fetch` and `bun install` by a
  figure chosen for `gh`.

### D2. Thirty seconds per read, ended by `SIGKILL`

A read that has not exited 30 seconds after it started is killed with
`SIGKILL` and fails. The goal check's worst case is then three limits and two
pauses, which with the default pause of 2000 ms is 3 × 30 + 2 × 2 = 94
seconds. That is inside the two minutes Claude Code's Bash tool gives a call
by default, so a stage session still gets the check's own line. A
`GOAL_CHECK_RETRY_MS` set above the default lengthens the bound by twice the
difference.

The failure the live run behind #131 met, a TLS handshake timeout, was `gh`
failing on its own, and the retry already handles that. The limit exists for
the call that never fails on its own, so it can sit well above a normal
answer: two reads of this repository's branches took 0.6 and 0.7 seconds
(2026-10-17).

`SIGKILL`, not the default `SIGTERM`, because the probe in *Context* shows a
command ignoring `SIGTERM` keeps `spawnSync` waiting. `gh pr list` only reads,
so nothing it would write is lost to the kill.

*Alternatives.* Ten seconds would cut off a slow answer that `gh` was still
going to give. Sixty seconds puts the check's worst case at 184 seconds, past
the Bash tool's default, and the session again ends the call with no line.
This figure is a judgement, not a measurement, and is listed for the user to
check.

### D3. A variable shortens the limit for the tests

The read takes its limit in milliseconds from `HARNESS_GH_TIMEOUT_MS` when
that is a positive whole number (`/^[1-9]\d*$/`), and 30000 otherwise. Zero
is refused because `spawnSync` reads a `timeout` of 0 as no limit at all (a
probe on bun 1.4.2 let a 1.5 s command run to its end). The
fixtures set it only in the cases that need a limit other than the one that
ships (those that make `gh` hang, and the one that answers inside a limit), so
every other case runs with the limit that ships.

Both callers run as spawned processes in their tests, so a parameter cannot
reach the read from a case. That is the reason D3 of `goal-check-verdict`
gave for `GOAL_CHECK_RETRY_MS`. The prefix is `HARNESS_` rather than
`GOAL_CHECK_`, because the runner reads it too, and not `GH_`, which is `gh`'s
own namespace for environment variables.

### D4. The stub hangs by `exec /bin/sleep`

A hanging stub execs `/bin/sleep` by its absolute path. The fixtures' `PATH`
holds no `sleep`, and `bun/board-loop.fixture.ts` already calls `/bin/sleep`
this way. `exec` puts `sleep` in the stub's place, so the kill reaches the
process that holds the pipe and no child outlives the case.

In `bun/goal-check.fixture.ts` the stub's `Gh` gains `hang?: boolean`. With
it set, the first `fails` calls sleep instead of exiting 1, so the cases that
count tries work unchanged for a hang. In `bun/board-loop.fixture.ts` the
`Stubs` type gains `ghSleep?: number`, the seconds the stub `gh` sleeps
before it answers.

Each case that sets `HARNESS_GH_TIMEOUT_MS` passes `bun test` an explicit
timeout above its worst case, because the spawn blocks the thread that would
fire the default one (`core/rules.md`, Code).

### D5. Two ADDED requirements, no MODIFIED copy

`pick-claim-answer` modifies `board-loop`'s *A pass takes only a takeable
change*, and its archive is open as #138. A second `MODIFIED` copy of that
requirement here would have to be re-copied after that archive and again
before this one. An `ADDED` requirement in each capability states the new
behaviour, and none of the existing scenarios becomes false: `stage-goal`'s
*The pull request cannot be read* names causes of a failed read, and a read
cut off at the limit is one more, which its outcome already covers.

The limit's figure is fixed here and in the code, not in either requirement.
`board-loop`'s requirement cites `stage-goal`'s for the limit, so neither
restates the other.

## Risks / Trade-offs

- [A `gh` that answers after more than 30 seconds is killed] → The try fails
  and the check tries again, as it does for any failure. If every try is that
  slow, the check reads `open` and names an unreadable state, as it does
  today for an offline `gh`.
- [`HARNESS_GH_TIMEOUT_MS` set in a user's shell shortens the limit] → It
  changes how long a read may take, never the number of tries or how an
  answer is read. A value that is not a positive whole number falls back to
  30000.
- [A `gh` that forks a helper which outlives the kill] → `spawnSync` returns
  at the limit whether or not a child still holds the pipe, as the probe in
  *Context* shows. The helper is left to finish on its own.

## Migration Plan

None. A consumer picks the change up with its next harness pin bump. No
ledger record, exit status, printed line or gate line changes shape.
