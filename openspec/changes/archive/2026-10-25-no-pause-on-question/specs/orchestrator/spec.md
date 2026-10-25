## MODIFIED Requirements

### Requirement: A failed pass pauses the timer until the user removes the stop file

When the pass exits non-zero, the wrapper SHALL write a stop file naming the
time, the exit status and the pass's last line, and SHALL exit with the pass's
status. While the stop file exists, the wrapper SHALL start no pass and SHALL
exit non-zero, naming the file. Nothing but the user SHALL remove it.

#### Scenario: The pass exits 1

- **WHEN** the board loop's pass exits 1
- **THEN** the stop file exists, holds the time, `1` and the pass's last line,
  and the wrapper exits 1

#### Scenario: The next tick after a failure

- **WHEN** the timer fires and the stop file exists
- **THEN** no pass starts, and the wrapper exits non-zero naming the stop file

#### Scenario: The user removes the stop file

- **WHEN** the user removes the stop file and the timer fires
- **THEN** a pass starts

#### Scenario: A pass that met its goal or found nothing

- **WHEN** the pass exits 0
- **THEN** no stop file is written

#### Scenario: A pass waiting on the user's answer

- **WHEN** the pass ends `waiting`, since a question on its card waits on the
  user, and exits 0
- **THEN** no stop file is written, and the next tick starts a pass

#### Scenario: The runner cannot start

- **WHEN** `bun` or the runner's file is missing, so the command exits
  non-zero without a pass
- **THEN** the stop file is written, as for a failed pass

#### Scenario: The connection that started the pass drops

- **WHEN** the session that started the wrapper hangs up mid-pass
- **THEN** the pass runs to its end, and the stop file reflects its exit
  status
