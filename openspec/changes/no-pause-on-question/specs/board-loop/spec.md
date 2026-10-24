## MODIFIED Requirements

### Requirement: A pass carries one step unattended and records the check's verdict

A pass SHALL launch the step as one fresh `claude -p` session. The session
runs in auto mode with nobody to answer prompts, and in the launch form
`stage-goal` fixes, under a prompt that declares it unattended. The pass
SHALL end the session one hour after launch. It SHALL then run the step's
goal check itself, and SHALL write one ledger record and one printed line per
pass.

#### Scenario: The step met its goal

- **WHEN** the session ends and the check's last line reads `goal met`
- **THEN** the pass records `loop`, `met`, `apply`, prints the change and the
  step, and exits 0

#### Scenario: The session claims success that the check denies

- **WHEN** `claude` exits 0 and the check reads `goal open`
- **THEN** the pass records `open`, prints what the check says is missing,
  and exits 1

#### Scenario: The step waits on the user's answer

- **WHEN** the check reads `goal open`, and the runner posted the
  session's question on the carried card or found a question already waiting
  there
- **THEN** the pass records `waiting`, prints the change, the step and the
  card, and exits 0

#### Scenario: A question the runner could not post

- **WHEN** the check reads `goal open` and the question line reads
  `question: not posted` for any reason but a question already waiting
- **THEN** the pass records `open` and exits 1

#### Scenario: The session runs past the limit

- **WHEN** the session is still running one hour after launch
- **THEN** the pass ends it, records `timeout`, and exits 1

#### Scenario: Every pass leaves a record

- **WHEN** a pass is refused, finds no takeable change, or carries a step
- **THEN** the ledger gains exactly one `loop` record. A ledger that cannot
  be written changes neither the printed line nor the exit status

#### Scenario: Permissions are never bypassed

- **WHEN** the runner launches any session
- **THEN** its command line carries neither `bypassPermissions` nor
  `--dangerously-skip-permissions`


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

- **WHEN** an answer candidate's card in `applied` holds the user's answer and
  another change's card leads `applying`
- **THEN** the pass carries the answer candidate's step, and its card moves to
  `applying`

#### Scenario: A candidate with no answer

- **WHEN** an answer candidate's card has no comment by the user after its last
  question, or its `Assign` is empty
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

