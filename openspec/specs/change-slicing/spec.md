# change-slicing Specification

## Purpose

How work is cut into pull requests, and how a cut that failed is detected. It
exists because seven of this repository's first twenty-six merged pull
requests exceeded 800 changed lines, which is past what any reviewer — or this
project's own review skills — reads whole. The remedy is at propose time, in
the size of a step; the line budget is only the sensor that says a step was cut
too wide.

## Requirements
### Requirement: The reviewable unit is the step, not the proposal

WHEN a change's `tasks.md` holds more than one task group, the project SHALL
ship it as a sequence of pull requests, one per group, on `feat/<slug>-<step>`
branches. A change whose `tasks.md` holds exactly one group SHALL ship as a
single `feat/<slug>` pull request.

#### Scenario: A proposal with four task groups

- **WHEN** a change's `tasks.md` contains four `## <n>. <group>` headings
- **THEN** the agent opens four pull requests, each on its own
  `feat/<slug>-<step>` branch, in the order the groups appear
- **AND** it does not open one pull request carrying all four

#### Scenario: A single-group change

- **WHEN** a change's `tasks.md` contains one task group
- **THEN** the whole change ships on one `feat/<slug>` branch

### Requirement: The propose stage's reviewable unit is the artefact pair

A propose-stage branch carries no step, so the remedy that *The reviewable unit
is the step, not the proposal* names has nothing to act on. Its reviewable unit is
one of the two questions a proposal answers: what the change must do, which
`proposal.md` and the delta specs answer, and how it will be built and in what
order, which `design.md` and `tasks.md` answer.

WHEN a propose-stage branch's counted lines reach the failing threshold that
*The budget warns at 500 lines and fails at 800* fixes, the stage SHALL ship as two
pull requests in that order, on `spec/<slug>` and `spec/<slug>-plan`. The
second SHALL open from the updated base after the first merges, so that the
design is read against requirements already on `main` rather than against a
branch. WHERE the four artefacts stay under that threshold, one pull request
SHALL carry all four.

The order is not arbitrary and is not this requirement's to justify: the
feature workflow already reviews the system before the code, and requirements
before a design that argues for them is the same order one stage earlier.

#### Scenario: A proposal that fits

- **WHEN** a change's four artefacts count below the failing threshold
- **THEN** one pull request on `spec/<slug>` SHALL carry all four

#### Scenario: A proposal that does not fit

- **WHEN** a change's four artefacts count at or above the failing threshold
- **THEN** `proposal.md` and the delta specs SHALL ship on `spec/<slug>`, and
  `design.md` and `tasks.md` SHALL ship on `spec/<slug>-plan` afterwards
- **AND** neither pull request SHALL carry an artefact belonging to the other

#### Scenario: The second pull request's base

- **WHEN** `spec/<slug>-plan` is opened
- **THEN** its base SHALL be the default branch with `spec/<slug>` already
  merged into it, not `spec/<slug>` itself

### Requirement: A step closes one to three acceptance criteria

A step SHALL close between one and three acceptance criteria and SHALL leave
the application working when merged. A step that carries only infrastructure
MAY close none, and SHALL say so in its body. The pull request body SHALL name
the criteria the step closes, by identifier alone — an identifier is not the
restatement of an acceptance criterion that the PR description rule forbids,
and that rule SHALL be amended to say so rather than left to be read against
this one.

#### Scenario: A step names what it closes

- **WHEN** a step's pull request is opened
- **THEN** its body names the acceptance criteria the step closes, by their
  identifiers in the change's spec
- **AND** it does not reproduce their text, which the review bot generates on
  every run

#### Scenario: A step closing more than three criteria

- **WHEN** a proposed step would close four or more acceptance criteria
- **THEN** it is split further before the branch is opened

#### Scenario: An infrastructure step closing none

- **IF** a step closes no acceptance criterion because it is infrastructure
- **THEN** its body says so explicitly, rather than leaving the criteria line
  absent

### Requirement: A seam between steps carries a working stub

WHEN a step depends on a capability a later step delivers, the earlier step
SHALL ship a working temporary substitute at the seam and the later step SHALL
delete it. Merging code that no step exercises is prohibited.

#### Scenario: A board that needs a picker not yet built

- **WHEN** a step delivers a board whose picking flow arrives in a later step
- **THEN** the earlier step ships a native control that performs the pick
- **AND** the later step deletes that control in the same pull request that
  introduces its replacement

#### Scenario: Unreachable code offered as a seam

- **WHEN** a step adds a module no shipped code path calls
- **THEN** the step is rejected as a horizontal slice, not accepted as a seam

### Requirement: The diff budget is measured over a defined set of lines

The project SHALL provide a script that counts changed lines in
`<base>...HEAD` and excludes only artefacts no reviewer reads: `bun.lock`,
`*.woff2`, `src/fixtures/snapshot.json`, and a removal and addition of one
task-list line **in the same file** whose text is identical once the checkbox
is normalised and whose checkboxes are opposite. A pair drawn from two
different files, or carrying the same checkbox state, SHALL NOT be excluded.
Newly authored task lines SHALL be counted. Tests SHALL be counted in the
total.

#### Scenario: A lockfile-heavy branch

- **WHEN** a branch changes 40 source lines and 900 lines of `bun.lock`
- **THEN** the script reports 40 changed lines

#### Scenario: A branch that only ticks task boxes

- **WHEN** a branch's only diff is `- [ ]` lines becoming `- [x]`
- **THEN** the script reports 0 changed lines

#### Scenario: An identical task line in two files

- **WHEN** `- [ ] Write the parser` is deleted from one `tasks.md` and
  `- [x] Write the parser` is added to another
- **THEN** the script reports 2 changed lines — the pair spans two files, so
  neither half is excluded

#### Scenario: A task line moved verbatim

- **WHEN** `- [x] Write the parser` moves from one place to another with its
  checkbox unchanged
- **THEN** the script reports 2 changed lines — the two boxes are not
  opposite, so nothing cancels

#### Scenario: A proposal that authors new task lines

- **WHEN** a branch adds 60 `- [ ] <task>` lines to a new `tasks.md` and
  removes nothing
- **THEN** the script reports 60 changed lines — the exclusion covers a
  checkbox changing state, not task text arriving

#### Scenario: A test-heavy branch

- **WHEN** a branch changes 340 source lines and 610 test lines
- **THEN** the script reports 950 changed lines, and the source/test split
  beside the total

### Requirement: The budget warns at 500 lines and fails at 800

The script SHALL exit 0 below 500 counted lines, exit 0 with a warning from
500 to 799, and exit non-zero at 800 or above. It SHALL print one gate line
carrying the verdict, the total, and the source/test split. The split SHALL
NOT affect the verdict.

#### Scenario: A branch under the warning threshold

- **WHEN** the count is 340
- **THEN** the script prints `DIFF gate: PASS — 340 lines (280 source / 60
  test)` and exits 0

#### Scenario: A branch between the thresholds

- **WHEN** the count is 610
- **THEN** the script prints a `WARN` gate line naming both thresholds and
  exits 0

#### Scenario: A branch over the failing threshold

- **WHEN** the count is 950
- **THEN** the script prints a `FAIL` gate line and exits non-zero

### Requirement: An over-budget pull request is admitted only with a named reason

WHEN a pull request reaches 800 counted lines or more, CI SHALL fail unless
the pull request body contains a line beginning `oversize:` followed by a
reason. A body carrying `oversize:` with no text after it SHALL NOT clear the
failure.

#### Scenario: A pull request at exactly the threshold

- **WHEN** the count is exactly 800 and the body carries no `oversize:` line
- **THEN** CI fails
- **AND** the same 800 lines pass once the body names a reason — the override
  covers every count the budget fails, not only those past it

#### Scenario: A mechanical rename

- **WHEN** a 1200-line pull request's body contains
  `oversize: mechanical rename of computeModel across 14 files`
- **THEN** CI reports the override, names the reason in the gate line, and
  passes

#### Scenario: An empty marker

- **WHEN** the body contains `oversize:` and nothing after it
- **THEN** CI fails and states that the marker needs a reason

### Requirement: The override does not admit an unsplit propose-stage branch

WHEN a branch's diff adds both `proposal.md` and `tasks.md` for one change, and
its counted lines reach the failing threshold, the budget SHALL fail it whatever
its pull request body carries. An `oversize:` marker SHALL NOT clear that
failure, because the marker admits a diff the project cannot make smaller and
this one it can, along the seam the requirement above names. The gate line SHALL
say which seam, so the failure is answerable without reading the capability.

A branch adding one of the two and not the other is a split half and SHALL be
measured as any other diff, override included.

#### Scenario: An unsplit proposal reaching for the override

- **IF** a branch adds `proposal.md` and `tasks.md` for one change, counts at
  or above the failing threshold, and its body carries `oversize:` with a
  reason
- **THEN** the gate SHALL report `FAIL` and name the split as the remedy

#### Scenario: An unsplit proposal whose marker names no reason

- **IF** a branch adds `proposal.md` and `tasks.md` for one change, counts at
  or above the failing threshold, and its body carries `oversize:` with no text
  after it
- **THEN** the gate SHALL name the split as the remedy rather than report that
  the marker needs a reason, because the reason it would ask for is one this
  requirement refuses to accept

#### Scenario: A split half over budget

- **WHEN** a branch adds `proposal.md` and the delta specs but no `tasks.md`,
  counts at or above the failing threshold, and its body carries `oversize:`
  with a reason
- **THEN** the gate SHALL report the override, as it does for any other diff

#### Scenario: An implementation branch is untouched

- **WHEN** a `feat/<slug>-<step>` branch counts at or above the failing
  threshold and its body carries `oversize:` with a reason
- **THEN** the gate SHALL report the override — the branch adds neither
  artefact, so the propose-stage refusal SHALL NOT reach it

#### Scenario: An archived change is not a new proposal

- **WHEN** a branch's only `proposal.md` and `tasks.md` changes are the move of
  a change into `openspec/changes/archive/`
- **THEN** the propose-stage refusal SHALL NOT apply, no proposal having been
  authored

### Requirement: The gate is hard in CI and soft before the push

CI SHALL run the budget against the pull request's base branch and fail the
check when the budget is exceeded without an override. The script SHALL exit
non-zero whenever it cannot measure, so a check never passes unmeasured. The
pre-push hook SHALL run the same script and SHALL absorb every non-zero exit,
so it never blocks the push.

#### Scenario: An over-budget push

- **WHEN** the agent pushes a branch at 950 counted lines
- **THEN** the pre-push hook prints the `FAIL` gate line and the push proceeds
- **AND** the CI check on the resulting pull request fails

#### Scenario: A branch with no upstream base

- **IF** the base branch is unavailable locally
- **THEN** the script reports that it could not measure and exits non-zero
- **AND** the pre-push hook absorbs it, so the push still completes

#### Scenario: CI cannot resolve the base

- **IF** the base ref cannot be resolved in CI, because the clone is shallow
  or the ref is missing
- **THEN** the check fails, rather than passing on an unmeasured diff

### Requirement: No source file exceeds its per-file cap

A tracked `.ts` or `.tsx` file SHALL NOT exceed 300 lines, and a tracked `.css`
file SHALL NOT exceed 200. Both bounds are inclusive: 300 passes and 301 fails.
The check SHALL ship as a test, so that CI's existing `bun test` run and the
pre-push hook both carry it without a new workflow.

A line is a physical line, blank ones included. A final line with no
terminating newline counts, and `\r\n` is one ending, not two — `wc -l` counts
newline characters and so reads a 301-line file whose last line is unterminated
as 300, which is the arithmetic that would let a file over the cap through.

Test files SHALL be counted like any other. `docs/testing.md` records that test
code is where agent-written slop hides, and the diff budget in this capability
already refuses to exempt tests for that reason; the cap holds the same line on
the other axis.

The cap SHALL carry no exemption list. It is adopted in the same change that
brings every file under it, so the check is green from its first commit — a cap
that grandfathers the violations standing when it lands enforces nothing until
someone clears a list nobody is scheduled to clear.

This cap and the diff budget measure different things and both SHALL stand: the
budget bounds what one change asks a reviewer to read, the cap bounds what one
file asks them to hold at once. Eleven files reached between 1.1× and 4.7× their
cap without any single change exceeding the budget, which is what makes the
second gate more than a duplicate of the first.

#### Scenario: A file over the cap

- **WHEN** a tracked `.ts` file of 301 lines is committed
- **THEN** the check fails, naming the file, its line count and its cap

#### Scenario: A stylesheet over the cap

- **WHEN** a tracked `.css` file of 201 lines is committed
- **THEN** the check fails, naming the file, its line count and its cap

#### Scenario: A test file is not exempt

- **WHEN** the file over the cap is `*.test.ts`
- **THEN** the check fails exactly as it would for any other file

#### Scenario: The tree as it stands

- **WHEN** the check runs over the tree at the commit that introduces it
- **THEN** it passes, with no file exempted and no allowance recorded

#### Scenario: An untracked file over the cap

- **WHEN** an untracked file of 400 lines sits in the working tree
- **THEN** the check passes — a clone does not carry it, so it is not part of
  what anyone reviews
