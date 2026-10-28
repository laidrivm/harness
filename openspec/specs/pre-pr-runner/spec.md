# pre-pr-runner Specification

## Purpose
What the pre-PR sequence's runner runs itself, what it records and for which
commit, so that a gate decision the agent only reports can be told apart from
one a script made.

## Requirements

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
make them pass where the commit would not. Ignored files SHALL NOT count. The
runner SHALL read `HEAD` and that status again once both steps have ended, and
SHALL write no record when either differs from its reading before the steps,
since a step that wrote into the tree or a commit made meanwhile leaves no
single commit the run vouches for.

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

#### Scenario: A check that writes into the tree

- **WHEN** the tree is clean before the steps, and the project checks leave
  an untracked, non-ignored file or an edit to a tracked file
- **THEN** the runner writes no record and names the file

#### Scenario: A commit made during the run

- **WHEN** `HEAD` moves while the steps run
- **THEN** the runner writes no record

### Requirement: Only the runner writes the run record

The pre-push hook and CI SHALL call the diff budget directly, never through the
runner. A push therefore writes no run record, and the record cannot be
produced as a side effect of the event the sequence exists to precede.

#### Scenario: A push

- **WHEN** a branch is pushed and the pre-push hook measures its budget
- **THEN** the ledger gains no `pre-pr` record

### Requirement: The runner names the steps the branch requires from its diff

The runner SHALL print, as its last line, the ids of the steps the branch
requires. While no pull request of it is open, a branch whose every changed
path is a `*.md` file or lies under `openspec/` is a documentation branch and
requires the project checks, `triage` and `code-review`. Any other branch
is a code branch and requires `zombies` as well, and `warm` where a path named
`package.json` or `bun.lock` changed. A judgement step's id is its skill's name.

#### Scenario: Markdown alone

- **WHEN** every changed path ends in `.md`
- **THEN** the runner names the project checks, `triage` and
  `code-review`, and neither `zombies` nor `warm`

#### Scenario: A proposal with one source file

- **WHEN** the changed paths are files under `openspec/` and one `.ts` file
- **THEN** the runner names `zombies` along with the documentation branch's
  steps

#### Scenario: Config alone

- **WHEN** the only changed path is `.coderabbit.yaml`, a workflow or
  `.claude/settings.json`
- **THEN** the runner names the code branch's steps

#### Scenario: A source file moved to Markdown

- **WHEN** the branch renames a `.ts` file to a `.md` file
- **THEN** the runner names `zombies`, since the removed `.ts` path is a
  changed path too

#### Scenario: A lockfile alone

- **WHEN** `bun.lock` changed and `package.json` did not
- **THEN** the runner names `warm`

#### Scenario: A nested manifest

- **WHEN** a `package.json` below the repository root changed
- **THEN** the runner names `warm`

#### Scenario: Nothing past the base

- **WHEN** the branch changes no path
- **THEN** the runner names the documentation branch's steps

#### Scenario: A diff it cannot read

- **WHEN** the changed paths cannot be read
- **THEN** the runner names every step, `warm` included

### Requirement: An open pull request requires the project checks alone

Once the branch's pull request is open, draft or not, the runner SHALL name
the project checks and no judgement step, since the reviewer on the pull
request reviews its head. A read of the pull request that fails SHALL count as
no pull request open. The list is the least a push into it requires: the steps
before `/code-review` still run ahead of one, as `local-review-loop`
(*The local review runs after triage and before the push*) sets out.

#### Scenario: A code branch with its pull request open

- **WHEN** the branch changes a `.ts` file and its pull request is open
- **THEN** the runner names the project checks alone

#### Scenario: An open pull request over a diff it cannot read

- **WHEN** the branch's pull request is open and its changed paths cannot be
  read
- **THEN** the runner names the project checks alone, since no judgement step
  depends on the diff once the pull request is open

#### Scenario: A merged pull request

- **WHEN** the branch's only pull request is merged or closed
- **THEN** the runner names the steps its diff requires

#### Scenario: The pull request cannot be read

- **WHEN** the read of the branch's pull requests fails
- **THEN** the runner names the steps its diff requires

### Requirement: The runner reads one base for every step

The runner SHALL resolve the base once, when none is passed to it, by the same
rule the diff budget uses when called with none, and SHALL pass that base both
to the diff budget and to the read of the changed paths. A base passed to the
runner SHALL be used for both.

#### Scenario: No base passed

- **WHEN** the runner runs with no argument
- **THEN** the diff budget measures from the base the changed paths are read
  from

#### Scenario: A base passed

- **WHEN** the runner runs with a base `B`
- **THEN** both the diff budget and the changed paths are read against `B`
