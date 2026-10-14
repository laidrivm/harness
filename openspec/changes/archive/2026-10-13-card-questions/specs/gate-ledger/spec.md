# gate-ledger — delta spec

## MODIFIED Requirements

### Requirement: Every gate refusal is recorded

Each refusal a harness gate makes — the command guard, the Notion update
guard, the turn gate or the loop guard — SHALL append one record to the
ledger. Every reason a
guard blocks for counts, including an event it could not read. The turn gate
SHALL also record a turn that completed a task group and was let through
because its final message reported, so that a count of refusals has a
denominator. A call a guard allows SHALL NOT be recorded. The one exception
is the question gate, which refuses nothing: it SHALL record each call it
sees, as allowed or as passed to the prompt, as agent-permissions' *A question
to the user on a board card needs no prompt* requires.

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

#### Scenario: A turn that completed nothing

- **WHEN** the turn gate lets a turn end that completed no task group
- **THEN** the ledger is unchanged

#### Scenario: A gate line without a completed group

- **WHEN** a turn commits, completes no task group, and ends with a gate line
- **THEN** the ledger is unchanged — it is no pass, because nothing was owed
