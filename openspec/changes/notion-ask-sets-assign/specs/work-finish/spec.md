## ADDED Requirements

### Requirement: Finish releases `Assign` after its comments read

With `--card`, after a comments read that succeeded and before the ready
switch, `finish` SHALL run the release that `task-board`'s *The work
commands release `Assign` when nothing waits* fixes, and print its line.
When the release put the user back, a question having arrived meanwhile,
`finish` SHALL leave the draft as it does when a question waits. With no
`--card` it SHALL release nothing.

#### Scenario: A push after the answer

- **WHEN** `finish --card` pushes and no question or pause notice waits on
  the card
- **THEN** it prints `assign: removed the user from <card>` beside its
  other lines, which are what they would have been without it

#### Scenario: A question arrives during the release

- **WHEN** the release's second read finds a question and puts the user back
- **THEN** `finish` leaves the pull request a draft
