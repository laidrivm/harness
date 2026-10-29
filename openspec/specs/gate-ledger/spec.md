# gate-ledger Specification

## Purpose

Which decisions the harness's gates record, what a record may hold and where
it lives, so that whether a gate earns its place is decided on counts rather
than by feel.

## Requirements

### Requirement: Every gate refusal is recorded

Each refusal a harness gate makes — the command guard, the Notion update
guard, the turn gate, the loop guard, the ready guard, the pre-push hook's
draft check or `work.ts finish` — SHALL append one record to the ledger. Every reason a
guard blocks for counts, including an event it could not read. The turn gate
SHALL also record a turn that completed a task group and was let through
because its final message reported, so that a count of refusals has a
denominator. A call a guard allows SHALL NOT be recorded. The one exception
is the question gate, which refuses only in an unattended session: it SHALL
record each call it sees, as allowed, as passed to the prompt, or as
refused, as agent-permissions' *A question to the user on a board card needs
no prompt* requires. The flake watch refuses nothing: it SHALL record each
flaky run it names, as flaky-tests' *Each flaky finding is recorded in the
gate ledger* requires, so that the wrap-up counts flakes beside refusals.

#### Scenario: A commit on main

- **WHEN** the guard blocks a commit because `HEAD` is on `main`
- **THEN** the ledger gains one record naming the guard, a block, and the
  prohibition's id

#### Scenario: An unreadable event

- **WHEN** the guard blocks because the event carried no readable command
- **THEN** that block is recorded like any other, under its own id

#### Scenario: A turn refused, then let through

- **WHEN** the turn gate refuses a turn that completed a group, and the
  continued turn ends with gate lines
- **THEN** the ledger gains a refusal and then a pass for that group

#### Scenario: An ordinary command

- **WHEN** the guard allows `git status`
- **THEN** the ledger is unchanged

#### Scenario: A question the question gate allows

- **WHEN** the question gate answers `allow` to a question on a card
- **THEN** the ledger gains one record naming the question gate, `allowed`,
  and the rule `question`

#### Scenario: A comment the question gate refuses

- **WHEN** the question gate answers `deny` to an unmarked comment in an
  unattended session
- **THEN** the ledger gains one record naming the question gate, `refused`,
  and the rule `unmarked`, where the same comment with a person at the prompt
  records `passed`

#### Scenario: A flaky run named

- **WHEN** the flake watch names a run that passed after an identical failed
  run on the same tree
- **THEN** the ledger gains one record naming the flake watch and `flaky`

#### Scenario: A turn that completed nothing

- **WHEN** the turn gate lets a turn end that completed no task group
- **THEN** the ledger is unchanged

#### Scenario: A gate line without a completed group

- **WHEN** a turn commits, completes no task group, and ends with a gate line
- **THEN** the ledger is unchanged — it is no pass, because nothing was owed

#### Scenario: A push into a ready pull request

- **WHEN** the pre-push hook's draft check refuses a push into a pull request
  that is not a draft
- **THEN** the ledger gains one record naming that check, a block, its
  prohibition's id and the commit pushed

#### Scenario: A finish refused

- **WHEN** `work.ts finish` refuses for a missing run record
- **THEN** the ledger gains one record naming `finish`, a block, its
  prohibition's id and `HEAD`

### Requirement: A refusal walked past is recorded

When the turn gate lets a turn end only because it has already refused once
for that mark, and the turn still carries no gate line, it SHALL record that
release. That record is the one case where an agent ended a turn the gate had
refused, without doing what the refusal asked.

#### Scenario: Refused, then ended without gates

- **WHEN** the turn gate refuses a turn, and the continued turn ends again
  without a gate line or a named `BLOCKED`
- **THEN** the ledger gains a refusal and then a release, and no pass

### Requirement: Each prohibition has a stable id

Each prohibition a guard enforces SHALL have an id of its own, and a
record SHALL carry that id rather than the reason's prose. Two prohibitions
SHALL NOT share an id, and rewording a reason SHALL NOT change its id, so that
counts taken a month apart remain comparable.

#### Scenario: Two refusals of one push

- **WHEN** the guard blocks one push for naming `main` and another for naming
  no bounded destination
- **THEN** the two records carry different ids

#### Scenario: A reason reworded

- **WHEN** a block's message is reworded and nothing else about it changes
- **THEN** records written after the edit carry the same id as before it

### Requirement: A record holds no command text

A record SHALL hold the time, the gate, the decision, the rule it applied — a
guard's prohibition id, the turn gate's `pre-pr-sequence`, the pre-PR
runner's step id, or the name of the skill a call was recorded for — the
project and the session, and nothing else, save the
commit the decision read, which a gate that reads one SHALL add and every other
gate SHALL omit. Its counts are copied into a
tracked file of a public repository, and a command line can carry a token or a
machine-local path; a commit id carries neither.

#### Scenario: A blocked push naming a token

- **WHEN** the guard blocks a push whose command line carries a credential
  in a URL
- **THEN** no part of the command line appears in the ledger

#### Scenario: A gate that reads a commit

- **WHEN** the pre-PR runner records a run at commit `C`
- **THEN** the record holds the six fields and the commit `C`, and nothing else

#### Scenario: A gate that reads none

- **WHEN** the command guard records a block
- **THEN** the record holds the six fields and no commit

### Requirement: The ledger lives outside every working tree

The ledger SHALL be one file in the user's state directory — under
`$XDG_STATE_HOME` when it is an absolute path, and under `~/.local/state`
otherwise — shared by every project, with each record naming its project.
Nothing SHALL be written inside a repository, so no consumer has an ignore
entry to add.

#### Scenario: A consumer's first refusal

- **WHEN** a consumer that has never recorded anything has a command blocked
- **THEN** the ledger file is created in the state directory and
  `git status` in the consumer shows nothing new

#### Scenario: Two projects

- **WHEN** the guard blocks a command in dota2 and another in mellon
- **THEN** one file holds both records, each naming its own project

#### Scenario: Two checkouts sharing a name

- **WHEN** the guard blocks a command in a clone of a project and another in
  a fork of it whose directory has the same name
- **THEN** the two records name different projects

### Requirement: Recording never changes a decision

A failure to write a record SHALL leave the gate's decision as it would have
been: the same exit code, and the same reason on stderr. The ledger observes
decisions, and a gate that refused less because its log was unwritable would
let through what it exists to stop.

#### Scenario: An unwritable state directory

- **WHEN** the state directory cannot be written and the guard blocks a
  force-push
- **THEN** the guard still exits 2 with its force-push reason

#### Scenario: An unwritable ledger at the turn's end

- **WHEN** the ledger cannot be written and the turn gate refuses a turn
- **THEN** the turn is still refused with its reason

### Requirement: The wrap-up reports the gate decisions

`session-wrapup` SHALL add one line to the pipeline-yield entry it writes,
counting this project's records since the date of the previous entry that holds a gates line, per gate,
decision and id. A session in which no gate recorded anything SHALL record
that as well.

#### Scenario: Two blocks and a refused turn

- **WHEN** the guard blocked twice for one id and the turn gate refused once
  since the previous entry
- **THEN** the entry's gates line names both gates, with the guard's two
  blocks under that id and the turn gate's one refusal

#### Scenario: A quiet session

- **WHEN** the ledger holds no record for this project since the previous
  entry
- **THEN** the entry carries a gates line saying none fired

### Requirement: An interpreter the guard refuses is recorded once

When the command guard refuses an interpreter given program text it cannot
read, it SHALL append one record whose decision is `block` and whose rule is
the id of the reason it refused, under *Each prohibition has a stable id*. One
command is one record, so a command refused for two interpreters is recorded
under the first reason the guard read. A command that a git or `gh`
prohibition also refuses is recorded only under that prohibition, because the
guard decides the interpreter refusal last.

#### Scenario: Inline code refused

- **WHEN** the guard refuses `python3 -c "print(1)"`
- **THEN** the ledger gains one record naming the guard, `block`, and the
  inline-code id, and no part of the command line

#### Scenario: An interpreter refusal overtaken by a git block

- **WHEN** `HEAD` is on `main` and the guard reads `python3 -c "print(1)"; git
  commit -m fix`
- **THEN** the ledger gains the `main-commit` block and no inline-code record

### Requirement: Each skill call is recorded for the commit its directory holds

In the harness's own sessions, a hook SHALL append one record each time a
skill is called, by Claude through the `Skill` tool or by the user typing its
command. The record SHALL name the gate `skill`, the decision `called`, the
skill's name as its rule, and the commit `HEAD` names in the hook's working
directory, with that checkout's top level as its project. It proves the call,
not that the skill was followed.

#### Scenario: A skill Claude calls in a worktree

- **WHEN** a subagent whose working directory is a worktree at commit `W`
  calls `zombies` through the `Skill` tool, while the session's project
  directory names the main checkout
- **THEN** the ledger gains one record with the gate `skill`, the decision
  `called`, the rule `zombies`, the commit `W`, and the worktree's top level
  as its project

#### Scenario: A skill the user types

- **WHEN** the user types `/triage` in a checkout at commit `C`
- **THEN** the ledger gains one record with the rule `triage` and the commit
  `C`

#### Scenario: An MCP prompt the user types

- **WHEN** the user types an MCP server's prompt whose name is `triage`
- **THEN** the ledger is unchanged

#### Scenario: A skill called with arguments

- **WHEN** Claude calls a skill with arguments that name a file and a token
- **THEN** the record holds the skill's name and no part of its arguments

#### Scenario: A skill called on an uncommitted edit

- **WHEN** a skill is called while a tracked file differs from `HEAD`, in the
  index or in the working tree
- **THEN** the ledger is unchanged, as for the pre-PR runner
  (`pre-pr-runner`, *No record for a tree the commit does not hold*)

#### Scenario: A skill called with only an untracked file

- **WHEN** a skill is called while the only difference from `HEAD` is an
  untracked file
- **THEN** the call is recorded

#### Scenario: A skill called outside a repository

- **WHEN** a skill is called in a directory with no `HEAD`
- **THEN** the ledger is unchanged

#### Scenario: A skill called while the ledger cannot be written

- **WHEN** the ledger cannot be written and a skill is called
- **THEN** the hook exits 0 and prints nothing, so the call and the typed
  command go on as they would have (*Recording never changes a decision*)

### Requirement: A reader counts a record only for its own gate and step

A reader asking whether a step ran at a commit SHALL match a record by the
gate that writes that step's evidence, the commit, and the checkout's top
level as its project, and by the step's rule and the decision when the reader
names them. A skill-call record SHALL NOT count as the pre-PR runner's, a
runner record SHALL NOT count as a skill call, and a record of one skill
SHALL NOT count as another's.

#### Scenario: A skill record at the tip

- **WHEN** the ledger holds a `zombies` skill record for the turn's tip and no
  runner record
- **THEN** the turn gate and the goal check find no run record for the tip

#### Scenario: A diff-budget record among skill records

- **WHEN** the ledger holds `zombies` and `triage` skill records and a passing
  runner record of every runner step, all for commit `C` in this checkout
- **THEN** the goal check finds the passing run record for `C`

#### Scenario: Another skill's record

- **WHEN** the ledger holds a `triage` skill record for commit `C` and no
  `zombies` one
- **THEN** a reader asking for the `zombies` skill call at `C` finds none

#### Scenario: A refusal at the commit

- **WHEN** the ledger holds a refusal that names commit `C` in this checkout,
  and no runner or skill record of `C`
- **THEN** a reader asking for a skill call or a runner record at `C` finds
  none
