## MODIFIED Requirements

### Requirement: A stage is done when the check says so

The goal check SHALL report a stage `met` only when every condition for it
holds at `HEAD`, and `open` otherwise. Each condition is read from the
repository, the gate ledger or the pull request, and never from the
conversation. Its last line SHALL open with `goal met` or with `goal open`
followed by each missing condition, and SHALL NOT be a gate line that the turn
gate accepts. It SHALL exit 0 for `met` and 1 for `open`.

#### Scenario: A proposal ready for review

- **WHEN** the change's `proposal.md` is in `HEAD`, the ledger holds a
  `pre-pr` record of `pass` for the full `HEAD` from every runner step
  (`pre-pr-runner`, *The runner records each run for the commit it read*), and
  a pull request whose head is `HEAD` is open or merged
- **THEN** `propose` reports `goal met` and exits 0

#### Scenario: An apply step

- **WHEN** the step's task group, counted in order among the `## ` groups of
  the change's `tasks.md` at `HEAD`, has at least one box and no unticked one,
  and the record and the pull request hold as above, open or merged
- **THEN** `apply` reports `goal met`

#### Scenario: An archive

- **WHEN** the change's directory is gone from `openspec/changes/` at `HEAD`
  and a dated one for it is under `openspec/changes/archive/`, and the record
  and the pull request hold
- **THEN** `archive` reports `goal met`

#### Scenario: The run record is for an earlier commit

- **WHEN** the only `pre-pr` record names a commit other than `HEAD`
- **THEN** the check reports `goal open` and names the missing record for
  `HEAD`

#### Scenario: The diff budget failed

- **WHEN** the record for `HEAD` has the outcome `fail` or `error`
- **THEN** the check reports `goal open`, because a run that failed is no
  pass

#### Scenario: The project checks failed

- **WHEN** the diff budget's record for `HEAD` is `pass` and the project
  checks' record for `HEAD` is `fail` or `error`, or there is none
- **THEN** the check reports `goal open` and names the missing passing record
  for `HEAD`

#### Scenario: The pull request has merged

- **WHEN** the branch's pull request was merged with `HEAD` as its head, and
  every other condition holds
- **THEN** the check reports `goal met`, the same verdict it gave while the
  pull request was open

#### Scenario: The pull request was closed unmerged

- **WHEN** the branch's only pull request has `HEAD` as its head and was
  closed without a merge
- **THEN** the check reports `goal open` and says no pull request of the
  branch is open or merged

#### Scenario: The pull request is behind

- **WHEN** an open pull request exists but its head is an earlier commit
- **THEN** the check reports `goal open` and names the unpushed `HEAD`

#### Scenario: The pull request cannot be read

- **WHEN** the pull request's state cannot be read, because `gh` is missing,
  unauthenticated or offline, on every one of a bounded number of tries
  made with a pause between them
- **THEN** the check reports `goal open` and says the state was unreadable,
  because an unknown is never `met`

#### Scenario: A read that fails and then succeeds

- **WHEN** a try fails and a later one within the bound reads an open pull
  request whose head is `HEAD`, and every other condition holds
- **THEN** the check reports `goal met`, as if no try had failed

#### Scenario: Uncommitted work

- **WHEN** a tracked file differs from `HEAD`, in the index or in the
  working tree
- **THEN** the check reports `goal open`, because the stage's work is not in
  the commit the verdict names

#### Scenario: A step the task list does not have

- **WHEN** `apply` names a step beyond the number of groups, or the group
  holds no box
- **THEN** the check reports `goal open` and names the group

#### Scenario: The line the turn gate reads

- **WHEN** a final message carries the check's `goal met` line and no gate
  line
- **THEN** the turn gate treats the message as not reporting

#### Scenario: A malformed call

- **WHEN** the check is called with an unknown stage, no change, or `apply`
  with no step, or outside a repository
- **THEN** it prints its usage, exits 2, and records nothing
