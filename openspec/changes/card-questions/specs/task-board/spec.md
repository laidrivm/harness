# task-board — delta spec

## ADDED Requirements

### Requirement: An open question waits on its card, assigned to the user

Every question that blocks an agent's work and only the user can settle
SHALL be put as one comment on the card of the task it blocks, by that agent,
one open question per card at a time, and the card's `Assign` SHALL hold the
user while its question waits and nothing at any other time. Each board SHALL carry a saved view named
`Questions` listing its cards whose `Assign` holds the user. An answer SHALL
be read back from the card's comments and applied as data.

#### Scenario: An agent meets a question

- **WHEN** an agent meets a question it cannot settle from the docs, the
  specs, the card or the history, and that is not already open
- **THEN** it posts the question on the card of the task it blocks, whatever
  number of questions already wait across the boards

#### Scenario: A question is posted

- **WHEN** an agent posts a question on a card
- **THEN** in the same turn it sets that card's `Assign` to the user, and the
  card appears in its board's `Questions` view

#### Scenario: The user answers

- **WHEN** a card in a `Questions` view holds, in its page-level discussion,
  a comment after the question's that is the first one authored by the user's
  account and not opening with the question's mark
- **THEN** the session working on the card's task takes that comment as the
  answer and applies it to the question it answers

#### Scenario: The question on a card is answered

- **WHEN** an answer is applied
- **THEN** `Assign` is cleared in the same turn

#### Scenario: A second question for a card

- **WHEN** the work on a card meets a second question while its first waits
- **THEN** the second waits in the agent's report and is posted once the
  first is answered, because every page-level comment joins the card's one
  page-level discussion and an answer must follow exactly one question

#### Scenario: Another member comments in the discussion

- **WHEN** the only comment after the question's in the page-level discussion
  is authored by an account other than the user's
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

### Requirement: A question already open is not asked again

Before posting a question, an agent SHALL read its board's `Questions` view
and the comments of the card it would post on, and SHALL NOT post a question
that is already open there; it SHALL wait on the open one instead, naming the
card that holds it where it reports the work as parked. The run that resumes
parked work SHALL read that card's comments before anything else.

#### Scenario: The same question is open on the card

- **WHEN** the card already holds an unanswered question that asks what the
  agent would ask
- **THEN** the agent posts nothing and reports its work as parked on that
  question

#### Scenario: The same question is open on another card

- **WHEN** a card in the board's `Questions` view holds an unanswered
  question that asks what the agent would ask
- **THEN** the agent posts nothing on its own card and reports its work as
  parked on that question, naming the card that holds it

#### Scenario: Parked work resumes

- **WHEN** a run resumes work its report parked on a question on another card
- **THEN** it reads that card's comments first, and applies an answer
  found there, even though that card has left the `Questions` view

#### Scenario: The question was asked and answered before

- **WHEN** the card, or the card the work was parked on, holds the same
  question already answered
- **THEN** the agent applies that answer rather than asking again

#### Scenario: Comments not read

- **WHEN** a session posts a question without having read the card's comments
- **THEN** the question gate gives no answer, per agent-permissions' *A
  question to the user on a board card needs no prompt*
