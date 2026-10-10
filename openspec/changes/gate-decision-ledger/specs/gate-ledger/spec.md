# gate-ledger — delta spec

## Purpose

Which decisions the harness's gates record, what a record may hold and where
it lives, so that whether a gate earns its place is decided on counts rather
than by feel.

## ADDED Requirements

### Requirement: Every gate refusal is recorded

Each refusal the command guard or the turn gate makes SHALL append one record
to the ledger. Every reason the guard blocks for counts, including an event it
could not read. The turn gate SHALL also record a turn that completed a task
group and was let through because its final message reported, so that a count
of refusals has a denominator. An allowed Bash call SHALL NOT be recorded.

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

#### Scenario: A turn that completed nothing

- **WHEN** the turn gate lets a turn end that completed no task group
- **THEN** the ledger is unchanged

#### Scenario: A gate line without a completed group

- **WHEN** a turn commits, completes no task group, and ends with a gate line
- **THEN** the ledger is unchanged — it is no pass, because nothing was owed

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

Each prohibition the command guard enforces SHALL have an id of its own, and a
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

A record SHALL hold the time, the gate, the decision, the prohibition's id, the
project and the session, and nothing else. Its counts are copied into a
tracked file of a public repository, and a command line can carry a token or a
machine-local path.

#### Scenario: A blocked push naming a token

- **WHEN** the guard blocks a push whose command line carries a credential
  in a URL
- **THEN** no part of the command line appears in the ledger

### Requirement: The ledger lives outside every working tree

The ledger SHALL be one file in the user's state directory — under
`$XDG_STATE_HOME` when it is set, and under `~/.local/state` otherwise — shared
by every project, with each record naming its project. Nothing SHALL be written
inside a repository, so no consumer has an ignore entry to add.

#### Scenario: A consumer's first refusal

- **WHEN** a consumer that has never recorded anything has a command blocked
- **THEN** the ledger file is created in the state directory and
  `git status` in the consumer shows nothing new

#### Scenario: Two projects

- **WHEN** the guard blocks a command in dota2 and another in mellon
- **THEN** one file holds both records, each naming its own project

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
counting this project's records since the date of the previous entry, per gate,
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
