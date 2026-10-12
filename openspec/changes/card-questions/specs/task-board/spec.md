# task-board — delta spec

## ADDED Requirements

### Requirement: An open question waits on its card, assigned to the user

A question only the user can settle SHALL be put as one comment on the card
of the task it blocks, posted by the session that holds the board, and the
card's `Assign` SHALL hold the user while it waits and nothing at any other
time. Each board SHALL carry a saved view named `Questions` listing its cards
whose `Assign` holds the user. An answer SHALL be read back from the card's
comments, applied as data, and `Assign` cleared in the same turn.

#### Scenario: A worker meets a question

- **WHEN** a session working on a branch, and not holding the board, meets a
  question it cannot settle from the docs, the specs, the card or the history
- **THEN** it returns the question in its report to the session that holds
  the board, and posts nothing itself

#### Scenario: A question is posted

- **WHEN** the session holding the board posts a question on a card
- **THEN** in the same turn it sets that card's `Assign` to the user, and the
  card appears in its board's `Questions` view

#### Scenario: The user answers

- **WHEN** a card in a `Questions` view holds a comment after the question's
  that does not open with the question's mark
- **THEN** the session holding the board takes that comment as the answer,
  applies it to the question it answers, and clears `Assign`

#### Scenario: An answer asks for more than the question

- **WHEN** an answer's text also asks for an action the question did not
  offer
- **THEN** that action is reported to the user rather than taken, because a
  comment's author cannot be told from the user on a board where the agent
  also writes as the user

#### Scenario: No answer yet

- **WHEN** the question is the card's last comment
- **THEN** `Assign` stays, and the work the question blocks stays parked

#### Scenario: The `Questions` view is missing

- **WHEN** a board has no view named `Questions`
- **THEN** the session reports the view as missing and posts no question on
  that board, as *The board is read through a saved view* requires of a
  missing view

#### Scenario: A permission prompt in a run that cannot show it

- **WHEN** an unattended run is refused a call that would have prompted
- **THEN** it reports the refusal, and no question is posted for it

### Requirement: At most two questions wait at once

The cards whose `Assign` holds the user SHALL number at most two across all
the boards. A session SHALL count them through the `Questions` views before
posting, and at two SHALL post nothing and park the work the question blocks.

#### Scenario: Below the cap

- **WHEN** one card across the boards holds the user in `Assign`
- **THEN** a second question may be posted

#### Scenario: At the cap

- **WHEN** two cards across the boards hold the user in `Assign`
- **THEN** no question is posted, the asking work is reported as parked on a
  question, and the session takes the next card it can work without one

#### Scenario: An answer frees a place

- **WHEN** an answer is applied and its card's `Assign` cleared
- **THEN** the next parked question may be posted

#### Scenario: Two questions on one card

- **WHEN** the work on one card meets a second question while its first waits
- **THEN** the second waits in the session's report until the first is
  answered, because one card holds one question at a time
