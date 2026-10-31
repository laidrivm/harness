## MODIFIED Requirements

### Requirement: Status fails closed and records each refusal

A Notion read that fails, no ask settings, or a card on no board SHALL
refuse. Each refusal SHALL exit 1, write nothing in Notion, and append one
gate-ledger record under gate `status` with its own id. A write SHALL print
the status the card reads back from Notion's answer, followed by what *A
move clears `Assign` when no question waits* adds, and exit 0 only when that
status is the one asked for and that requirement's read-back held, 1
otherwise.

#### Scenario: Notion does not answer

- **WHEN** the card's page read fails
- **THEN** `status` refuses, exits 1, and the ledger gains one `status`
  record

#### Scenario: A move written

- **WHEN** a move passes every check
- **THEN** `status` writes the card's `Status`, prints the card, the old and
  the new status as Notion answered it, then `, Assign cleared` where it
  cleared `Assign`, and exits 0

## ADDED Requirements

### Requirement: A move clears `Assign` when no question waits

When the card's `Assign` holds the user, the page read lists fewer than 25
people there, and `--to` is neither `applying` nor `applied`, `status` SHALL, once every check has passed, read the card's
comments and decide whether a question waits there as `finish` does, with no
integration id. When none waits, the write SHALL remove the user from
`Assign`, keeping everyone else, in the same PATCH as `Status`, and the line
SHALL add `, Assign cleared` when Notion's answer holds `Assign.people` as a
list without the user, or `, Assign not cleared` with exit 1 otherwise.
Every other move SHALL read no comments and write `Status` alone. A
comments read that fails SHALL refuse under `unread` and write nothing.

#### Scenario: No question waits

- **WHEN** a move passes every check, the card's `Assign` holds the user, and
  the user's comment follows the card's last question
- **THEN** `status` writes `Status` and `Assign` without the user in one
  PATCH, prints the move and `Assign cleared`, and exits 0

#### Scenario: A card with no question

- **WHEN** the card holds no comment opening with `harness-question` and its
  `Assign` holds the user
- **THEN** `status` removes the user from `Assign` with the move

#### Scenario: Someone else on `Assign`

- **WHEN** no question waits and `Assign` holds the user and another person
- **THEN** the write keeps the other person on `Assign`

#### Scenario: A question waits

- **WHEN** the card's last question has no comment by the user after it
- **THEN** `status` writes `Status` alone, `Assign` stays, and the line is
  the move alone

#### Scenario: A triage's answer only

- **WHEN** the only comment after the last question is a `harness-answer`
- **THEN** a question waits for `status`, and `Assign` stays

#### Scenario: Into applying or applied

- **WHEN** `--to` is `applying` or `applied`
- **THEN** `status` reads no comments and writes `Status` alone, since the
  board loop's pick takes an answer it has not yet carried from a card at
  either status only while `Assign` holds the user

#### Scenario: The user not on `Assign`

- **WHEN** the card's `Assign` does not hold the user, or the page read
  lists 25 people there, the most a read returns
- **THEN** `status` reads no comments and the line is the move alone

#### Scenario: The answer still holds the user

- **WHEN** the PATCH removed the user and Notion's answer still holds the
  user on `Assign`, or holds no `Assign` list
- **THEN** `status` prints the move and `Assign not cleared`, and exits 1

#### Scenario: The comments read fails

- **WHEN** Notion answers the comments read with an error
- **THEN** `status` refuses under `unread`, writes nothing, and the ledger
  gains one `status` record

#### Scenario: A refusal before the read

- **WHEN** a check refuses the move
- **THEN** `status` reads no comments
