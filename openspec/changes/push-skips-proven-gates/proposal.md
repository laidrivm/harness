# push-skips-proven-gates

## Why

Every push an agent makes runs the full project checks twice on one tree:
`bun bun/pre-pr.ts origin/main` records a `pass` of `project-checks` for the
head, then `work.ts finish` pushes and `.githooks/pre-push` runs the same
checks again. On #392 (the archive of finish-writes-card, 01–02.11) that was
610 s and 598 s on each of four pushes — about 80 of the agent's 115
minutes, for a four-minute archive. Once `pre-push-commit-gates` replaces the
hook's `bun test` with `.githooks/gates.sh`, which `harness.bumpTest` names
too, the second run costs more, and more again once that change adds its
Stryker mutation step to the script. The record the hook would repeat is
already the evidence `finish`, the turn gate and the goal check accept.

Two habits around the runner add to the cost. Agents run it at the start of
work only to read its last line, `PRE-PR steps: …`, which it prints after the
full checks. And `core/review-toolkit.md` lets it run in the background: the
agent of `pre-push-commit-gates`' gates-script group did so with `&`, the
process outlived the turn, and the classifier refused the stop.

## What Changes

- The pre-push hook reads its ref-update records once and, when every commit
  the push lands has a passing pre-PR record of `project-checks` made in this
  checkout, prints a line saying so and skips `.githooks/gates.sh`; otherwise
  it prints why and runs the gates as now. The draft check and the soft diff
  budget always run.
- `bun bun/pre-pr.ts --steps [<base>]` prints the `PRE-PR steps: …` line
  alone: no budget, no checks, no record.
- `core/review-toolkit.md`, step 1 of the pre-PR sequence: the runner runs in
  the foreground with a 600000 ms timeout, never in the background, and the
  step list can be read first with `--steps`.

Order: this change is applied after the group of `pre-push-commit-gates`
that adds `.githooks/gates.sh` and points `harness.bumpTest` at it has
merged, and before the group that adds the mutation step to that script (the
user's answer of 02.11 on the card). It declares no `after:`: an `after:`
entry blocks until the named change is archived (`bun/board-state.ts`), which
for `pre-push-commit-gates` is after its mutation group. Its first task
checks the precondition instead.

Not in this change: a ledger record of the skip; consumers' hooks, which
each consumer owns; why the laptop's suite takes 10 minutes where CI's takes 6.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: the hook skips its gates for commits a passing run record
  proved (added), and the draft check is no longer the one reader of the
  ref-update records (modified).
- `pre-pr-runner`: the runner names the steps without running them when
  asked (added).
- `gate-ledger`: the pre-push hook is a reader of the runner's
  `project-checks` record, held to the same match as every other reader.

## Impact

- New: `bun/push-proven.ts` and `bun/push-proven.test.ts`.
- Changed: `.githooks/pre-push`; `bun/pre-pr.ts` (`--steps`);
  `bun/git-env.test.ts` and `bun/pre-pr.test.ts`, which pin the hook;
  `bun/pre-pr-steps-run.test.ts` or a sibling for `--steps`;
  `core/review-toolkit.md` step 1; `README.md`'s map of `bun/`.
- A push of a head the runner passed takes seconds instead of the full gates
  (about 10 minutes on #392). CI and the ruleset's required checks are
  unchanged and still run every check on the pull request.
