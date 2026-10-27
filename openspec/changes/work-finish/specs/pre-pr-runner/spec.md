# pre-pr-runner — delta

## ADDED Requirements

### Requirement: A run record counts only for its own step

A reader asking for one step's evidence — `work.ts finish` and the goal
check each ask for every runner step's — SHALL count a runner's record only when
the record's `rule` names that step, beside its gate, commit, checkout and
outcome. The turn gate asks only whether the runner ran, and any of its
records answers that. One step's record SHALL NOT stand in for another's once the runner
records more than the diff budget (user, 2026-10-26).

#### Scenario: Another step's record

- **WHEN** the ledger holds a passing `pre-pr` record of commit `C` whose rule
  names a step other than the diff budget, and none for the diff budget
- **THEN** a reader asking for the diff budget at `C` finds no evidence

#### Scenario: The step's own record

- **WHEN** the ledger holds a passing `pre-pr` record of `C` for the diff
  budget
- **THEN** a reader asking for the diff budget at `C` finds it
