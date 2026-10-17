# stage-goal — delta spec

## ADDED Requirements

### Requirement: A pull request read that does not answer is a failed try

The goal check SHALL end a read of the pull request's state that has not
answered within a fixed time limit, and SHALL count it as one failed try of
the bounded number that *A stage is done when the check says so* allows. The
check SHALL therefore end within that number of limits and the pauses between
them, whatever `gh` does.

#### Scenario: A read that never answers

- **WHEN** `gh` neither answers nor exits on any try
- **THEN** each try ends at the limit, and after the last one the check
  reports `goal open` and says the pull request's state could not be read

#### Scenario: A read that hangs and then answers

- **WHEN** the first try runs past the limit, a later one within the bound
  reads an open pull request whose head is `HEAD`, and every other condition
  holds
- **THEN** the check reports `goal met`, as if no try had failed
