## ADDED Requirements

### Requirement: The CI flow holds the pull request draft while it works on it

On the pull request route, the runner SHALL mark the pull request draft
before it brings the clone to the branch and resumes the session. Once that
work ends it SHALL mark the pull request ready, right after the push when it
pushes and otherwise as soon as it knows no push will come, unless the
session answered `blocked`, whose question on the card keeps the pull request
draft. A ready that GitHub refuses SHALL make the runner exit non-zero naming
the pull request. The flaky and scheduled routes SHALL leave the draft state
as they found it.

#### Scenario: The CI flow works on a draft

- **WHEN** the CI flow resumes the session on a pull request
- **THEN** the pull request is draft while the session runs; it is marked
  ready right after the push of a fix, and with no push for any outcome but
  `blocked`, which leaves it draft

#### Scenario: A ready GitHub refuses

- **WHEN** the runner pushed a fix and GitHub refuses to mark the pull
  request ready
- **THEN** the push stays, and the runner exits non-zero naming the pull
  request
