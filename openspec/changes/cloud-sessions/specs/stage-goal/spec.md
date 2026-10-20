# stage-goal delta

## ADDED Requirements

### Requirement: A branch's pull requests are read through GitHub's REST API

The goal check and the board loop's runner SHALL read a branch's pull
requests in one read, through GitHub's REST endpoint that lists a
repository's pull requests filtered by head and in every state, and SHALL
make no GraphQL call for it. The repository and the head's owner SHALL be the
owner and name that the URL `origin` resolves to ends in. Each pull request
SHALL be read as its number, a state — `OPEN` when the API says `open`,
`MERGED` when it says `closed` and gives a merge time, `CLOSED` otherwise —
and its head commit, so that *A stage is done when the check says so* and
`board-loop`'s *A pass takes only a takeable change* decide on the same
fields as before. A read SHALL fail, as a read `gh` cannot answer fails, when
`origin` is missing, its URL ends in no owner and name, or the answer is not
a list.

#### Scenario: An open pull request

- **WHEN** the API lists one pull request on the branch with state `open`
  and head `HEAD`, and every other condition holds
- **THEN** the check reports `goal met`

#### Scenario: A merged pull request

- **WHEN** the API lists the branch's pull request as `closed` with a merge
  time and head `HEAD`
- **THEN** the check reports `goal met`, as for an open one

#### Scenario: A pull request closed unmerged

- **WHEN** the API lists the branch's only pull request as `closed` with no
  merge time
- **THEN** the check reports `goal open` and says no pull request of the
  branch is open or merged, and the runner passes the change over naming
  that pull request

#### Scenario: Where GraphQL is refused

- **WHEN** `gh` answers every GraphQL call with an error and the REST
  endpoint with the branch's pull requests
- **THEN** both the check and the runner read them, and neither calls
  `gh pr` or `gh api graphql`

#### Scenario: A fork's branch of the same name

- **WHEN** a fork has a pull request from a branch named as the step's
- **THEN** the read asks only for heads in `origin`'s owner, so that pull
  request is not the branch's

#### Scenario: `origin` in each form

- **WHEN** `origin` is `https://github.com/o/r.git`, `git@github.com:o/r`, a
  proxy URL whose path ends in `/o/r`, or a local path ending in `o/r.git`
- **THEN** the read names repository `o/r` and head owner `o`

#### Scenario: No owner and name to read

- **WHEN** the clone has no `origin`, or its URL ends in fewer than two path
  segments or in a segment holding a character GitHub allows in no name
- **THEN** the read fails without calling `gh`, so the check reports the
  state unreadable and the runner says the query failed

#### Scenario: A branch name the query string would split

- **WHEN** the branch's name holds a character with a meaning in a query
  string, such as `&` or `#`
- **THEN** the read passes the name encoded, so the filter names the whole
  branch
