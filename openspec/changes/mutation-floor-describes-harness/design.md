# mutation-floor-describes-harness — design

## Context

See proposal.md — Why. `bun/mutation-floor.ts` reads
`harness.mutationFloor.{surviving, why}` through `bun/config.ts`, reads the
report at `reports/mutation/mutation.json` from the repository root, and
`gauge` fails on a `why` that is empty after trimming. The harness's
`package.json` carries no `harness.mutationFloor` yet;
`pre-push-commit-gates` task 7.1 sets it, which is why this change comes
after that one.

## Goals / Non-Goals

**Non-Goals:** any change to `bun/mutation-floor.ts` or its tests beyond
decision 5; the requirements `pre-push-commit-gates` adds to
`mutation-floor`.

## Decisions

### 1. One MODIFIED requirement, its scenario names kept

The requirement is rewritten whole under its existing name rather than
removed and re-added, and each scenario keeps its name: three cases in
`bun/mutation-floor.test.ts` cite `a-branch-added-without-a-test`,
`a-survivor-newly-killed` and `the-floor-changed-with-no-reason-given`, so a
rename would leave them citing slugs no spec defines. Only the text that names
d2ass changes — the floor's place, the reason's place, the report's path,
`src/model.ts` — and the rest stays word for word, but for the sentence
decision 5 adds.

### 2. The Purpose at archive

No delta reaches a spec's Purpose. The archive rewrites it by hand, as
`code-review-replaces-cli` did for `local-review-loop`, so the Purpose and
the requirement change on `main` in one commit rather than the Purpose
describing the harness while the requirement still describes d2ass. The
apply writes the text here (task 1.3), and the archive copies it: a task
that archives cannot be ticked, since the archive moves `tasks.md`.

The Purpose the archive copies, in place of the main spec's current one:

> What the floor check counts and forbids, and what the harness mutates. The
> check counts the mutants a Stryker report says survived and fails when that
> count moves from the floor the repository declares, in either direction, or
> when the floor states no reason — in the harness and in every repository
> that installs it and runs the check. The harness mutates each tracked
> `bun/<name>.ts` that is not a test or a fixture, alone, against the tests
> under `bun/<name>`, and stores each module's results in the tree. It exists
> because a test that asserts a value and one that merely executes the line
> cover the same lines, so coverage cannot tell them apart and a surviving
> mutant can.

### 3. The invoker named by its role

The requirement names "the mutation step the pre-push hook and the CI job
run" rather than `bun/mutation-run.ts`: `pre-push-commit-gates` defines that
step, and this requirement is about the check, which consumers run too.

### 4. The invoker writes the report

In the harness the check's input is not one Stryker run's report but the
mutation step's merge of every stored result, and a push that changed no
module runs no Stryker at all (`pre-push-commit-gates`, decision 4 and task
7.2). So the requirement says the invoker produces the report and deletes the
old one before writing it, rather than that it runs Stryker first.

### 5. The check names a floor it cannot read

`gauge` took `harness.mutationFloor.{surviving, why}` as typed, though
`bun/config.ts` checks only that the object is present: an absent `why` threw
a `TypeError` from `why.trim()`, and a `surviving` of `"12"` never equalled a
count, so the check failed with a gap no edit could close. `gauge` now takes
both as `unknown` and returns a problem naming the field — the existing
"states no reason" one for a `why` that is not a non-blank string, and one
naming `harness.mutationFloor.surviving` for a floor that is not a whole
number, in place of the comparison. The requirement gains the one sentence on
the whole number and the scenario *A floor that is not a whole number*, which
the new cases cite; the four scenarios it had keep their text.

`bun/spec-coverage.ts` carries a second `gauge`, for `harness.uncitedFloor`,
with the same two faults. It is left as it is here: lifting both into one
module adds a module the mutation step of `pre-push-commit-gates` must store
results for, while that change's apply is open (the card's question).

## Risks / Trade-offs

- [The requirement names `harness.mutationFloor` before the harness declares
  it] → ordered `after: pre-push-commit-gates`, whose task 7.1 declares it,
  and task 1.1 stops the archive while the key is missing.
- [`openspec validate --strict` warns on `after:`, a key OpenSpec does not
  know] → kept: `bun/board-state.ts` reads it to order the change, as for
  the archived changes that carry it; the plain `validate` passes.
