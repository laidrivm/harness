# board-loop delta

## ADDED Requirements

### Requirement: The runner records the session of each step it pushes

The runner SHALL start each stage session with a session id it chose. Before
it pushes a step's branch, it SHALL append one record to the PR → session
table naming the repository, the branch, the session id, the clone and the
time. When the record cannot be written, the runner SHALL push nothing and
open nothing, and the pass SHALL record `open` naming the table.

#### Scenario: A step ready to push

- **WHEN** the runner is about to push a step's branch
- **THEN** the table's last line names that repository, branch, the stage
  session's id and the clone, and the push follows

#### Scenario: A step continued by a second session

- **WHEN** a later pass continues the step's branch in a new session and
  pushes it
- **THEN** a second record names the new session, and a lookup returns it

#### Scenario: A step not ready

- **WHEN** the runner pushes nothing
- **THEN** the table is unchanged

#### Scenario: The table cannot be written

- **WHEN** appending the record fails
- **THEN** the runner pushes nothing and opens nothing, the pass records
  `open` naming the table's path, and the branch keeps its commits for the
  pass that continues it
