## ADDED Requirements

### Requirement: A move clears `Assign` when no question waits

Once every check has passed, `status` SHALL read the card's comments and
decide whether a question waits there as `finish` does, with no integration
id. When none waits, `Assign` holds anyone and `--to` is not `applying`, the
write SHALL set `Assign` to no one in the same PATCH as `Status`, and the
line SHALL add `, Assign cleared` when Notion's answer holds no one there, or
`, Assign not cleared` with exit 1 when it still holds someone. Otherwise the
write SHALL carry `Status` alone. A comments read that fails SHALL refuse
under `unread` and write nothing.

#### Scenario: No question waits

- **WHEN** a move passes every check, the card's `Assign` holds the user, and
  the user's comment follows the card's last question
- **THEN** `status` writes `Status` and an empty `Assign` in one PATCH,
  prints the move and `Assign cleared`, and exits 0

#### Scenario: A card with no question

- **WHEN** the card holds no comment opening with `harness-question` and its
  `Assign` holds someone
- **THEN** `status` clears `Assign` with the move

#### Scenario: A question waits

- **WHEN** the card's last question has no comment by the user after it
- **THEN** `status` writes `Status` alone, `Assign` stays, and the line is
  the move alone

#### Scenario: A triage's answer only

- **WHEN** the only comment after the last question is a `harness-answer`
- **THEN** a question waits for `status`, and `Assign` stays

#### Scenario: Into applying

- **WHEN** no question waits and `--to` is `applying`
- **THEN** `status` writes `Status` alone and `Assign` stays, since the board
  loop's pick makes that move on an answer it has not yet carried

#### Scenario: `Assign` already empty

- **WHEN** no question waits and the card's `Assign` holds no one
- **THEN** `status` writes `Status` alone and the line is the move alone

#### Scenario: The answer still holds someone

- **WHEN** the PATCH carried an empty `Assign` and Notion's answer still
  holds someone there
- **THEN** `status` prints the move and `Assign not cleared`, and exits 1

#### Scenario: The comments read fails

- **WHEN** Notion answers the comments read with an error
- **THEN** `status` refuses under `unread`, writes nothing, and the ledger
  gains one `status` record

#### Scenario: A refusal before the read

- **WHEN** a check refuses the move
- **THEN** `status` reads no comments
