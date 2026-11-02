## ADDED Requirements

### Requirement: The runner names the steps without running them when asked

Given `--steps`, the runner SHALL print the line *The runner names the steps
the branch requires from its diff* sets out, from the same base and pull
request state, and nothing else: it SHALL run neither the diff budget nor the
project checks, SHALL write no record, and SHALL exit 0. An agent reads the
list before its last commit this way, and runs the checks once, after it.

#### Scenario: The list alone

- **WHEN** the runner runs with `--steps` on a code branch with no pull
  request open
- **THEN** it prints `PRE-PR steps: ` and the code branch's steps, runs no
  step, and exits 0

#### Scenario: The list against a base

- **WHEN** the runner runs with `--steps` and a base `B`
- **THEN** the steps are those the diff against `B` requires

#### Scenario: The list writes no record

- **WHEN** the runner runs with `--steps` on a clean tree
- **THEN** the ledger gains no `pre-pr` record, so the turn gate, the goal
  check and `work.ts finish` find no run of the commit from it
