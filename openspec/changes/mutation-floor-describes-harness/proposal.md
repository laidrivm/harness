# mutation-floor-describes-harness

## Why

`mutation-floor`'s first requirement, *The count of surviving mutants may not
rise silently*, and its Purpose were copied from d2ass and still describe
d2ass: a floor constant declared in the check, its reason as a trailing
comment on that line, and scenarios and a Purpose about `src/model.ts`. The
harness has no `src/model.ts`, and `bun/mutation-floor.ts` reads the floor
from `harness.mutationFloor` in `package.json`, as `surviving` and `why`. A
change resting on the spec cites a floor that does not exist — the same drift
`pre-push-commit-gates` fixed for `commit-gates`. `/code-review` found it
while that change was proposed; it was left out because that diff was already
784 lines of the 800 budget (card
`40a39875c31b81eb836bfb46d8f41e9c`, explored 2026-11-01).

`pre-push-commit-gates` does not reach this requirement: its
`mutation-floor` delta only adds the three requirements on what the harness
mutates and where the results are stored.

## What Changes

- The requirement says the floor is `harness.mutationFloor.surviving` in the
  `package.json` of the repository the check runs in, and its reason
  `harness.mutationFloor.why`, which must hold at least one non-whitespace
  character — what `bun/mutation-floor.ts` already does.
- It names the report the check reads: `reports/mutation/mutation.json`,
  resolved from the repository root.
- The reason `thresholds.break` stays `null`, and the scenarios, speak of a
  mutated module rather than `src/model.ts`; *A branch added without a test*
  names a `bun/` module and its own tests, as `pre-push-commit-gates` defines
  them.
- The four scenarios keep their names, so the three cases citing them keep
  their slugs.
- At archive, the main spec's Purpose, which no delta reaches, is rewritten
  for the harness.
- The check names an absent `why` and a `surviving` that is not a whole
  number as the field at fault, where it threw a `TypeError` or reported a gap
  no edit closes, under a fifth scenario, *A floor that is not a whole
  number* (design.md, decision 5).
- The uncited-criteria floor had the same `gauge` and faults: both now share
  one module, and `spec-test-traceability`'s floor requirement is rewritten in
  harness terms with the same fifth scenario (design.md, decision 6).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mutation-floor`: *The count of surviving mutants may not rise silently*
  describes the floor as `harness.mutationFloor` declares it, the report path
  the check reads, and the harness's mutated modules.
- `spec-test-traceability`: *The count of uncited criteria may not rise
  silently* describes the floor as `harness.uncitedFloor` declares it and the
  gate that runs it.

## Impact

- `openspec/specs/mutation-floor/spec.md` at archive: the requirement and the
  Purpose.
- `openspec/specs/spec-test-traceability/spec.md` at archive: the floor
  requirement.
- A new `bun/floor.ts` with `bun/floor.test.ts`; `gauge` in
  `bun/mutation-floor.ts` and `bun/spec-coverage.ts` binds it, and their
  cases, which already cite `a-branch-added-without-a-test`,
  `a-survivor-newly-killed` and `the-floor-changed-with-no-reason-given`, gain
  the new ones. No configuration file.
- Ordered after `pre-push-commit-gates`, whose ADDED requirements define the
  harness's modules and stored results this requirement's scenarios name.
