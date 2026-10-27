# gate-ledger — delta

Copied from `work-finish`'s delta of the same requirement. Before this
change archives, re-copy it from the live spec and keep only this change's
edits: the status guard, `work.ts status`, and the last scenario.

## MODIFIED Requirements

### Requirement: Every gate refusal is recorded

Each refusal a harness gate makes — the command guard, the Notion update
guard, the turn gate, the loop guard, the ready guard, the status guard, the
pre-push hook's draft check, `work.ts finish` or `work.ts status` — SHALL
append one record to the ledger. Every reason a
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

#### Scenario: A status move refused

- **WHEN** `work.ts status` refuses `--to done` that `origin/main` does not
  prove, or the status guard refuses a connector `Status` write
- **THEN** the ledger gains one record naming `status` or `status-guard`, a
  block, and its prohibition's id, the `status` record with the `origin/main`
  commit it read
