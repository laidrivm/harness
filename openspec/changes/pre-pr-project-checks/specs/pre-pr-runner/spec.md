## MODIFIED Requirements

### Requirement: The runner runs the deterministic step itself

The runner SHALL run two steps, in this order: the diff budget against the
branch, then the project checks, which are the command the project names under
`harness.bumpTest` in its `package.json`, run through `sh -c` from the
checkout's top level. Both SHALL run whatever the first one's outcome. Each
step's output SHALL pass through unchanged. The runner SHALL NOT read, rewrite
or summarise it, and SHALL exit with the worse step's status: 2 for error, then
1, then 0. The steps own their thresholds and wording, and the runner owns only
the fact that they ran.

#### Scenario: A branch within budget

- **WHEN** the runner runs on a branch whose diff is within budget, and the
  project checks exit 0
- **THEN** it prints the diff budget's `PASS` gate line and exits 0

#### Scenario: A branch over budget

- **WHEN** the runner runs on a branch over the failing threshold, and the
  project checks exit 0
- **THEN** it prints the diff budget's `FAIL` gate line, still runs the
  project checks, and exits 1

#### Scenario: A base it cannot resolve

- **WHEN** the diff budget cannot resolve its base
- **THEN** the runner prints that step's `ERROR` line, still runs the project
  checks, and exits 2

#### Scenario: Failing project checks

- **WHEN** the branch is within budget and the project checks exit 1
- **THEN** the checks' own output is printed unchanged, and the runner exits 1

#### Scenario: Project checks that exit otherwise

- **WHEN** the project checks exit with a status other than 0 or 1
- **THEN** the runner exits 2

#### Scenario: No command named

- **WHEN** the project's `package.json` has no `harness.bumpTest`, or one that
  is blank
- **THEN** the runner runs no command for that step, prints a line naming
  the key, and exits 2

### Requirement: The runner records each run for the commit it read

Each run SHALL append one record per step to the gate ledger (`gate-ledger`,
*The ledger lives outside every working tree*), once both steps have ended.
Each record names the gate `pre-pr`, that step's id (`diff-budget` or
`project-checks`), that step's outcome, and the commit `HEAD` named when the
run began. The outcome SHALL come from the step's exit status, never from its
printed text. A passing run record of commit `C` SHALL mean a `pass` record of
`C` for every step. One step's record SHALL NOT stand in for another's.

#### Scenario: A passing run

- **WHEN** the runner runs at commit `C` and both steps exit 0
- **THEN** the ledger gains one `pre-pr` record for the diff budget and one for
  the project checks, each with the outcome `pass` and the commit `C`

#### Scenario: A failing run

- **WHEN** at commit `C` the diff budget exits 0 and the project checks exit 1
- **THEN** the diff budget's record has the outcome `pass`, the project
  checks' record has `fail`, and both name `C`

#### Scenario: An unmeasured run

- **WHEN** a step exits with any status other than 0 or 1, or has no command
  to run
- **THEN** that step's record has the outcome `error`

#### Scenario: A record of one step only

- **WHEN** the ledger holds a passing diff budget record of `C` and no project
  checks record of `C`
- **THEN** it holds no passing run record of `C`

#### Scenario: A run stopped before its records

- **WHEN** the runner is killed while the project checks run
- **THEN** the ledger gains no record of that run, the diff budget's
  included

#### Scenario: An unwritable ledger

- **WHEN** the ledger cannot be written
- **THEN** the runner prints the same lines and exits with the same status
  (`gate-ledger`, *Recording never changes a decision*)

### Requirement: No record for a tree the commit does not hold

When a tracked file differs from `HEAD`, in the index or in the working tree,
or a file is untracked and not ignored, the runner SHALL still run both steps
and print their lines. It SHALL write no record, and SHALL print one line
saying no record was written, naming each such file. A record names a commit,
and the steps read the working tree, so a file the commit does not hold could
make them pass where the commit would not. Ignored files SHALL NOT count.

#### Scenario: An uncommitted edit

- **WHEN** the runner runs while a tracked file has an unstaged edit
- **THEN** it prints the steps' lines, writes no record, and names the file

#### Scenario: An untracked scratch file

- **WHEN** the only difference from `HEAD` is an untracked file that no ignore
  rule covers
- **THEN** the runner prints the steps' lines, writes no record, and names the
  file

#### Scenario: An ignored file

- **WHEN** the only difference from `HEAD` is a file an ignore rule covers
- **THEN** the runner records the run
