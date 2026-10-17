# board-loop — delta spec

## ADDED Requirements

### Requirement: A pull request query that does not answer fails

The runner SHALL end its pull request query for a candidate once the query
has run past the time limit that `stage-goal`'s *A pull request read that
does not answer is a failed try* gives the goal check's read, and SHALL treat
it as a query that failed, which *A pass takes only a takeable change* makes
untakeable.

#### Scenario: `gh` hangs on the query

- **WHEN** `gh` neither answers nor exits on the pull request query
- **THEN** the runner ends the query at the limit, passes the change over
  saying the query failed, and the pass ends as it would with `gh` failing
