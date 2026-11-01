## MODIFIED Requirements

### Requirement: The count of uncited criteria may not rise silently

The check SHALL compare the number of uncited criteria against the floor
declared as `harness.uncitedFloor.count` in the `package.json` of the
repository it runs in, failing and naming that field when it is not a whole
number, and SHALL fail when the count is above it. The floor SHALL also be
failed when the count is *below* it, reporting the value to write instead, so
the number tracks reality rather than drifting into a meaningless upper bound.

The floor SHALL carry its reason as `harness.uncitedFloor.why`, holding at
least one non-whitespace character, and the check SHALL fail when it does
not — `{ "count": 380, "why": " " }` states no reason and SHALL NOT pass. That
is the whole exemption mechanism: a criterion no runtime can assert, one a
person discharges rather than a process, is admitted by raising the floor with
a reason a reviewer reads, rather than by a register of its own listing them
one by one.

The check SHALL run among the gates of `bun/check.ts`, the entry point a
repository that installs the harness runs over itself, which reports every
gate's problems in one run.

#### Scenario: The repository as it stands

- **WHEN** the check runs over the tree with the floor holding the measurement
  its reason describes
- **THEN** it passes

#### Scenario: A criterion added without a test

- **WHEN** an archived change adds a criterion nothing cites
- **THEN** the check fails, reporting the count and the floor

#### Scenario: A criterion admitted as untestable

- **WHEN** the same commit raises the floor by one and writes the reason in
  `harness.uncitedFloor.why`
- **THEN** the check passes, and the exemption is a sentence in the diff

#### Scenario: The floor changed with no reason given

- **WHEN** `harness.uncitedFloor.why` is absent, empty or whitespace
- **THEN** the check fails, whichever direction the number moved

#### Scenario: A criterion newly covered

- **WHEN** a test is added citing a criterion that had none, leaving the count
  below the floor
- **THEN** the check fails and names the lower value to write, so the gain is
  recorded rather than absorbed

#### Scenario: A floor that is not a whole number

- **WHEN** `harness.uncitedFloor.count` is absent, a string or a fraction
- **THEN** the check fails naming `harness.uncitedFloor.count`, and reports no
  gap against it
