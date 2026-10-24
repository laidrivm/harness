## MODIFIED Requirements

### Requirement: An answer the board loop carries is applied when its pull request opens

When the board loop carries the answer on a card as a step of the card's
change (`board-loop`, *A pass takes only a takeable change*), the answer SHALL
count as applied in the turn that step's pull request opens. If the session
files a card for the work instead, it counts as applied in the turn the card
is filed. `Assign` SHALL be cleared then, and never earlier: by the runner
where it holds the integration's settings (`board-loop`, *The runner makes
the pass's card writes from the integration*), and by the session otherwise.
An answer SHALL be read from the card's page-level discussion whether or not
that discussion is resolved.

This requirement stands beside *An open question waits on its card, assigned
to the user*, and fixes when that requirement's scenario *The question on a
card is answered* fires for an answer the loop carries.

#### Scenario: The answer's step opens its pull request

- **WHEN** a pass carrying an answer as step N+1 of the card's change opens
  that step's pull request
- **THEN** the card's `Assign` is cleared in the same turn, by the runner
  where it holds the integration's settings

#### Scenario: The session ends before its pull request

- **WHEN** a session carrying an answer ends with no pull request open for its
  step and no card filed
- **THEN** the card's `Assign` still holds the user. A later pass takes the
  answer again and continues the branch the session left (`board-loop`,
  *A step branch a session left is continued*), once the clone holds nothing
  that pass refuses (`board-loop`, *The runner is the user's script and
  starts from a clean clone*)

#### Scenario: The answer asks for a change of its own

- **WHEN** the answer chooses a separate change, or its work would not fit one
  step under `change-slicing`
- **THEN** an `idea` card is filed for that work and `Assign` is cleared, by
  the runner from the session's `IDEA:` line where it holds the
  integration's settings and by the session otherwise, and no group is added
  to `tasks.md`
