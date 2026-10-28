# gate-ledger — delta for judgement-step-record

## ADDED Requirements

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

- **WHEN** the ledger holds a refusal that names commit `C` in this checkout
- **THEN** a reader asking for a skill call or a runner record at `C` finds
  none

## MODIFIED Requirements

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
