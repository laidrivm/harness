# stage-goal delta

## MODIFIED Requirements

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
the comment's form, the mark still included. Explore and conversational
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

