## MODIFIED Requirements

### Requirement: A pass takes the first takeable card in the board's order

A pass SHALL take the takeable change whose card comes first in `Board view`.
A card whose open question the user has answered comes first, then the
`applying` column, then `proposed`. Within each, the user's order applies
(`task-board`, *A column is a queue the user orders*). A short session SHALL
read the board that `harness.board` names, and SHALL return one `PICK:` line.
The runner SHALL accept only a change from its own takeable list or its answer
candidates. It SHALL take no change on the user's word or by its own order.

The pick session SHALL take an answer candidate only when its card's
page-level discussion, resolved or not, holds an answer after the last
question there, as `task-board`'s *An open question waits on its card,
assigned to the user* defines the answer: the user's, when the card's `Assign`
holds the user, or a `harness-answer` by the integration's own id, whatever
`Assign` holds (*The runner has a stage session's question triaged before it
posts it*). Such a
card stands in `applied` or `applying`, so the pick session SHALL read
`applied` too.

The pick session SHALL pass over a takeable change whose card's page-level
discussion holds a question no answer follows, as the same definition reads
it, so a card waiting on the user costs no stage session.

The card the pass picks SHALL move to the status of the stage the pass
carries: `applying` for an apply step, from `proposed` or, for an answer
candidate, from `applied`. Without the integration, the pick session SHALL
make that move before it returns, read the card back, and write nothing else,
and the runner SHALL NOT read or wait on it. With the integration, the pick
session SHALL write nothing and SHALL name the picked card's id in one
`CARD:` line, and the runner SHALL make the move (*The runner makes the
pass's card writes from the integration*). A card moved SHALL stay where the
move left it, whatever the pass then does, so the next pass takes it first.

#### Scenario: The user dragged a card up

- **WHEN** two changes are takeable and the user has dragged the second
  one's card above the first in `proposed`
- **THEN** the pass carries the second

#### Scenario: A picked card is claimed

- **WHEN** the pick session picks a card at `proposed`
- **THEN** the card reads `applying` before the stage session starts, and no
  other card or property was written

#### Scenario: A card already applying

- **WHEN** the card the pick session picks is at `applying`
- **THEN** its `Status` is not written

#### Scenario: An answered card goes first

- **WHEN** an answer candidate's card in `applied` holds the user's answer and
  another change's card leads `applying`
- **THEN** the pass carries the answer candidate's step, and its card moves to
  `applying`

#### Scenario: A candidate with no answer

- **WHEN** an answer candidate's card holds, after its last question, neither
  the user's comment while its `Assign` holds the user nor a `harness-answer`
  by the integration's own id
- **THEN** the pick session passes over it

#### Scenario: A takeable card waiting on the user

- **WHEN** a takeable change's card holds a question with no answer after it
- **THEN** the pick session passes over it, and takes it again once the user
  has answered

#### Scenario: A pick outside the list

- **WHEN** the pick session names a change that is neither takeable nor an
  answer candidate, names none, or returns no single `PICK:` line
- **THEN** the pass launches no stage session, and records `idle` for
  `PICK: none` and `refused` otherwise

#### Scenario: No board named

- **WHEN** the project's `package.json` holds no `harness.board`
- **THEN** the pass refuses, naming the key, and launches no session

## ADDED Requirements

### Requirement: The runner makes the pass's card writes from the integration

Where the integration is configured, no session a pass launches SHALL write
to Notion: the runner SHALL launch the pick and the stage sessions with every
write tool of the Notion connector withheld, under any server name, and with
its read tools left. The runner SHALL make each of the pass's card writes
over REST from the integration, and only on a card that sits on the board
`harness.board` names with a `Pointer` that is wholly the carried change's
directory:

- the claim *A pass takes the first takeable card in the board's order*
  names, on the card the pick's `CARD:` line names;
- once `gh pr create` for the step succeeds, the removal of the user from
  that card's `Assign`, where it holds the user;
- for a stage session whose final message holds one `IDEA: <title>` line
  before any `PR-TITLE:` line, a card at `idea` on the same board with that
  title and the text below the line, to a `PR-TITLE:` line or the end, as its
  body, then the removal of the user from the carried card's `Assign`.

The runner SHALL print one line for each write it made or did not make, and
why. No write, made or failed, SHALL change the pass's outcome. Without the
integration, the sessions keep the connector's write tools and make these
writes as before.

#### Scenario: A claim from the runner

- **WHEN** the integration is configured, and the pick session ends with
  `PICK: demo` and a `CARD:` line naming `demo`'s card at `proposed`
- **THEN** the runner sets that card's `Status` to `applying` from the
  integration before the stage session starts, and no session wrote to
  Notion

#### Scenario: A card line that names no card of the pick

- **WHEN** the `CARD:` line is missing, is not one card id, or names a card
  whose `Pointer` is not the picked change's directory
- **THEN** the runner writes no `Status`, prints why, and carries the step

#### Scenario: The pull request opens on an answer

- **WHEN** the runner's `gh pr create` succeeds for a step whose card's
  `Assign` holds the user
- **THEN** the runner removes the user from that `Assign`, leaves anyone
  else on it, and prints that it did

#### Scenario: No pull request opened

- **WHEN** the pass ends `open` or `waiting`, the push is refused, or
  `gh pr create` fails
- **THEN** the runner leaves the card's `Assign` as it is

#### Scenario: An answer that asks for a change of its own

- **WHEN** the stage session's final message opens with `BLOCKED —` and holds
  one `IDEA:` line with a title
- **THEN** the runner creates a card at `idea` on the carried card's board
  with that title and body, removes the user from the carried card's
  `Assign`, and prints the new card's id

#### Scenario: A malformed idea line

- **WHEN** the final message holds two `IDEA:` lines, one after `PR-TITLE:`,
  one with an empty title, or a `QUESTION:` line beside it
- **THEN** the runner files no card, leaves `Assign` as it is, and prints why

#### Scenario: The write tools are withheld

- **WHEN** the integration is configured
- **THEN** both sessions' command lines withhold every Notion write tool the
  runner's list names, the comment tool among them, and withhold no read
  tool

#### Scenario: No integration

- **WHEN** no settings file is configured
- **THEN** no Notion tool is withheld, the pick session makes the claim, the
  stage session files its own `idea` card, and the runner makes no call to
  Notion
