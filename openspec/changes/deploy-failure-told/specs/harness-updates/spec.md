## MODIFIED Requirements

### Requirement: A bump attempts only the harness's newest green commit

A consumer's bump SHALL target the head of the harness's `main` branch, and
only once that commit's newest harness test run, across every check suite of
the commit, has succeeded. When the head is not
yet green, or equals the consumer's pin, the bump SHALL exit successfully
having changed nothing and SHALL NOT proceed to land.

#### Scenario: A quiet day changes nothing

- **WHEN** a bump runs while the harness's head either has no successful
  test run or is the commit the consumer already pins
- **THEN** it exits 0, the consumer's tree is unchanged, and it reports no
  target to land

#### Scenario: An older check suite's success does not make the head green

- **WHEN** the harness's head carries a harness test run in more than one
  check suite, and the newest of them is pending or failed while an older
  one succeeded
- **THEN** the bump exits 0, the consumer's tree is unchanged, and it reports
  no target to land
