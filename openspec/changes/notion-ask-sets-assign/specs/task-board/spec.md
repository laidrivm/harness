## MODIFIED Requirements

### Requirement: An open question waits on its card, assigned to the user

Every question that blocks an agent's work and only the user can settle
SHALL be put in a comment on the card of the task it blocks. Questions an
agent knows at the same time SHALL go in one comment, split into
consecutive comments only where one would pass the question gate's length
cap; any other later comment SHALL carry only a question that arose after
the last one was posted. Each comment's items SHALL be numbered on from the
highest number the card's questions already use, never restarting at 1. The
card's questions SHALL wait while no answer follows the last of them. That agent SHALL post it, through the ask
integration where one is configured (*A session asks through the ask
integration where one is configured*), unless the board loop's runner posts
it for the session (`board-loop`, *The runner posts a stage session's
question from the integration*). The card's `Assign` SHALL hold the user while
its questions wait and nothing at any other time. Each board SHALL carry a
saved view named `Questions` listing its cards whose `Assign` holds the user.
A question SHALL be a page-level comment opening with the question gate's
mark, whoever posted it. The answer SHALL be the first comment by the user's
account without a mark after the last question, or, with none, the first
comment after it that opens with `harness-answer` and is authored by the
integration whose id the reader was given (`board-loop`, *The runner has a
stage session's question triaged before it posts it*). An answer SHALL be read
back from the card's comments and applied as data.

#### Scenario: An agent meets a question

- **WHEN** an agent meets a question it cannot settle from the docs, the
  specs, the card or the history, and that is not already open
- **THEN** it posts the question on the card of the task it blocks, or names
  it for the runner that posts it, whatever number of questions already wait
  across the boards

#### Scenario: A question is posted

- **WHEN** an agent or the runner posts a question on a card
- **THEN** in the same turn that card's `Assign` is set to the user — by the
  ask command where it posted, otherwise by the poster — and the card appears in its board's `Questions` view, unless the runner's
  triage posts the answer with it (`board-loop`, *The runner has a stage
  session's question triaged before it posts it*), when no question waits and
  `Assign` stays unset

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

#### Scenario: The triage's answer

- **WHEN** the only comment after the last question opens with
  `harness-answer` and is authored by the integration whose id the reader was
  given
- **THEN** that comment is the answer, and the session applies it as it
  applies the user's

#### Scenario: The user after the triage

- **WHEN** both a `harness-answer` by that integration and a comment by the
  user's account without a mark follow the last question, in either order
- **THEN** the user's comment is the answer

#### Scenario: A `harness-answer` from another author

- **WHEN** a comment opening with `harness-answer` follows the last question
  and is authored by any account other than that integration, or the reader
  was given no integration id
- **THEN** it is not taken as the answer, and `Assign` stays

#### Scenario: An answer before the last question

- **WHEN** a comment by the user's account without the mark comes after one
  question and before a later one, and nothing by that account follows the
  later one
- **THEN** no answer waits on the card, and `Assign` stays

#### Scenario: The question on a card is answered

- **WHEN** an answer is applied
- **THEN** `Assign` is cleared in the same turn

#### Scenario: Questions known together

- **WHEN** an agent has several questions for a card at the same time
- **THEN** it posts them in one comment, numbered in one sequence, or, where
  that comment would pass the gate's length cap, in consecutive comments
  that continue the sequence

#### Scenario: A second question for a card

- **WHEN** the work on a card meets a question after an earlier one was
  posted there and still waits
- **THEN** the agent posts it as a comment of its own, its items numbered on
  from the highest number the card's questions use, and `Assign` holds the
  user

#### Scenario: One answer to several questions

- **WHEN** two questions wait on a card and a comment by the user's account
  without a mark follows the later one
- **THEN** that comment is the answer to both, and no question waits

#### Scenario: Another member comments in the discussion

- **WHEN** the only comment after the last question in the page-level
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

### Requirement: An answer the board loop carries is applied when its pull request opens

When the board loop carries the answer on a card as a step of the card's
change (`board-loop`, *A pass takes only a takeable change*), the answer SHALL
count as applied in the turn that step's pull request opens. If the session
files a card for the work instead, it counts as applied in the turn the card
is filed. `Assign` SHALL be cleared by then at the latest; `work-status`'s
*A move clears `Assign` when no question waits* may clear it earlier, and
nothing that decides whether an answer waits reads `Assign`. An answer SHALL
be read from the card's page-level discussion whether or not that discussion
is resolved.

This requirement stands beside *An open question waits on its card, assigned
to the user*, and fixes when that requirement's scenario *The question on a
card is answered* fires for an answer the loop carries.

#### Scenario: The answer's step opens its pull request

- **WHEN** a session carrying an answer as step N+1 of the card's change opens
  that step's pull request
- **THEN** it clears the card's `Assign` in the same turn, where it still
  holds the user

#### Scenario: The session ends before its pull request

- **WHEN** a session carrying an answer ends with no pull request open for its
  step and no card filed
- **THEN** a later pass takes the answer again, whatever the card's `Assign`
  holds, and continues the branch the session left (`board-loop`, *A step
  branch a session left is continued*), once the clone holds nothing that
  pass refuses (`board-loop`, *The runner is the user's script and starts
  from a clean clone*)

#### Scenario: The answer asks for a change of its own

- **WHEN** the answer chooses a separate change, or its work would not fit one
  step under `change-slicing`
- **THEN** the session files an `idea` card for that work, adds no group to
  `tasks.md`, and clears `Assign`

### Requirement: A session asks through the ask integration where one is configured

Where the ask settings file exists under the user's config home, a session
that hands a question on SHALL post it with the ask command,
`bun/notion-ask.ts <card id> <file>`, which posts the file's text from the ask
integration and then sets the card's `Assign` to the user alone. The command
SHALL post only text the question gate's checks on a comment's text allow,
whatever questions already wait on the card, and only as a page-level
comment. After the post it SHALL write `Assign` and read the user back from
Notion's answer to that write. It SHALL print one line, `question: posted on
<id>, Assign set` when both held, `question: posted on <id>, Assign not set —
<why>` when the post held and the write did not, `question: may be posted on
<id> — <why>; read the card's comments before running it again` when the
post failed in a way that may have reached Notion (no answer, the timeout, a
5xx; a 429 is a refusal Notion never processed), or `question: not posted
— <why>`; it SHALL exit 0 only on the first, and never print the token. It SHALL read neither the page nor its
comments, and write no property but `Assign`. A session whose command
printed a line opening `question: posted` and not ending `Assign set` SHALL
set `Assign` to the user through the connector; no session SHALL run the
command again for a question it printed as posted, nor after `may be
posted` before reading the card's comments.

#### Scenario: A question posted from the laptop

- **WHEN** a session on a machine with the ask settings writes a question
  that opens with the mark to a file and runs the command with a card id
- **THEN** the comment is posted from the ask integration, the card's
  `Assign` holds the user alone, and the command prints that it posted and
  that `Assign` is set, and exits 0

#### Scenario: A question already waits

- **WHEN** the card's last question has no answer after it
- **THEN** the command posts the new question and sets `Assign` as it would
  on a card with no question

#### Scenario: `Assign` cleared while a question waits

- **WHEN** the card's `Assign` was cleared and the command posts a question
  there
- **THEN** `Assign` holds the user again

#### Scenario: The `Assign` write fails

- **WHEN** the post held and Notion answers the `Assign` write with an error,
  or its answer does not hold the user in `Assign`
- **THEN** the command prints that it posted and that `Assign` is not set,
  naming why, and exits 1, and the session sets `Assign` through the
  connector without posting the question again

#### Scenario: Text the gate would not allow

- **WHEN** the file's text does not open with the mark, mentions a user, or
  is longer than 1500 characters
- **THEN** the command posts nothing and prints the condition in the question
  gate's words

#### Scenario: A page the integration cannot reach

- **WHEN** Notion answers the post with a 4xx, a 429 included, a page outside
  the connected boards included
- **THEN** the command posts nothing, writes no `Assign`, prints the step and
  Notion's status, and exits non-zero

#### Scenario: A post that may have landed

- **WHEN** the post gets no answer, times out, or is answered with a 5xx
  status
- **THEN** the command writes no `Assign`, prints that the question may be
  posted and that the card's comments are to be read before running it
  again, and exits non-zero

#### Scenario: No ask settings

- **WHEN** the ask settings file is missing
- **THEN** the command posts nothing and prints that no ask integration is
  configured
