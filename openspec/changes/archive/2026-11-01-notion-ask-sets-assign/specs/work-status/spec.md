## ADDED Requirements

### Requirement: Status releases `Assign` after its write

After a `Status` write, on any move, `status` SHALL run the release that
`task-board`'s *The work commands release `Assign` when nothing waits*
fixes, and print its line after its own. A refusal SHALL release nothing.

#### Scenario: A move releases

- **WHEN** a move is written and nothing waits on the card
- **THEN** `status` prints the move, then `assign: removed the user from
  <card>`, and exits as the move alone decides

#### Scenario: A refused move

- **WHEN** a check refuses the move
- **THEN** `status` makes no release and reads no comments
