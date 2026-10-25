## ADDED Requirements

### Requirement: The loop's question names the step that carries its answer

A question the board loop asks for a change SHALL open with the question
gate's mark, a space, and the tag `<slug> step <k>:`, where `<slug>` is the
carried change and `<k>` the step that will carry the answer: the carried
step when the stage session's final message holds no `PR-TITLE:` line, and
the next step when it holds one. The runner SHALL put the tag after the mark
of a question it posts unless the text already opens with it. A stage
session that posts its own question SHALL be given both tags, literally, in
its prompt. The session carrying step `k` SHALL take as its answer the answer
to the latest question tagged `<slug> step <k>:`, as `task-board`'s *An open
question waits on its card, assigned to the user* matches an answer to its
question, and no other question's.

#### Scenario: A session that blocks

- **WHEN** a stage session carrying step 6 of `runner-isolation` ends with a
  question and no `PR-TITLE:` line, and the runner posts it
- **THEN** the posted comment opens with the mark followed by
  `runner-isolation step 6:`

#### Scenario: A session whose pull request is to open

- **WHEN** a stage session carrying the last group, step 3, ends with a
  question and a `PR-TITLE:` line
- **THEN** the posted comment is tagged `step 4:`, the step that carries the
  answer once every group is ticked

#### Scenario: A question already tagged

- **WHEN** the question's text already opens with the mark and the tag
- **THEN** the runner posts it as it is, with one tag

#### Scenario: Another agent's question on the card

- **WHEN** a card holds the loop's question tagged `step 6:` with the user's
  answer in its span, then another agent's untagged question and the user's
  answer to it
- **THEN** the session carrying step 6 takes the first answer, never the
  second

## MODIFIED Requirements

### Requirement: A pass takes the first takeable card in the board's order

A pass SHALL take the takeable change whose card comes first in `Board view`.
A card whose open question the user has answered comes first, then the
`applying` column, then `proposed`. Within each, the user's order applies
(`task-board`, *A column is a queue the user orders*). A short session SHALL
read the board that `harness.board` names, and SHALL return one `PICK:` line.
The runner SHALL accept only a change from its own takeable list or its answer
candidates. It SHALL take no change on the user's word or by its own order.

The runner SHALL name each answer candidate to the pick session with the
step it would carry. The pick session SHALL take an answer candidate for step
`S` only when its card's page-level discussion, resolved or not, holds a
question tagged `<slug> step <S>:` (*The loop's question names the step that
carries its answer*) that has an answer, as `task-board`'s *An open question
waits on its card, assigned to the user* defines a question's answer: the
user's first comment in its span opening with neither `harness-question` nor
`harness-answer`, or, with none, a `harness-answer` by the integration's own
id (*The runner has a stage session's question triaged before it posts it*).
It SHALL NOT read the card's `Assign` to decide. Such a card stands in `applied` or `applying`, so
the pick session SHALL read `applied` too.

The pick session SHALL pass over a takeable change whose card's page-level
discussion holds a question no answer follows, as the same definition reads
it, so a card waiting on the user costs no stage session.

Before it returns, the pick session SHALL move the card it picks to the status
of the stage the pass carries: `applying` for an apply step, from `proposed`
or, for an answer candidate, from `applied`. It SHALL then read the card back,
and SHALL write nothing else. The runner SHALL NOT read or wait on that move.
A card the pick moved SHALL stay where the move left it, whatever the pass
then does, so the next pass takes it first.

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

- **WHEN** an answer candidate's card in `applied` holds the user's answer to
  its question tagged with the candidate's step, and another change's card
  leads `applying`
- **THEN** the pass carries the answer candidate's step, and its card moves to
  `applying`

#### Scenario: A candidate with no answer

- **WHEN** an answer candidate's card holds no question tagged with its step,
  or one whose span holds neither the user's comment opening with neither
  `harness-question` nor `harness-answer` nor a `harness-answer` by the
  integration's own id, whatever its `Assign` holds
- **THEN** the pick session passes over it

#### Scenario: An answered candidate with no `Assign`

- **WHEN** an answer candidate's card holds the user's answer to its tagged
  question and its `Assign` is empty
- **THEN** the pick session takes it

#### Scenario: An answer already carried

- **WHEN** an answer candidate for step 5 holds only a question tagged
  `step 4:`, whose answer step 4 carried and merged
- **THEN** the pick session passes over it

#### Scenario: Another agent's answer is no candidate's

- **WHEN** an answer candidate's card holds, after its tagged question, an
  untagged question by another agent and the user's answer to that one, and
  no answer in its tagged question's span
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
