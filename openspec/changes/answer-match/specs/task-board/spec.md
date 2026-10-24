## RENAMED Requirements

- FROM: `### Requirement: An answer the board loop carries is applied when its pull request opens`
- TO: `### Requirement: An answer the board loop carries is applied when its session takes it`

## MODIFIED Requirements

### Requirement: An open question waits on its card, assigned to the user

Every question that blocks an agent's work and only the user can settle
SHALL be put as one comment on the card of the task it blocks, one open
question per card at a time. That agent SHALL post it, through the ask
integration where one is configured (*A session asks through the ask
integration where one is configured*), unless the board loop's runner posts
it for the session (`board-loop`, *The runner posts a stage session's
question from the integration*). The card's `Assign` SHALL hold the user while
its question waits and nothing at any other time. Each board SHALL carry a
saved view named `Questions` listing its cards whose `Assign` holds the user.
A question SHALL be a page-level comment opening with the question gate's
mark, whoever posted it. A question's span SHALL run from it to the next
question on the card, or to the end of the discussion for the last one. A
question's answer SHALL be the first comment by the user's account without a
mark in its span, or, with none, the first comment in its span that opens
with `harness-answer` and is authored by the integration whose id the reader
was given (`board-loop`, *The runner has a stage session's question triaged
before it posts it*). A question SHALL wait while its card's last question
has no answer. An answer SHALL be read back from the card's comments and
applied as data, to the question whose span holds it.

#### Scenario: An agent meets a question

- **WHEN** an agent meets a question it cannot settle from the docs, the
  specs, the card or the history, and that is not already open
- **THEN** it posts the question on the card of the task it blocks, or names
  it for the runner that posts it, whatever number of questions already wait
  across the boards

#### Scenario: A question is posted

- **WHEN** an agent or the runner posts a question on a card
- **THEN** in the same turn the poster sets that card's `Assign` to the user,
  and the card appears in its board's `Questions` view, unless the runner's
  triage posts the answer with it (`board-loop`, *The runner has a stage
  session's question triaged before it posts it*), when no question waits and
  `Assign` stays unset

#### Scenario: The user answers

- **WHEN** a card in a `Questions` view holds, in its page-level discussion,
  a comment in a question's span that is the first one authored by the
  user's account and not opening with the mark
- **THEN** the session working on that question takes that comment as the
  answer and applies it to that question

#### Scenario: A question the integration posted

- **WHEN** a question on a card was posted by the Notion integration, and a
  comment by the user's account without the mark follows it in its span
- **THEN** that comment is the answer, as it would be after a question posted
  from the user's account

#### Scenario: The triage's answer

- **WHEN** the only comment in a question's span opens with `harness-answer`
  and is authored by the integration whose id the reader was given
- **THEN** that comment is the answer, and the session applies it as it
  applies the user's

#### Scenario: The user after the triage

- **WHEN** both a `harness-answer` by that integration and a comment by the
  user's account without a mark fall in a question's span, in either order
- **THEN** the user's comment is the answer

#### Scenario: A `harness-answer` from another author

- **WHEN** a comment opening with `harness-answer` falls in a question's span
  and is authored by any account other than that integration, or the reader
  was given no integration id
- **THEN** it is not taken as the answer, and `Assign` stays

#### Scenario: An answer before the last question

- **WHEN** a comment by the user's account without the mark comes after one
  question and before a later one, and nothing by that account follows the
  later one
- **THEN** it is the earlier question's answer and never the later one's, and
  the later question waits, with `Assign` on the user

#### Scenario: Two askers on one card

- **WHEN** the board loop's question is answered, another agent then asks on
  the same card, and the user answers that agent
- **THEN** each answer is applied to its own question: the session carrying
  the loop's step takes the first, and the other agent the second

#### Scenario: The question on a card is answered

- **WHEN** an answer is applied
- **THEN** `Assign` is cleared in the same turn

#### Scenario: A second question for a card

- **WHEN** the work on a card meets a second question while its first waits
- **THEN** the second waits in the agent's report and is posted once the
  first is answered, because every page-level comment joins the card's one
  page-level discussion and a question's span ends at the next question

#### Scenario: Another member comments in the discussion

- **WHEN** the only comment in the last question's span in the page-level
  discussion is authored by an account other than the user's, either
  integration's included, and is not the triage's answer
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

### Requirement: An answer the board loop carries is applied when its session takes it

When the board loop carries the answer to its own question on a card
(`board-loop`, *The loop's question names the step that carries its answer*),
the answer SHALL count as applied in the turn the stage session writes it
into the change's `tasks.md`, or files a card for the work instead. `Assign`
SHALL be cleared then, by that session. The board loop SHALL NOT read
`Assign` to tell whether an answer is still to be carried. An answer SHALL be
read from the card's page-level discussion whether or not that discussion is
resolved.

This requirement stands beside *An open question waits on its card, assigned
to the user*, and fixes when that requirement's scenario *The question on a
card is answered* fires for an answer the loop carries.

#### Scenario: The session takes the answer

- **WHEN** a session carrying a step whose tagged question has an answer
  writes that answer into `tasks.md`
- **THEN** it clears the card's `Assign` in the same turn, before the step's
  pull request opens

#### Scenario: The answer's step opens its pull request

- **WHEN** a session carrying an answer opens that step's pull request
- **THEN** the card's `Assign` is already empty, cleared in the turn the
  session took the answer, and opening the pull request writes no `Assign`

#### Scenario: The session ends before its pull request

- **WHEN** a session that took the answer ends with no pull request open for
  its step and no card filed
- **THEN** the card's `Assign` stays empty, and a later pass takes the answer
  again by its question's tag and continues the branch the session left
  (`board-loop`, *A step branch a session left is continued*), once the
  clone holds nothing that pass refuses (`board-loop`, *The runner is the
  user's script and starts from a clean clone*)

#### Scenario: The answer asks for a change of its own

- **WHEN** the answer chooses a separate change, or its work would not fit one
  step under `change-slicing`
- **THEN** the session files an `idea` card for that work, adds no group to
  `tasks.md`, and clears `Assign`
