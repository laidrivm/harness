# stage-goal delta

## ADDED Requirements

### Requirement: The check before the push leaves out the pull request

The goal check SHALL take `--before-push` as a last argument to any stage. It
SHALL then hold every condition *A stage is done when the check says so*
fixes but the pull request's, and SHALL still require `HEAD` to name a branch.
Its last line SHALL open with `goal met` or `goal open` and name the form, and
it SHALL exit and record as the full check does. A session whose launcher
pushes for it SHALL be held to this form.

#### Scenario: Ready with no pull request

- **WHEN** `apply demo 2 --before-push` runs at a clean `HEAD` on a branch,
  group 2 is complete, the ledger holds a passing `pre-pr` record for `HEAD`,
  and the branch has no pull request
- **THEN** the check reports `goal met` before the push, exits 0, and runs no
  pull request query

#### Scenario: Something else missing

- **WHEN** the same call runs with no passing record for `HEAD`, a tracked
  edit, or `HEAD` on no branch
- **THEN** the check reports `goal open` naming each, and exits 1

#### Scenario: The flag out of place

- **WHEN** `--before-push` comes anywhere but last, twice, or misspelt
- **THEN** the check prints its usage, exits 2, and records nothing

#### Scenario: The full check is unchanged

- **WHEN** the check runs without `--before-push`
- **THEN** it decides and records exactly as *A stage is done when the check
  says so* and *Each verdict is recorded* fix
