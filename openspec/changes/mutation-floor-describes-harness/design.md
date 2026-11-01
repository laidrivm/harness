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

**Non-Goals:** any change to the floor checks beyond decisions 5 to 7; the
requirements `pre-push-commit-gates` adds to `mutation-floor`; checking the
shape of every `harness` key in `bun/config.ts`.

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
both as `unknown` and returns a problem naming the field — `harness.<key>.why
gives no reason` for a `why` that is not a non-blank string, and
`harness.<key>.<field> is not a whole number` for a floor that is not a whole
number zero or above, in place of the comparison. The requirement gains the one sentence on
the whole number and the scenario *A floor that is not a whole number*, which
the new cases cite; the four scenarios it had keep their text.

### 6. One `gauge` for both floors

`bun/spec-coverage.ts` carried a second `gauge`, for `harness.uncitedFloor`,
with the same two faults. The user chose, on the card's question 1
(2026-11-01), to lift both into one module in this change: `bun/floor.ts`
holds the arithmetic and the field checks once, and each caller binds it to
its key, field and wording, keeping its own `gauge(count, floor, why)` so
`bun/check.ts` and the callers' cases are unchanged. `bun/config.ts`'s
contract stays as it is: checking each key's shape in `read` would change it
for every gate, a change of its own.

So `spec-test-traceability`'s floor changes behaviour too: an absent
`harness.uncitedFloor.why` is named rather than thrown, and a `count` that is
not a whole number is named rather than compared. Its requirement still
described d2ass — a floor constant with a trailing comment, shipped as
`scripts/spec-coverage.test.ts` — so it gains a MODIFIED delta in harness
terms as `mutation-floor`'s does, its scenario names kept and *A floor that is
not a whole number* added, which a case in `bun/spec-coverage-floor.test.ts`
cites.

### 7. The suppression allowlist read through the same checks

`bun/no-suppressions.ts` read each `harness.suppressions` entry's `count`
unchecked and compared `occurrences > count`: a `count` of `"two"` is `NaN`,
which no length exceeds, so the entry approved every suppression of its marker
in that file, and `why` was never read. The user chose, on the card's
question 2 (2026-11-01), to close it in this change. `bun/floor.ts` exports
`unreadable(path, field, count, why)`, the floors' field checks, and the scan
runs every entry through it: `allowlist` returns the readable approvals and a
problem naming each unreadable entry's key and field, so that entry approves
nothing and its occurrences are reported as unapproved. `report` prints both
from one read of the allowlist, for `bun/check.ts` and the script alike, and
returns rather than throws, so `check.ts` still reports every other gate in
the same run. A negative or fractional `count` is refused as well, and an
allowlist that is some other value than an object is named as such. The one
exception, written into the requirement: `harness.suppressions: null` throws
from `read` before any gate reports, as an absent key does, since JSON spells
an absent value that way and `bun/config.ts`'s contract stays as decision 6
leaves it. `commit-gates` gains an ADDED requirement rather than a MODIFIED
one, since `pre-push-commit-gates` modifies *Linter and type-checker
suppressions fail CI* and two deltas of one requirement would collide at
archive. The test file's repository fixture
moved to `bun/no-suppressions.fixture.ts` to keep it under its 300-line cap.
That fixture's temp-directory bookkeeping — `made`, `cleanup`, `emptyDir` —
is a move, not a new copy; the same bookkeeping sits in 32 files under
`bun/`, and the user chose, on the card's question 4 (2026-11-01), to lift it
into one module under its own card, `40b39875c31b81028677e7918e463db0`, after
the Biome reformat.

### 8. One matcher for a named field, and the rule it settled

The cases expecting "one problem naming `harness.<key>.<field>`" carried the
matcher three times — a helper in `bun/floor.test.ts` and in
`bun/mutation-floor.test.ts`, inline in `bun/spec-coverage-floor.test.ts`.
The apply proposed keeping the copies, since a change of message format would
fail all three loudly. The user chose, on the card's question 3 (2026-11-01),
to lift it into `bun/floor.fixture.ts`, which all three import: the Code rule
*Write logic a second time only by lifting it into one module* admits no
exception for copies that would fail loudly — its dash clause explains the
rule, it does not exempt from it. On the user's approval the rule in
`core/rules.md` now ends "a copy that would fail loudly is no exception", in
this change.

## Risks / Trade-offs

- [The requirement names `harness.mutationFloor` before the harness declares
  it] → ordered `after: pre-push-commit-gates`, whose task 7.1 declares it,
  and task 1.1 stops the archive while the key is missing.
- [`openspec validate --strict` warns on `after:`, a key OpenSpec does not
  know] → kept: `bun/board-state.ts` reads it to order the change, as for
  the archived changes that carry it; the plain `validate` passes.
- [The harness's own `package.json` declares no `harness.uncitedFloor`] →
  none is owed: the uncited floor runs among `bun/check.ts`'s gates, which
  the consumers run over themselves and the harness does not, so task 1.1
  checks only `mutationFloor`, the floor the harness runs over its own tree.
- [A consumer whose allowlist entry has no `why`, which the scan never read,
  now fails] → intended: the refusal names the entry and the field, so the fix
  is one line of its `package.json`.
- [`bun/floor.ts` is a new module, and `pre-push-commit-gates` stores one
  result file per module under `mutation/`] → that step is not on `main` yet,
  so this change adds no `mutation/floor.json`; its apply mutates the module
  with the rest, `bun/floor.test.ts` being the tests whose path begins with it.
