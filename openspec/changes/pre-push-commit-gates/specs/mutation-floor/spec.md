## ADDED Requirements

### Requirement: The harness mutates each module against its own tests

In the harness, a module SHALL be each tracked `bun/<name>.ts` that is not a
test or a fixture. A module SHALL be mutated alone, and its mutants SHALL be
judged by `bun test bun/<name>` — the test files whose path begins with it —
and by no other test. A module no such test file matches SHALL NOT be
mutated, and the run SHALL name it: nothing could kill its mutants, and a
crashed run is not a count.

#### Scenario: A module with its own tests

- **WHEN** the run mutates `bun/command-parse.ts`
- **THEN** it mutates that file alone and runs `bun test bun/command-parse`
  against each mutant

#### Scenario: A module no test file matches

- **WHEN** a tracked `bun/<name>.ts` has no test file whose path begins with
  `bun/<name>`
- **THEN** the run mutates nothing in it, names it on its output, and goes on
  to the next module

### Requirement: Each module's results are stored in the tree

Each mutated module's results SHALL be stored as Stryker's incremental file,
one tracked file per module under `mutation/`, so that every clone reads the
same results. The floor SHALL count the survivors across every stored file.
A stored file whose module is no longer tracked SHALL fail the run, naming
it, because its survivors would be counted for code that does not exist.

#### Scenario: Unchanged modules counted from their stored results

- **WHEN** a run mutates one module and twenty others have stored results
- **THEN** the floor is compared against the survivors of all twenty-one

#### Scenario: A stored file outliving its module

- **WHEN** `bun/<name>.ts` is deleted and `mutation/<name>.json` is not
- **THEN** the run fails and names `mutation/<name>.json`

### Requirement: A run mutates only what the branch changed

A run SHALL mutate the modules the branch changed against its base, the base
the diff budget resolves, and no other. A changed module SHALL be re-run
incrementally from its stored file. A module whose test or fixture files
changed SHALL be re-run whole, because the command runner reports no tests,
so the stored file cannot show a changed test. The baseline SHALL be the same
run asked for every module.

#### Scenario: The module's source changed

- **WHEN** a branch changes `bun/command-parse.ts` and none of its tests
- **THEN** the run mutates that module incrementally from
  `mutation/command-parse.json` and no other module

#### Scenario: A test file changed

- **WHEN** a branch changes `bun/pre-pr-steps.test.ts` only
- **THEN** the run re-runs whole every module whose test filter matches that
  path — `bun/pre-pr.ts` and `bun/pre-pr-steps.ts` — and no other

#### Scenario: A run asked for every module

- **WHEN** the run is started for every module
- **THEN** it mutates each module in turn, each incrementally from its stored
  file where one exists, so an interrupted baseline resumes where it stopped

### Requirement: A run that changed stored results refuses until they are committed

After the run, a stored file that differs from the one `HEAD` tracks, or one
`HEAD` does not track, SHALL fail the run, naming each file and saying to
commit it. Results left in one working tree would hold for that clone alone,
and a second run over the committed results is near-instant.

#### Scenario: A push whose run rewrote a stored file

- **WHEN** a branch changes a module and its run rewrites
  `mutation/<name>.json`
- **THEN** the run exits non-zero naming the file, and once it is committed
  the same run passes without mutating again

#### Scenario: A run that found nothing to rewrite

- **WHEN** a run over committed, current results leaves every stored file as
  `HEAD` holds it
- **THEN** the run passes on the floor alone
