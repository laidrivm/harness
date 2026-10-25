## MODIFIED Requirements

### Requirement: A failed pass pauses the timer until the user removes the stop file

When the pass exits non-zero, other than as the first or second in a row of
the clone's passes to exit 75 (below), the wrapper SHALL write a stop file
naming the time, the exit status and the pass's last line, and SHALL exit with
the pass's status. While the stop file exists, the wrapper SHALL start no pass and SHALL
exit non-zero, naming the file. Nothing but the user SHALL remove it.

A pass that exits 75, the board loop's `retry`, SHALL write no stop file
while it is the first or second in a row of the clone's passes to exit 75;
the wrapper SHALL keep that count beside the stop file, and the third SHALL
write the stop file as a failed pass does, naming the count. A pass that exits
with any other status, and a tick that writes the stop file without starting
a pass, SHALL clear the count; a tick that finds the lock held or the stop
file present SHALL leave it. A fetch the wrapper itself makes
before the pass, of the push clone or of the harness pin, SHALL count as a
pass that exited 75 when it fails.
The wrapper SHALL exit 75 for each of them.

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

#### Scenario: A transient failure skips the tick

- **WHEN** the pass exits 75 and the clone's previous pass did not
- **THEN** no stop file is written, the wrapper exits 75, and the next tick
  starts a pass

#### Scenario: A third transient failure in a row

- **WHEN** the pass exits 75 and the clone's two previous passes did too
- **THEN** the stop file holds the time, `75`, the pass's last line and the
  count, and the wrapper exits 75

#### Scenario: A pass between transient failures

- **WHEN** a pass exits 75, the next exits 0, and the one after exits 75
- **THEN** no stop file is written

#### Scenario: The push clone cannot fetch

- **WHEN** the wrapper's fetch of the push clone's `origin` fails
- **THEN** it starts no pass, counts it as a pass that exited 75, and exits 75

#### Scenario: The runner cannot start

- **WHEN** `bun` or the runner's file is missing, so the command exits
  non-zero without a pass
- **THEN** the stop file is written, as for a failed pass

#### Scenario: The connection that started the pass drops

- **WHEN** the session that started the wrapper hangs up mid-pass
- **THEN** the pass runs to its end, and the stop file reflects its exit
  status
