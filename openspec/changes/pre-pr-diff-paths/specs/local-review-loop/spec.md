# local-review-loop — delta

## MODIFIED Requirements

### Requirement: The gate runs after triage and before the push

The agent SHALL invoke `/coderabbit-local` against the branch after `/triage`
and before pushing. A documentation branch, as `pre-pr-runner` (*The runner
names the steps the branch requires from its diff*) classifies one, SHALL get
one review pass rather than the full loop.

#### Scenario: A code branch reaches the end of the sequence

- **WHEN** `/triage` has been run over the final diff of a code branch
- **THEN** the agent invokes `/coderabbit-local` before pushing

#### Scenario: The CLI is unavailable

- **WHEN** `coderabbit doctor` exits non-zero, or `coderabbit` is not on PATH
- **THEN** the agent reports which check failed and what fixes it
- **AND** pushes without the gate rather than blocking the branch

#### Scenario: A documentation branch

- **WHEN** the runner classifies the branch as a documentation branch
- **THEN** the agent runs one review pass, not three
