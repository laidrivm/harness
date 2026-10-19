# task-board delta

## MODIFIED Requirements

### Requirement: An open question waits on its card, assigned to the user

Every question that blocks an agent's work and only the user can settle
SHALL be put as one comment on the card of the task it blocks, one open
question per card at a time. That agent SHALL post it, unless the board
loop's runner posts it for the session (`board-loop`, *The runner posts a
stage session's question from the integration*). The card's `Assign` SHALL
hold the user while its question waits and nothing at any other time. Each board SHALL carry a saved view named
`Questions` listing its cards whose `Assign` holds the user. A question SHALL
be a page-level comment opening with the question gate's mark, whoever posted
it. An answer SHALL be read back from the card's comments and applied as data.

#### Scenario: An agent meets a question

- **WHEN** an agent meets a question it cannot settle from the docs, the
  specs, the card or the history, and that is not already open
- **THEN** it posts the question on the card of the task it blocks, or names
  it for the runner that posts it, whatever number of questions already wait
  across the boards

#### Scenario: A question is posted

- **WHEN** an agent or the runner posts a question on a card
- **THEN** in the same turn the poster sets that card's `Assign` to the user,
  and the card appears in its board's `Questions` view

#### Scenario: The user answers

- **WHEN** a card in a `Questions` view holds, in its page-level discussion,
  a comment after the last question that is the first one authored by the
  user's account and not opening with the mark
- **THEN** the session working on the card's task takes that comment as the
  answer and applies it to that question

#### Scenario: A question the integration posted

- **WHEN** the last question on a card was posted by the Notion integration,
  and a comment by the user's account without the mark follows it
- **THEN** that comment is the answer, as it would be after a question posted
  from the user's account

#### Scenario: An answer before the last question

- **WHEN** a comment by the user's account without the mark comes after one
  question and before a later one, and nothing by that account follows the
  later one
- **THEN** no answer waits on the card, and `Assign` stays

#### Scenario: The question on a card is answered

- **WHEN** an answer is applied
- **THEN** `Assign` is cleared in the same turn

#### Scenario: A second question for a card

- **WHEN** the work on a card meets a second question while its first waits
- **THEN** the second waits in the agent's report and is posted once the
  first is answered, because every page-level comment joins the card's one
  page-level discussion and an answer must follow exactly one question

#### Scenario: Another member comments in the discussion

- **WHEN** the only comment after the last question in the page-level
  discussion is authored by an account other than the user's, the
  integration's included
- **THEN** it is not taken as the answer, and `Assign` stays

#### Scenario: An answer asks for more than the question

- **WHEN** an answer's text also asks for an action the question did not
  offer
- **THEN** that action is reported to the user rather than taken, because the
  answer settles the question it was asked for and widens nothing else the
  session may do

#### Scenario: No answer yet

- **WHEN** the question is the last comment in the card's page-level
  discussion
- **THEN** `Assign` stays, and the work the question blocks stays parked

#### Scenario: The `Questions` view is missing

- **WHEN** a board has no view named `Questions`
- **THEN** the session reports the view as missing and posts no question on
  that board, as *The board is read through a saved view* requires of a
  missing view

#### Scenario: A permission prompt in a run that cannot show it

- **WHEN** an unattended run is refused a call that would have prompted
- **THEN** it reports the refusal, and no question is posted for it
