## ADDED Requirements

### Requirement: A pause posts one notice to the user

When the wrapper writes a stop file, it SHALL run the notice command the host
names, once, with the stop file and, when the pass started, its log. That
command SHALL post one page-level comment from the runner's Notion integration
on the status card the runner's settings name, opening with
`harness-pause`, mentioning the user, and holding the clone, the stop file's
line, the log's path and the command that removes the stop file, and SHALL
then set that card's `Assign` to the user. A tick refused by an existing stop
file, and a pass stopped by hand, SHALL post nothing. The notice SHALL change
neither the stop file nor the wrapper's exit status, and a notice that fails
SHALL print why.

#### Scenario: A pass exits 1 on a host with a status card

- **WHEN** the pass exits 1 and the runner's settings name a status card
- **THEN** the stop file is written, one comment naming the clone, the stop
  line and the log's path is posted on the status card from the integration,
  the card's `Assign` holds the user, and the wrapper exits 1

#### Scenario: The ticks that follow

- **WHEN** the timer fires again while the stop file exists
- **THEN** the wrapper exits 3 and the notice command does not run

#### Scenario: A host that cannot start the pass

- **WHEN** the wrapper pauses before the pass starts, as for a missing token
- **THEN** the notice is posted with the stop line and names no log

#### Scenario: No status card is configured

- **WHEN** the runner's settings are missing or name no status card
- **THEN** nothing is posted, the command prints why, and the stop file and
  the exit status are those of a pause with no notice

#### Scenario: Notion refuses the post

- **WHEN** the comment's post or the `Assign` write fails
- **THEN** the command prints which step failed, the stop file stands, and the
  wrapper exits with the pass's status

#### Scenario: A pass stopped by hand

- **WHEN** the user runs the stop command for a clone whose pass is running
- **THEN** no notice is posted
