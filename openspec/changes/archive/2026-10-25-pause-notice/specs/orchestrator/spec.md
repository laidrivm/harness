## ADDED Requirements

### Requirement: A pause posts one notice to the user

When the wrapper writes a stop file, it SHALL run the notice command the host
names, once, with the stop file and, when the pass started, its log. That
command SHALL post one page-level comment from the runner's Notion integration,
opening with `harness-pause`, mentioning the user, and holding the clone, the
stop file's line, the log's path and the command that removes the stop file.
The comment SHALL go on the card of the step the stop file's line names, found
on the board the runner's settings name by its `Pointer`, and SHALL then set
that card's `Assign` to the user. A pause whose line names no step, or whose
step matches not exactly one card, SHALL instead file a new card on that board,
with no `Pointer`, `Status` `approved`, `Assign` the user and a body saying why
the loop stopped, and post the comment there. A tick refused by an existing
stop file, and a pass stopped by hand, SHALL post nothing. The notice SHALL
change neither the stop file nor the wrapper's exit status, and a notice that
fails SHALL print why.

#### Scenario: A step's pass exits 1

- **WHEN** the pass exits 1 on `apply <slug> step <n>`, the runner's settings
  name a board, and one card there has the `Pointer` of `<slug>`
- **THEN** the stop file is written, one comment naming the clone, the stop
  line and the log's path is posted on that card from the integration, the
  card's `Assign` holds the user, and the wrapper exits 1

#### Scenario: The ticks that follow

- **WHEN** the timer fires again while the stop file exists
- **THEN** the wrapper exits 3 and the notice command does not run

#### Scenario: A host that cannot start the pass

- **WHEN** the wrapper pauses before the pass starts, as for a missing token
- **THEN** a new card at `approved`, assigned to the user, is filed on the
  board with the stop line as its reason, and the notice posted on it names no
  log

#### Scenario: No card names the step

- **WHEN** the stop line names a step whose slug no card's `Pointer`, or more
  than one, names
- **THEN** a new card is filed, saying so, and the notice is posted there

#### Scenario: No board is configured

- **WHEN** the runner's settings are missing or name no board
- **THEN** nothing is posted or filed, the command prints why, and the stop
  file and the exit status are those of a pause with no notice

#### Scenario: Notion refuses a call

- **WHEN** the query, the new card's creation, the comment's post or the
  `Assign` write fails
- **THEN** the command prints which step failed, makes no call after it, the
  stop file stands, and the wrapper exits with the pass's status

#### Scenario: A pass stopped by hand

- **WHEN** the user runs the stop command for a clone whose pass is running
- **THEN** no notice is posted
