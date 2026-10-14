# task-board — delta spec

## ADDED Requirements

### Requirement: An answer the board loop carries is applied when its pull request opens

When the board loop carries the answer on a card as a step of the card's
change (`board-loop`, *A pass takes only a takeable change*), the answer SHALL
count as applied in the turn that step's pull request opens. If the session
files a card for the work instead, it counts as applied in the turn the card
is filed. `Assign` SHALL be cleared then, and never earlier. An answer SHALL
be read from the card's page-level discussion whether or not that discussion
is resolved.

This requirement stands beside *An open question waits on its card, assigned
to the user*, and fixes when that requirement's scenario *The question on a
card is answered* fires for an answer the loop carries.

#### Scenario: The answer's step opens its pull request

- **WHEN** a session carrying an answer as step N+1 of the card's change opens
  that step's pull request
- **THEN** it clears the card's `Assign` in the same turn

#### Scenario: The session ends before its pull request

- **WHEN** a session carrying an answer ends with no pull request open for its
  step and no card filed
- **THEN** the card's `Assign` still holds the user, so the next pass can take
  the answer again

#### Scenario: The answer asks for a change of its own

- **WHEN** the answer chooses a separate change, or its work would not fit one
  step under `change-slicing`
- **THEN** the session files an `idea` card for that work, adds no group to
  `tasks.md`, and clears `Assign`
