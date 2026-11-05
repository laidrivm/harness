## ADDED Requirements

### Requirement: The harness mutates each listed module against its own tests

In the harness, a module SHALL be each tracked `bun/<name>.ts` that is not a
test or a fixture, and the modules mutated SHALL be those one allow list
names — `stryker.config.json`'s `mutate` — which the run and the floor both
read: the modules whose tests exercise them in their own process, so that a
mutant's status reflects the tests rather than the load or a child process
that never saw the mutant. A listed module SHALL be mutated alone, and its
mutants SHALL be judged by `bun test bun/<name>` — the test files whose path
begins with it — and by no other test. A module the list does not name SHALL
NOT be mutated, and the run SHALL name it. A listed module that is not
tracked, or that no such test file matches, SHALL fail the run naming it:
nothing could kill its mutants, and a crashed run is not a count.

#### Scenario: A module with its own tests

- **WHEN** the run mutates a listed `bun/config.ts`
- **THEN** it mutates that file alone and runs `bun test bun/config` against
  each mutant

#### Scenario: A module the list does not name

- **WHEN** a tracked `bun/<name>.ts` has a test file but the list does not
  name it
- **THEN** the run mutates nothing in it, names it on its output, and goes on
  to the next module

#### Scenario: A listed module no test file matches

- **WHEN** the list names `bun/<name>.ts` and it is untracked, or no test
  file's path begins with `bun/<name>`
- **THEN** the run fails naming it before it mutates anything

### Requirement: A mutant's tests cannot write to the checkout

The run SHALL give the sandbox Stryker mutates in a git repository of its own
before the first test runs there, so that a test, or a mutant run in a test's
process, that finds the repository through git finds the sandbox and never
the checkout the run was started from: the sandbox sits under that checkout,
and a mutant that ran a module's main block once wrote the checkout's files.

#### Scenario: A mutant that writes to the root git names

- **WHEN** a test the run starts writes a file under the directory `git
  rev-parse --show-toplevel` names
- **THEN** the file lands in the sandbox, and the checkout is unchanged

### Requirement: Each module's results are stored in the tree

Each mutated module's results SHALL be stored as Stryker's incremental file,
one tracked file per module under `mutation/`, so that every clone reads the
same results. The floor SHALL count the survivors across every stored file.
A stored file whose module is no longer tracked, no longer has a test file,
or is no longer listed, SHALL fail the run, naming it, and so SHALL a listed
module with a test file and no stored file: either way the count would leave out, or include, code
nothing judged. A stored file SHALL record a fingerprint of the test files
and the fixtures they import that it was measured against, and SHALL hold
nothing that depends on the machine or the checkout that wrote it — no
absolute path, system, timing or test output — so that every clone writes
the same file for the same results.

#### Scenario: Unchanged modules counted from their stored results

- **WHEN** a run mutates one module and twenty others have stored results
- **THEN** the floor is compared against the survivors of all twenty-one

#### Scenario: A stored file outliving its module

- **WHEN** `bun/<name>.ts` is deleted and `mutation/<name>.json` is not
- **THEN** the run fails and names `mutation/<name>.json`

#### Scenario: A stored file whose module lost its last test

- **WHEN** the only test file matching `bun/<name>` is deleted and
  `mutation/<name>.json` is not
- **THEN** the run fails and names `mutation/<name>.json`

#### Scenario: A stored file whose module left the list

- **WHEN** `bun/<name>.ts` is taken off the list and `mutation/<name>.json`
  is not deleted
- **THEN** the run fails and names `mutation/<name>.json`

#### Scenario: A module with tests and no stored file

- **WHEN** `mutation/<name>.json` is deleted and the listed `bun/<name>.ts`
  still has a test file
- **THEN** the run fails and names the missing file, whether or not the
  branch changed anything under `bun/`

#### Scenario: The same results written in another checkout

- **WHEN** CI or another worktree re-runs a module whose results it does not
  change
- **THEN** the stored file it writes is the one `HEAD` tracks

### Requirement: A run mutates only what its stored results do not cover

A run SHALL mutate exactly the listed modules with tests that have no stored file, whose
source differs from the copy their stored file holds, or whose tests, the
fixtures they import and the shared test configuration no longer match its
fingerprint — a branch's changes, and any stale file a merge left. The last
SHALL re-run whole, because the command runner reports no tests, and a
module with no stored file too; the rest incrementally. The baseline SHALL
be the same run asked for every listed module.

#### Scenario: A new module has no stored file

- **WHEN** a branch adds `bun/new.ts` and `bun/new.test.ts`, and lists it
- **THEN** the run mutates `bun/new.ts` whole, writes `mutation/new.json`,
  and fails until that file is committed

#### Scenario: The module's source changed

- **WHEN** `bun/command-parse.ts` differs from the source
  `mutation/command-parse.json` holds, and its tests match the fingerprint
- **THEN** the run mutates that module incrementally and no other module

#### Scenario: A test file changed

- **WHEN** only `bun/pre-pr-steps.test.ts` changed since the stored files
  were written
- **THEN** the run re-runs whole every module whose test filter matches that
  path — `bun/pre-pr.ts` and `bun/pre-pr-steps.ts` — and no other

#### Scenario: A fixture another module's tests import

- **WHEN** only `bun/command-guard.fixture.ts` changed, and
  `bun/command-parse.test.ts` imports it
- **THEN** the run re-runs `bun/command-parse.ts` whole among the modules
  whose tests import it

#### Scenario: A run asked for every module

- **WHEN** the run is started for every listed module
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
