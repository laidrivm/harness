# test-temp-dir

## ADDED Requirements

### Requirement: A test run keeps its temporary directories under one parent

The harness's `bunfig.toml` SHALL preload, after the git-environment guard, a
module that makes one directory named `harness-test-*` under the `TMPDIR` the
run started with, sets `process.env.TMPDIR` to it before any test file loads,
and removes it with everything under it once the run's last test file has
finished, whether its tests passed or failed. A removal that fails SHALL NOT
fail the run, and leaves the parent to a later run's sweep. A run the
git-environment guard refuses SHALL make no such directory.

#### Scenario: A fixture's temporary directory lands in the parent

- **WHEN** a test under the preload calls `tmpdir()`
- **THEN** the path it returns is a `harness-test-*` directory directly under
  the `TMPDIR` the run started with

#### Scenario: Test files of one run share the parent

- **WHEN** a run holds two test files, each making a temporary directory in
  its test
- **THEN** both tests pass, the parent still there when the second file runs

#### Scenario: A run that ends leaves nothing

- **WHEN** a run whose tests make temporary directories ends, its tests
  passing
- **THEN** the `TMPDIR` it started with holds no `harness-test-*` or
  `harness-swept-*` entry it did not hold before the run

#### Scenario: A run whose tests fail leaves nothing

- **WHEN** a run whose tests make temporary directories ends with a failing
  test
- **THEN** the `TMPDIR` it started with holds no `harness-test-*` or
  `harness-swept-*` entry it did not hold before the run

#### Scenario: A parent that cannot be removed at the end

- **WHEN** a passing run's test leaves a non-empty subdirectory without write
  permission
- **THEN** the run exits 0

#### Scenario: A refused run makes no parent

- **WHEN** the suite is started with `GIT_DIR` set and the git-environment
  guard refuses it
- **THEN** the `TMPDIR` it started with holds no `harness-test-*` or
  `harness-swept-*` entry it did not hold before the run

### Requirement: A killed run leaves one entry, which a later run removes

A run that ends without its end-of-run hooks — killed, a Stryker mutant
killed on timeout among them, or stopped by a test's `process.exit` or by
`--bail` — SHALL leave, of the directories its test process made through
`tmpdir()`, only its `harness-test-*` parent in the `TMPDIR` it started with.
Before making its own parent, a run SHALL remove each directory, not followed
through a link, named `harness-test-*` or `harness-swept-*` under that
`TMPDIR` that has not been modified for an hour, claiming it first by a rename
to a new `harness-swept-*` name, so concurrent runs never remove the same one;
it SHALL keep every other one and every entry of any other name or kind. An
entry it cannot read, claim or remove SHALL NOT stop the run.

#### Scenario: A run killed mid-test

- **WHEN** a run whose test has made temporary directories is killed with
  `SIGKILL`
- **THEN** the `TMPDIR` it started with holds one `harness-test-*`
  directory more than before

#### Scenario: A run stopped by a test's process.exit

- **WHEN** a test that has made temporary directories calls `process.exit(0)`
- **THEN** the `TMPDIR` the run started with holds one `harness-test-*`
  directory more than before

#### Scenario: A later run removes an abandoned parent

- **WHEN** a run starts while the `TMPDIR` holds a `harness-test-*`
  directory last modified two hours earlier
- **THEN** that directory is gone once the run has started, and no
  `harness-swept-*` entry is left in its place

#### Scenario: A later run removes an abandoned claim

- **WHEN** a run starts while the `TMPDIR` holds a `harness-swept-*`
  directory last modified two hours earlier, a sweep killed mid-removal
- **THEN** that directory is gone once the run has started

#### Scenario: A later run keeps a parent in use

- **WHEN** a run starts while the `TMPDIR` holds a `harness-test-*`
  directory modified a minute earlier
- **THEN** that directory is still there when the run ends

#### Scenario: An abandoned parent that cannot be removed

- **WHEN** a run starts while the `TMPDIR` holds a `harness-test-*`
  directory last modified two hours earlier, holding a non-empty
  subdirectory without write permission
- **THEN** the run's tests run and it exits 0

#### Scenario: Other entries are left alone

- **WHEN** a run starts while the `TMPDIR` holds, each last modified two
  hours earlier, a directory of another name and a regular file named
  `harness-test-x`
- **THEN** both are still there when the run ends
