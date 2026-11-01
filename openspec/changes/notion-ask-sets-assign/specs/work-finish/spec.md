## ADDED Requirements

### Requirement: Finish releases `Assign` after its comments read

With `--card`, after it has read whether a question waits on the card,
`finish` SHALL run the release that `task-board`'s *The work commands
release `Assign` when nothing waits* fixes, and print its line, whether it
then marks the pull request ready or leaves the draft. With no `--card` it
SHALL release nothing.

#### Scenario: A push after the answer

- **WHEN** `finish --card` pushes and no question or pause notice waits on
  the card
- **THEN** it prints `assign: removed the user from <card>` beside its
  other lines, which are what they would have been without it
