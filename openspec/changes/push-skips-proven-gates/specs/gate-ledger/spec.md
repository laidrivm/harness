## MODIFIED Requirements

### Requirement: A reader counts a record only for its own gate and step

A reader asking whether a step ran at a commit SHALL match a record by the
gate that writes that step's evidence, the commit, and the checkout's top
level as its project, and by the step's rule and the decision when the reader
names them. A skill-call record SHALL NOT count as the pre-PR runner's, a
runner record SHALL NOT count as a skill call, and a record of one skill
SHALL NOT count as another's. The pre-push hook is such a reader of the
runner's passing `project-checks` record, and reads it without writing one.

#### Scenario: A skill record at the tip

- **WHEN** the ledger holds a `zombies` skill record for the turn's tip and no
  runner record
- **THEN** the turn gate and the goal check find no run record for the tip

#### Scenario: A diff-budget record among skill records

- **WHEN** the ledger holds `zombies` and `triage` skill records and a passing
  runner record of every runner step, all for commit `C` in this checkout
- **THEN** the goal check finds the passing run record for `C`

#### Scenario: Another skill's record

- **WHEN** the ledger holds a `triage` skill record for commit `C` and no
  `zombies` one
- **THEN** a reader asking for the `zombies` skill call at `C` finds none

#### Scenario: A refusal at the commit

- **WHEN** the ledger holds a refusal that names commit `C` in this checkout,
  and no runner or skill record of `C`
- **THEN** a reader asking for a skill call or a runner record at `C` finds
  none

#### Scenario: A push of a commit the runner passed

- **WHEN** the ledger holds a passing `project-checks` runner record of `C`
  in this checkout and the pre-push hook reads it for a push landing `C`
- **THEN** the hook finds it, and the ledger gains no record from the read
