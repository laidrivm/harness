# board-loop delta

## ADDED Requirements

### Requirement: The runner records the session of each pull request it opens

The runner SHALL start each stage session with a session id it chose. Once it
has opened that step's pull request, or found one already open at `HEAD`, it
SHALL append one record to the PR → session table naming the repository, the
pull request's number, its branch, the session id, the clone and the time.
A failure to write the record SHALL leave the pass's verdict unchanged and be
named in its output.

#### Scenario: A step's pull request opens

- **WHEN** the runner opens a step's pull request
- **THEN** the table's last line names that repository, number, branch, the
  stage session's id and the clone

#### Scenario: A step continued by a second session

- **WHEN** a later pass continues the step's branch in a new session and finds
  its pull request already open at `HEAD`
- **THEN** a second record names the new session, and a lookup returns it

#### Scenario: No pull request

- **WHEN** the pass opens no pull request
- **THEN** the table is unchanged

#### Scenario: The table cannot be written

- **WHEN** appending the record fails
- **THEN** the pass's verdict is what the full goal check reads, and its
  output names the table's path
