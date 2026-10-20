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
unchanged in every other session. The runner SHALL also launch such a session
with `notion-create-comment` withheld from its tools, so the call is refused
even where the hook cannot read the variable.

#### Scenario: A hook that cannot read the variable

- **WHEN** a session the runner asks for calls `notion-create-comment` and the
  gate's hook does not see the variable
- **THEN** the call is still refused, because the tool was withheld at launch,
  and no comment is posted from the user's account

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

### Requirement: A question goes to the ask command where one is configured

Where the ask settings file exists under the user's config home, the question
gate SHALL answer `deny` to a `notion-create-comment` call that meets every
condition of *A question on a card*, in any session, attended or not. The
`deny` SHALL name the ask command, and the gate SHALL record the call as
refused. The gate SHALL read whether the file exists and nothing of its
contents. Every other call SHALL be decided as *A question to the user on a
board card needs no prompt* fixes. In a session carrying the runner's
variable, *A session whose launcher posts its questions posts no comment*
SHALL decide first.

#### Scenario: A question on a machine with the ask settings

- **WHEN** an attended session calls `notion-create-comment` with a comment
  that would meet every condition of *A question on a card*, and the ask
  settings file exists
- **THEN** the gate answers `deny` with a message naming the ask command, no
  comment is posted from the user's account, and the ledger records the call
  as refused

#### Scenario: A comment that is not a question

- **WHEN** the ask settings file exists and a session calls
  `notion-create-comment` with a comment that fails a condition of *A
  question on a card*
- **THEN** the gate decides as *A question to the user on a board card needs
  no prompt* fixes, so the prompt stands where it can be shown

#### Scenario: No ask settings

- **WHEN** the ask settings file is missing
- **THEN** the gate decides every call as *A question to the user on a board
  card needs no prompt* fixes
