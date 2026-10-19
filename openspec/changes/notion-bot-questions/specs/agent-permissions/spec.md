# agent-permissions delta

## ADDED Requirements

### Requirement: A session whose launcher posts its questions posts no comment

In a session whose environment carries the variable the board loop's runner
sets when it posts that session's questions (`board-loop`, *The runner reads
the Notion integration's settings from its own user's file*), the question
gate SHALL answer `deny` to every `notion-create-comment` call it can read.
The `deny`
SHALL name the `QUESTION:` line, and the gate SHALL record the call as
refused. In such a session this requirement SHALL take precedence over
*A question to the user on a board card needs no prompt*, which holds
unchanged in every other session.

#### Scenario: A question in a session the runner asks for

- **WHEN** a session carrying the variable calls `notion-create-comment` with a
  comment that would meet every condition of *A question on a card*
- **THEN** the gate answers `deny` with a message naming the `QUESTION:` line,
  and the ledger records the call as refused

#### Scenario: The variable with another value

- **WHEN** the variable holds any value other than the one the runner sets
- **THEN** the gate decides as *A question to the user on a board card needs
  no prompt* fixes

#### Scenario: A session the runner does not ask for

- **WHEN** a session without the variable makes any `notion-create-comment`
  call
- **THEN** the gate decides as *A question to the user on a board card needs
  no prompt* fixes

#### Scenario: One name in both places

- **WHEN** the runner sets the variable and the gate reads it
- **THEN** both read its name and its value from the one module that defines
  them
