# pre-pr-runner Specification

## Purpose
What the pre-PR sequence's runner runs itself, what it records and for which
commit, so that a gate decision the agent only reports can be told apart from
one a script made.

## Requirements

### Requirement: The runner runs the deterministic step itself

The runner SHALL run the diff budget against the branch, print that step's gate
line unchanged, and exit with that step's status. It SHALL NOT read, rewrite or
summarise the gate line. The step owns its thresholds and wording, and the
runner owns only the fact that the step ran.

#### Scenario: A branch within budget

- **WHEN** the runner runs on a branch whose diff is within budget
- **THEN** it prints the diff budget's `PASS` gate line and exits 0

#### Scenario: A branch over budget

- **WHEN** the runner runs on a branch over the failing threshold
- **THEN** it prints the diff budget's `FAIL` gate line and exits 1

#### Scenario: A base it cannot resolve

- **WHEN** the diff budget cannot resolve its base
- **THEN** the runner prints that step's `ERROR` line and exits with that
  step's non-zero status

### Requirement: The runner records each run for the commit it read

Each run SHALL append one record to the gate ledger (`gate-ledger`, *The ledger
lives outside every working tree*). The record names the gate `pre-pr`, the step's id, the
outcome, and the commit `HEAD` named when the run began. The outcome SHALL come
from the step's exit status, never from its printed text. The record SHALL be
written whatever the outcome: it proves that the step ran, and the gate line
reports what the step found.

#### Scenario: A passing run

- **WHEN** the runner exits 0 at commit `C`
- **THEN** the ledger gains one `pre-pr` record for the diff budget, with the
  outcome `pass` and the commit `C`

#### Scenario: A failing run

- **WHEN** the runner exits 1 at commit `C`
- **THEN** the ledger gains one record with the outcome `fail` and the commit `C`

#### Scenario: An unmeasured run

- **WHEN** the step exits with any status other than 0 or 1
- **THEN** the record's outcome is `error`

#### Scenario: An unwritable ledger

- **WHEN** the ledger cannot be written
- **THEN** the runner prints the same gate line and exits with the same status
  (`gate-ledger`, *Recording never changes a decision*)

### Requirement: No record for a tree the commit does not hold

When a tracked file differs from `HEAD`, in the index or in the working tree,
the runner SHALL still run the step and print its line. It SHALL write no
record, and SHALL print one line saying no record was written and why. A record
names a commit, and a step that reads the working tree would otherwise vouch
for a commit it never saw. Untracked files SHALL NOT count, because no commit
holds them in any case.

#### Scenario: An uncommitted edit

- **WHEN** the runner runs while a tracked file has an unstaged edit
- **THEN** it prints the step's gate line, writes no record, and says so

#### Scenario: An untracked scratch file

- **WHEN** the only difference from `HEAD` is an untracked file
- **THEN** the runner records the run

### Requirement: Only the runner writes the run record

The pre-push hook and CI SHALL call the diff budget directly, never through the
runner. A push therefore writes no run record, and the record cannot be
produced as a side effect of the event the sequence exists to precede.

#### Scenario: A push

- **WHEN** a branch is pushed and the pre-push hook measures its budget
- **THEN** the ledger gains no `pre-pr` record
