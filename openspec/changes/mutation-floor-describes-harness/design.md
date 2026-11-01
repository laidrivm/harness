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

**Non-Goals:** any change to `bun/mutation-floor.ts` or its tests, which
already behave as the modified requirement says; the requirements
`pre-push-commit-gates` adds to `mutation-floor`.

## Decisions

### 1. One MODIFIED requirement, its scenario names kept

The requirement is rewritten whole under its existing name rather than
removed and re-added, and each scenario keeps its name: three cases in
`bun/mutation-floor.test.ts` cite `a-branch-added-without-a-test`,
`a-survivor-newly-killed` and `the-floor-changed-with-no-reason-given`, so a
rename would leave them citing slugs no spec defines. Only the text that names
d2ass changes — the floor's place, the reason's place, the report's path,
`src/model.ts` — and the rest stays word for word.

### 2. The Purpose at archive

No delta reaches a spec's Purpose. The archive rewrites it by hand, as
`code-review-replaces-cli` did for `local-review-loop`, so the Purpose and
the requirement change on `main` in one commit rather than the Purpose
describing the harness while the requirement still describes d2ass.

### 3. The invoker named by its role

The requirement names "the mutation step the pre-push hook and the CI job
run" rather than `bun/mutation-run.ts`: `pre-push-commit-gates` defines that
step, and this requirement is about the check, which consumers run too.

## Risks / Trade-offs

- [The requirement names `harness.mutationFloor` before the harness declares
  it] → ordered `after: pre-push-commit-gates`, whose task 7.1 declares it.
