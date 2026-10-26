# pre-pr-project-checks

## Why

The pre-PR runner, `bun/pre-pr.ts`, runs one step, the diff budget, and its
record is what the turn gate and the goal check read as proof that the
sequence ran at a commit. The project's own tests are not part of it, so a
passing record says nothing about whether the commit passes them. Stage 2 of
the roadmap puts the harness's gate on opening a pull request and on marking it
ready, and both are to read the runner's record for `HEAD` (stage 2, questions
24 and 26). That record has to cover the project's checks first. This is item
1 of the stage's minimal slice.

A second defect sits under it. `ran()` in `bun/gate-ledger.ts` matches any
`pre-pr` record of a commit and never reads its `rule`. Once the runner writes
one record per step, a passing budget record would stand in for failed tests.
Item 2 of the slice, which records the judgement skills through a hook, would
have the same problem.

## What Changes

- The runner runs a second step, `project-checks`, after the diff budget. It
  is the project's existing `harness.bumpTest` from `package.json`, run as
  `sh -c "<value>"` from the checkout's top level, the way `bump.ts verify`
  runs it. Both steps always run. Each step's output passes through unchanged,
  and the runner reads none of it. The runner exits with the worse of the two
  outcomes: 2 for error, then 1 for fail, then 0.
- A missing or blank `harness.bumpTest` makes that step `error`. The runner
  prints the key it read and runs no command, so the record never reads as a
  pass.
- **One record per step.** Each step leaves its own `pre-pr` record, with its
  own `rule` (`diff-budget` or `project-checks`) and its own outcome. Both
  name the commit read when the run began, and both are written once both
  steps have ended.
- `ran()` gains an optional `rule`, matched against the record's. The goal
  check, on the laptop and through `ranUnder` on the host, asks for a pass of
  each runner step by its rule. The turn gate asks only whether the runner ran
  and passes no rule. A record for one step never counts as proof of
  another's pass.
- **An untracked, non-ignored file now counts as a dirty tree.** The tests read
  the working tree, and a file no commit holds can make a pass the commit would
  not get. The runner still runs both steps and prints their lines, but it
  writes no record and names the files that stopped it. Ignored files still do
  not count.
- The harness's own `package.json` gains `"bumpTest": "bun test"`.
- `core/review-toolkit.md`: the sequence's first look at the budget becomes
  `bash bun/diff-budget.sh` run directly. The runner, with its tests, runs once,
  after the sequence's last commit. The full `bun test` takes about 7 minutes
  here, so the step says to give the call a 600000 ms timeout or run it in the
  background. On the docs path, "plus `bun test` when it adds or removes a
  directory under `openspec/changes/`" goes, because the runner now always runs
  the tests.
- The pre-push hook and CI are unchanged. Here they already run the same
  `bun test`. Consumers' pre-push and CI lists are out of scope until stage 2
  question 28 extends the gates to them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pre-pr-runner`: *The runner runs the deterministic step itself* now covers
  two steps, the project checks taken from `harness.bumpTest` and an exit by
  the worse outcome. *The runner records each run for the commit it read*
  becomes one record per step, and it defines what "a run record of `C`" means
  to its readers. *No record for a tree the commit does not hold* now counts
  untracked, non-ignored files and names them.
- `stage-goal`: under *A stage is done when the check says so*, a passing
  record is now a passing record of every runner step, and a failed project
  check leaves the goal open.

## Impact

- Code: `bun/pre-pr.ts` (54 lines now), `bun/gate-ledger.ts` (`ran`,
  `ranUnder`, and the list of runner steps), and the callers in
  `bun/turn-gate.ts` and `bun/goal-check.ts`. `bun/ci-run-clone.ts` reaches
  the change through `ranUnder` without an edit.
- Tests: `bun/pre-pr.test.ts`. Fixtures that fabricate a runner record need
  one for each step: `bun/turn-gate-record.test.ts`,
  `bun/gate-ledger-turn.test.ts`, `bun/goal-check.fixture.ts` and the `printf`
  stand-in in `bun/ci-run.test.ts`. The fabricated consumer manifest in
  `bun/diff-budget.fixture.ts` gains `bumpTest: "true"`, so no runner case
  starts a `bun test` inside `bun test`.
- Docs: `core/review-toolkit.md` (step 1 and the docs path), the `README.md`
  line on the runner, and the header comment of `bun/pre-pr.ts`.
- Consumers: d2ass (`bun test`) and mellon (`bun run test`) already set
  `harness.bumpTest`. On their next pin bump the runner also runs it, and the
  goal check asks for its pass. A consumer without the key gets `error` from
  that step until it adds one.
- Order with the slice's siblings, each its own change: this change and item 2
  (judgement steps recorded by a hook on `Skill`) both need `ran()` to filter
  by `rule`. Whichever merges first ships that fix, and the other reuses it
  (user decision 2026-10-26). Item 3 (`work.ts finish`, with its required steps
  read from the diff) reads this change's record when it opens a pull request
  and marks it ready. It applies after this change merges, and its item "`bun
  test` when `openspec/changes/` changes" falls away, because the tests now
  always run.
