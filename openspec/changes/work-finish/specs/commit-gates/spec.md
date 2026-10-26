# commit-gates — delta

## MODIFIED Requirements

### Requirement: The pre-push hook runs the gates named here

The pre-push hook SHALL run, in addition to the type check and `bun test`:
`biome ci`, the YAML syntax check, the suppression scan, and the mutation
floor with the Stryker run that produces its report. A non-zero exit from any
of them SHALL block the push. The diff budget SHALL remain the single
exception, absorbed as `change-slicing` requires, because it measures rather
than judges.

Before any of them, the hook SHALL refuse a push that updates a branch on a
GitHub remote while that branch has an open pull request that is not a draft,
naming `gh pr ready <n> --undo`, and SHALL refuse one whose pull requests it
cannot read, since a state it has not read is never a draft. A branch with no
open pull request, or with a draft one, and a remote that is not on GitHub
SHALL pass this check. CodeRabbit reviews a ready pull request's head as it
lands, so a push into one hands a half-done branch to the review (stage 2,
question 26).

No specification under `openspec/specs/` other than this one SHALL enumerate
what the hook runs. The list was previously spread across four of them, two of
which disagreed, and a gate no single file claims is one a change can break
without contradicting anything. A change's own artefacts and `README.md` may
name individual checks and SHALL link here for the list.

A check whose tool may be absent from a developer's machine — `actionlint` over
`.github/workflows/`, `gitleaks` over the commits the push would add — SHALL be
guarded by
`command -v` and SHALL be skipped silently when the binary is not on `PATH`, so
a fresh clone can push. Absence SHALL NOT fail the hook: CI runs both from
pinned versions, and that is where their verdict is binding. Presence SHALL be
treated like any other gate — a non-zero exit blocks the push, because a
finding a developer can see before pushing is one they should not push past.

The hook SHALL NOT run the browser suite or the coverage report — `smoke-suite`
owns why for both — nor `bun audit`, which queries an advisory database over
the network and would make an offline push fail on a gate about published
vulnerabilities rather than about the branch. CI runs it on a pull request that
touches `package.json`, and nightly.

The secret scan SHALL be bounded to the checked-out branch's range —
`--log-opts` from the base branch to `HEAD`, resolved as
`scripts/diff-budget.sh` resolves its own base — and SHALL NOT walk the whole
history the way CI does. Two failure modes decide the bound: an unbounded scan
means one secret ever reaching history blocks every push by everyone until a
baseline is written, and a working-tree scan reads the gitignored files that
exist for one author and in no clone.

`HEAD` is the supported push shape, and the hook SHALL NOT be read as covering
more. Only the draft check consumes the ref-update records git writes to a
pre-push hook's standard input, since the branch a push updates is named
there and nowhere else; the other checks do not, so a push of some ref other
than the checked-out one leaves its commits unscanned here. That is the same
gap as a machine without `gitleaks`, and it closes the same way: CI keeps the
history-wide scan, where a failure stops one pull request rather than
everybody's pushes, and that is where the verdict is binding.

#### Scenario: A gate that CI would fail blocks the push instead

- **WHEN** a branch is pushed whose surviving-mutant count exceeds the floor
- **THEN** the hook reports the count and the floor and exits non-zero, and the
  push does not happen

#### Scenario: A tool the machine does not have

- **WHEN** `actionlint` is not on `PATH` and a branch is pushed
- **THEN** the hook completes without error and without linting the workflows

#### Scenario: A tool the machine has, reporting a finding

- **WHEN** `gitleaks` is on `PATH` and the branch carries a recognisable API
  token
- **THEN** the hook exits non-zero and the push does not happen

#### Scenario: A secret that is already in the base branch

- **WHEN** `gitleaks` is on `PATH` and a recognisable token sits in a commit
  the branch did not add
- **THEN** the hook does not report it, because the scan is bounded to the
  range the push would send; CI's history-wide scan is what owns that case

#### Scenario: The budget is still soft

- **WHEN** a branch at 950 counted lines is pushed and every other gate passes
- **THEN** the hook prints the `FAIL` gate line and the push proceeds

#### Scenario: The list has one home

- **WHEN** a file under `openspec/specs/` other than this one enumerates what
  the pre-push hook runs
- **THEN** the change is rejected at review — the fragment belongs here, and
  the other specification states only the part it owns

#### Scenario: A push into a ready pull request

- **WHEN** a push updates `feat/x` on `github.com` and `feat/x` has open pull
  request #7, not a draft
- **THEN** the hook names `gh pr ready 7 --undo`, exits non-zero before
  `bun test`, and the push does not happen

#### Scenario: A push into a draft

- **WHEN** a push updates `feat/x` and its open pull request is a draft
- **THEN** the draft check passes and the hook goes on to `bun test`

#### Scenario: A pull request state the hook cannot read

- **WHEN** a push updates a branch on `github.com` and its pull requests
  cannot be read
- **THEN** the hook exits non-zero and the push does not happen

#### Scenario: A push with nothing to update

- **WHEN** a push finds `origin` already at `HEAD`, so git hands the hook no
  ref-update record
- **THEN** the draft check reads no pull request and passes

#### Scenario: A remote that is not on GitHub

- **WHEN** a push updates a branch of a remote whose URL is a local path
- **THEN** the draft check reads no pull request and passes
