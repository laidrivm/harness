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
followed by each missing condition. It SHALL exit 0 for `met` and 1 for
`open`.

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

- **WHEN** a turn that completed a group ends on the check's `goal met` line
- **THEN** the turn ends when the ledger holds a passing run record of the
  tip — a `pass` for every runner step — whatever its final message, that
  line included, and is refused once per mark when it holds none

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
session ends, since a ledger record names no change or step. The launch form
SHALL name the mark agent-permissions' *A question to the user on a board
card needs no prompt* fixes, character for character, and the form of the
comment that carries a question. A launcher that posts the session's question
itself SHALL name the final-message form `board-loop` fixes for it in place of
the comment's form, the mark still included. Otherwise, a launcher that finds
the ask settings file SHALL name the ask command `task-board` fixes in place
of the comment's form, the mark still included. Explore and conversational
sessions SHALL set no goal.

#### Scenario: An apply step launched headless

- **WHEN** a launcher starts step 2 of a change with nobody present
- **THEN** the session's goal names the check for `apply`, that change and
  step 2, and the session cannot end on prose alone

#### Scenario: A stage that needs the user

- **WHEN** the stage cannot go on without the user's decision
- **THEN** the session ends on a named `BLOCKED`, and the check for that
  stage still reports `goal open`

#### Scenario: A stage asks its question

- **WHEN** a session launched in that form asks the user a question it
  cannot settle from the docs, the specs, the card or the history
- **THEN** its prompt has already named the mark, with its backticks, and
  the comment's form: page-level, on the change's card, after that card and
  its comments were read. Its first question can then pass the question gate
  without the session having read the gate

#### Scenario: A stage whose launcher posts its question

- **WHEN** a session launched by a runner that posts questions from the Notion
  integration asks the user a question
- **THEN** its prompt has already named the mark, with its backticks, and the
  `QUESTION:` line with the question below it, and has said that the session
  posts no comment itself

#### Scenario: A stage launched where the ask integration is configured

- **WHEN** a launcher that does not post questions finds the ask settings
  file and starts a stage session
- **THEN** the session's prompt names the mark, with its backticks, and the
  ask command with the card id and the file that holds the question

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

- **WHEN** the twentieth continued stop also completes a task group, and the
  ledger holds no passing run record of the tip
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

### Requirement: A pull request read that does not answer is a failed try

The goal check SHALL end a read of the pull request's state that has not
answered within a fixed time limit, and SHALL count it as one failed try of
the bounded number that *A stage is done when the check says so* allows. The
check SHALL therefore end within that number of limits and the pauses between
them, whatever `gh` does.

#### Scenario: A read that never answers

- **WHEN** `gh` neither answers nor exits on any try
- **THEN** each try ends at the limit, and after the last one the check
  reports `goal open` and says the pull request's state could not be read

#### Scenario: A read that hangs and then answers

- **WHEN** the first try runs past the limit, a later one within the bound
  reads an open pull request whose head is `HEAD`, and every other condition
  holds
- **THEN** the check reports `goal met`, as if no try had failed

### Requirement: The check before the push leaves out the pull request

The goal check SHALL take `--before-push` as a last argument to any stage. It
SHALL then hold every condition *A stage is done when the check says so*
fixes but the pull request's, and SHALL still require `HEAD` to name a branch.
Its last line SHALL open with `goal met` or `goal open` and name the form, and
it SHALL exit and record as the full check does. A session whose launcher
pushes for it SHALL be held to this form.

#### Scenario: Ready with no pull request

- **WHEN** `apply demo 2 --before-push` runs at a clean `HEAD` on a branch,
  group 2 is complete, the ledger holds a passing `pre-pr` record for `HEAD`
  from every runner step, and the branch has no pull request
- **THEN** the check reports `goal met` before the push, exits 0, and runs no
  pull request query

#### Scenario: Something else missing

- **WHEN** the same call runs with no passing record for `HEAD`, a tracked
  edit, or `HEAD` on no branch
- **THEN** the check reports `goal open` naming each, and exits 1

#### Scenario: The flag out of place

- **WHEN** `--before-push` comes anywhere but last, twice, or misspelt
- **THEN** the check prints its usage, exits 2, and records nothing

#### Scenario: The full check is unchanged

- **WHEN** the check runs without `--before-push`
- **THEN** it decides and records exactly as *A stage is done when the check
  says so* and *Each verdict is recorded* fix

### Requirement: A branch's pull requests are read through GitHub's REST API

The goal check and the board loop's runner SHALL read a branch's pull
requests in one read, through GitHub's REST endpoint that lists a
repository's pull requests filtered by head and in every state, and SHALL
make no GraphQL call for it. The repository and the head's owner SHALL be the
owner and name that the URL `origin` resolves to ends in, and a pull request
whose head repository is not its base repository, compared by the API's
repository id and never by name, SHALL be left out of the read. Each pull request
SHALL be read as its number, a state — `OPEN` when the API says `open`,
`MERGED` when it says `closed` and gives a merge time, `CLOSED` otherwise —
and its head commit, so that *A stage is done when the check says so* and
`board-loop`'s *A pass takes only a takeable change* decide on the same
fields as before. A read SHALL fail, as a read `gh` cannot answer fails, when
`origin` is missing, its URL ends in no owner and name, or the answer is not
a list.

#### Scenario: An open pull request

- **WHEN** the API lists one pull request on the branch with state `open`
  and head `HEAD`, and every other condition holds
- **THEN** the check reports `goal met`

#### Scenario: A merged pull request

- **WHEN** the API lists the branch's pull request as `closed` with a merge
  time and head `HEAD`
- **THEN** the check reports `goal met`, as for an open one

#### Scenario: A pull request closed unmerged

- **WHEN** the API lists the branch's only pull request as `closed` with no
  merge time
- **THEN** the check reports `goal open` and says no pull request of the
  branch is open or merged, and the runner passes the change over naming
  that pull request

#### Scenario: Where GraphQL is refused

- **WHEN** `gh` answers every GraphQL call with an error and the REST
  endpoint with the branch's pull requests
- **THEN** both the check and the runner read them, and neither calls
  `gh pr` or `gh api graphql`

#### Scenario: A fork's branch of the same name

- **WHEN** a fork has a pull request from a branch named as the step's
- **THEN** the read asks only for heads in `origin`'s owner, so that pull
  request is not the branch's

#### Scenario: A fork in the same owner

- **WHEN** the API lists, beside the branch's own pull request, one whose
  head repository is another repository of `origin`'s owner, or one whose
  head repository is gone
- **THEN** the read leaves that pull request out, and both callers decide on
  the branch's own alone

#### Scenario: A renamed repository

- **WHEN** the repository was renamed after `origin` was set, so the API names
  the branch's own pull request's head repository by the new name
- **THEN** the read keeps that pull request

#### Scenario: `origin` in each form

- **WHEN** `origin` is `https://github.com/o/r.git`, `git@github.com:o/r`, a
  proxy URL whose path ends in `/o/r`, or a local path ending in `o/r.git`
- **THEN** the read names repository `o/r` and head owner `o`

#### Scenario: No owner and name to read

- **WHEN** the clone has no `origin`, or its URL ends in fewer than two path
  segments or in a segment holding a character GitHub allows in no name
- **THEN** the read fails without calling `gh`, so the check reports the
  state unreadable and the runner says the query failed

#### Scenario: A branch name the query string would split

- **WHEN** the branch's name holds a character with a meaning in a query
  string, such as `&` or `#`
- **THEN** the read passes the name encoded, so the filter names the whole
  branch
