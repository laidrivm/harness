# orchestrator — delta

## ADDED Requirements

### Requirement: A clone rests until the subscription's reset

When a pass's last line is `board-loop: limited — until <time>`, the wrapper
SHALL write `<clone>.resume` in its state directory holding that time, and
write no stop file. While the time has not come, a tick SHALL start no pass in
that clone, print the time it rests until, and exit 0. The first tick at or
after it SHALL remove the file and start a pass. A file whose time does not
parse SHALL be removed and the pass started. Neither SHALL call the user.

#### Scenario: A pass that met the limit

- **WHEN** the pass exits 0 with the `limited` line naming a time
- **THEN** `<clone>.resume` holds that time, no stop file exists, and the
  wrapper exits 0

#### Scenario: A tick before the reset

- **WHEN** the timer fires and `<clone>.resume` names a later time
- **THEN** no pass starts, the wrapper prints that time and exits 0

#### Scenario: The first tick after the reset

- **WHEN** the timer fires at or after the time `<clone>.resume` names
- **THEN** the file is gone and a pass starts

#### Scenario: A resume file that does not parse

- **WHEN** `<clone>.resume` holds no time the wrapper can read
- **THEN** the wrapper removes it and starts a pass
