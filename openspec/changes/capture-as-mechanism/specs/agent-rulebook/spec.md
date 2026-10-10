# agent-rulebook — delta spec

## ADDED Requirements

### Requirement: A captured lesson is weighed as a mechanism before it is written as prose

The fix & capture loop SHALL ask whether a mechanism can hold a lesson before
it proposes a rule for it. A mechanism is a test over the code the lesson is
about, or a gate: a `harness:check` check, a hook or a permission entry. A
rule SHALL be proposed only as the stop-gap for a gate filed as a card, or
when no mechanism can express the lesson without blocking far more than the
rule intends — and then the proposal SHALL say why.

#### Scenario: A test the branch can add

- **WHEN** a lesson is about one piece of code, and a test over that code,
  which the branch in hand can add, holds it
- **THEN** the capture adds the test in the same turn and proposes no rule

#### Scenario: A mechanism that changes a gate

- **WHEN** the mechanism that would hold a lesson is a hook, a permission
  entry or a new `harness:check` check — a gate change, which enters the
  OpenSpec cycle
- **THEN** the capture files a card for that mechanism, on the board of the
  repository that would ship it, and proposes the rule as a stop-gap, which
  leaves under *A mechanised prohibition leaves its prose home* once the gate
  lands

#### Scenario: No mechanism fits

- **WHEN** every mechanism that could hold a lesson would block far more than
  the rule intends
- **THEN** the rule is proposed, and the proposal to the user names why no
  mechanism fits

#### Scenario: A one-off

- **WHEN** a lesson is a one-off the loop already declines to capture
- **THEN** no mechanism is weighed either — the question applies only to what
  would otherwise become a rule

### Requirement: The yield ledger counts captures by kind

The session wrap-up SHALL tag every capture it proposes with its kind —
`mechanism`, `card + rule`, `rule`, `skill edit` or `memory` — and SHALL
append one line counting each kind to the pipeline-yield ledger it already
writes, so the share of lessons that became mechanisms accumulates where the
review steps' yield does.

#### Scenario: A session that captured something

- **WHEN** a wrap-up proposes two rules and one card with its stop-gap rule
- **THEN** the ledger gains a `captures:` line counting 2 `rule` and
  1 `card + rule`, beside that session's review-skill lines

#### Scenario: A session with nothing to capture

- **WHEN** a wrap-up's lessons step reports nothing to capture
- **THEN** the ledger still gains a `captures:` line reading zero, because a
  session that produced no lesson is a data point and not a gap

#### Scenario: A capture the user declines

- **WHEN** the user declines a proposed capture
- **THEN** it is still counted under the kind it was proposed as, because
  the line measures what the loop proposed, not what the user kept
