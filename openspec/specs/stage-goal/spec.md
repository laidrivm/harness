# stage-goal Specification

## Purpose

What makes an OpenSpec stage done for an unattended run, how a script's
verdict replaces prose as a goal's completion criterion, and the round ceiling
that bounds a goal run, so that a stage neither stops halfway nor runs
forever.

## Requirements

### Requirement: A stage is done when the check says so

The goal check SHALL report a stage `met` only when every condition for it
holds at `HEAD`, and `open` otherwise. Each condition is read from the
repository, the gate ledger or the pull request, and never from the
conversation. Its last line SHALL open with `goal met` or with `goal open`
followed by each missing condition, and SHALL NOT be a gate line that the turn
gate accepts. It SHALL exit 0 for `met` and 1 for `open`.

#### Scenario: A proposal ready for review

- **WHEN** the change's `proposal.md` is in `HEAD`, the ledger holds a
  `pre-pr` record of `pass` for the full `HEAD`, and an open pull request's
  head is `HEAD`
- **THEN** `propose` reports `goal met` and exits 0

#### Scenario: An apply step

- **WHEN** the step's task group, counted in order among the `## ` groups of
  the change's `tasks.md` at `HEAD`, has at least one box and no unticked one,
  and the record and the pull request hold as above
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

#### Scenario: The pull request is behind

- **WHEN** an open pull request exists but its head is an earlier commit
- **THEN** the check reports `goal open` and names the unpushed `HEAD`

#### Scenario: The pull request cannot be read

- **WHEN** the pull request's state cannot be read, because `gh` is missing,
  unauthenticated or offline
- **THEN** the check reports `goal open` and says the state was unreadable,
  because an unknown is never `met`

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

### Requirement: Each verdict is recorded

Each run of the check that reaches a verdict SHALL append one record to the
gate ledger, in the form `gate-ledger`'s *A record holds no command text*
fixes for a gate that reads a commit. The record names the gate `goal`, the
stage as its rule, `met` or `open` as its decision, and the full `HEAD` as its
commit. A failure to write it falls under `gate-ledger`'s *Recording never
changes a decision*.

#### Scenario: A met stage

- **WHEN** `apply` reports `goal met` at commit `C`
- **THEN** the ledger gains one record with gate `goal`, rule `apply`,
  decision `met` and commit `C`

#### Scenario: Two runs

- **WHEN** the check reports `goal open` and then, after a fix, `goal met`
- **THEN** the ledger gains an `open` record and then a `met` one

#### Scenario: An unwritable ledger

- **WHEN** the ledger cannot be written
- **THEN** the check prints the same line and exits with the same status

### Requirement: An unattended stage runs under one goal on the check

A session that carries an OpenSpec stage with nobody present SHALL set one
`/goal` for that stage. Its condition SHALL be met only by the check's
`goal met` for that stage and change, or by a final message that opens with
`BLOCKED` and names what only the user can settle. The launcher SHALL judge
the outcome by running the check for its own stage, change and step after the
session ends, since a ledger record names no change or step. Explore and
conversational sessions SHALL set no goal.

#### Scenario: An apply step launched headless

- **WHEN** a launcher starts step 2 of a change with nobody present
- **THEN** the session's goal names the check for `apply`, that change and
  step 2, and the session cannot end on prose alone

#### Scenario: A stage that needs the user

- **WHEN** the stage cannot go on without the user's decision
- **THEN** the session ends on a named `BLOCKED`, and the check for that
  stage still reports `goal open`

#### Scenario: Two targets at one commit

- **WHEN** the ledger holds an `apply` record of `met` at commit `C` for one
  change, and a launcher's own target is a step of another change that is
  not complete at `C`
- **THEN** the launcher reruns the check for its own target, which reports
  `goal open`, and the other change's record decides nothing

#### Scenario: An exploration

- **WHEN** a session explores an idea with the user, or runs `/opsx:explore`
  on its own as the first part of a proposal
- **THEN** no goal is set for the exploration, and an unattended one runs
  inside the `propose` goal

### Requirement: A goal run ends at a round ceiling

The turn gate's `Stop` half SHALL count, per session, the stops that arrive
with `stop_hook_active` true since that session's last prompt. On the
twentieth it SHALL end the session, which no other `Stop` hook can then
continue, rather than let the run go on. A new prompt, a resume included,
SHALL start the count again. An event it cannot read SHALL count nothing and
end nothing.

#### Scenario: Below the ceiling

- **WHEN** a goal run reaches its nineteenth continued stop since the prompt
- **THEN** the turn gate decides that stop exactly as it would without a
  ceiling

#### Scenario: At the ceiling

- **WHEN** the twentieth stop since the prompt arrives with
  `stop_hook_active` true
- **THEN** the session ends, even though the goal's own hook asks it to go on

#### Scenario: A new prompt

- **WHEN** a prompt arrives after eighteen continued stops
- **THEN** the count starts again from zero

#### Scenario: Two sessions

- **WHEN** two sessions in one repository each run a goal
- **THEN** each is counted against its own prompt, not the other's

#### Scenario: The ceiling and a refusal at the same stop

- **WHEN** the twentieth continued stop also completes a task group and its
  message reports no gates
- **THEN** the session ends at the ceiling, and the turn gate does not refuse

#### Scenario: An unreadable event

- **WHEN** the stop event is not JSON or carries no session id
- **THEN** no count is kept and the session is not ended by the ceiling

### Requirement: The ceiling's end is told apart from any other

An end at the ceiling SHALL give a reason that opens with `goal-ceiling:` and
names the count and how to go on. It SHALL leave the goal set, so that a
resume carries it on. It SHALL append a record to the gate ledger with gate
`goal`, rule `rounds` and decision `ceiling`, under the same two `gate-ledger`
requirements as the check's.

#### Scenario: A headless run at the ceiling

- **WHEN** a `claude -p` goal run reaches the ceiling
- **THEN** the ledger holds a `ceiling` record for the session, and the
  transcript names the `goal-ceiling:` reason

#### Scenario: Resuming after the ceiling

- **WHEN** the session is resumed after it ended at the ceiling
- **THEN** the goal is still set and the count starts again

#### Scenario: An unwritable ledger at the ceiling

- **WHEN** the ledger cannot be written as the ceiling is reached
- **THEN** the session still ends with the `goal-ceiling:` reason
