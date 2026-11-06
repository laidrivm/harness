## MODIFIED Requirements

### Requirement: The count of surviving mutants may not rise silently

A check SHALL read a report in Stryker's JSON schema at `reports/mutation/mutation.json`,
resolved from the repository root, count the mutants that survived, and
compare that count against the floor declared as
`harness.mutationFloor.surviving` in the `package.json` of the repository it
runs in, failing and naming that field when it is not a whole number. A
mutant counts as surviving when its status is `Survived` or `NoCoverage`:
`Killed`, `Timeout`, `Ignored`, `CompileError` and
`RuntimeError` all mean something other than "the tests let this through",
and `NoCoverage` means no test ran against it at all. `NoCoverage` should not
arise under the command runner, which performs no coverage analysis, and is
counted rather than excluded precisely because its appearance would mean the
setup is not what this requirement assumes.

Stryker's own `thresholds.break` SHALL stay `null`: it compares a
mutation-score percentage whose denominator moves with every edit to a
mutated module, so the same set of survivors yields a different score after
an unrelated refactor and no one can write a reason about it.

`stryker.config.json` SHALL list `json` among its `reporters`. The default is
`clear-text`, `progress` and `html`, and `jsonReporter.fileName` names a path
without enabling the reporter that writes it — a configuration setting only the
filename produces no report, and the check then fails on an absent file at
every run.

The check SHALL run no tool. Whoever invokes it produces the report first, as
a separate command, so a Stryker that crashed is a non-zero exit the shell
already surfaces, and the check never has to tell its own verdict apart from
the tool's failure. In the harness that invoker is the mutation step the
pre-push hook and the CI job run before the check: the step runs Stryker on
the modules its stored results do not cover, or on none, and writes the
report as the merge of every stored result. For the same reason the invoker, not the check, SHALL
delete the previous report before writing it: a reader cannot tell a stale
file from a fresh one, and an absent report already fails.

A mutant whose status appears in neither list above SHALL fail the check,
naming the status. Counting the known survivors and ignoring the rest would
silently under-count if Stryker ever reports a not-killed mutant under a name this
check predates.

The check SHALL fail when the count is above the floor, reporting both numbers.
It SHALL also fail when the count is *below* the floor, naming the value to
write, so a gain is recorded rather than absorbed into slack.

The floor SHALL carry its reason as `harness.mutationFloor.why`, holding at
least one non-whitespace character, and the check SHALL fail when it does
not — `{ "surviving": 12, "why": " " }` states no reason and SHALL NOT pass.
The reason is required whichever direction the number moved, because
establishing the direction would mean reading the previous value out of git
history for a guarantee the diff already gives.

#### Scenario: The repository as it stands

- **WHEN** the check runs over the current tree with
  `harness.mutationFloor.surviving` set to the measured count and its reason
  in `harness.mutationFloor.why`
- **THEN** it passes

#### Scenario: A branch added without a test

- **WHEN** a line is added to a mutated `bun/<name>.ts` whose mutant no test
  under `bun/<name>` kills
- **THEN** the check fails, reporting the survivor count and the floor

#### Scenario: A survivor newly killed

- **WHEN** a test is added that kills a mutant which previously survived,
  leaving the count below the floor
- **THEN** the check fails and names the lower value to write

#### Scenario: The floor changed with no reason given

- **WHEN** `harness.mutationFloor.why` is absent, empty or whitespace
- **THEN** the check fails, whichever direction the number moved

#### Scenario: A floor that is not a whole number

- **WHEN** `harness.mutationFloor.surviving` is absent, a string or a fraction
- **THEN** the check fails naming `harness.mutationFloor.surviving`, and
  reports no gap against it

### Requirement: Each module's results are stored in the tree

Each mutated module's results SHALL be stored as Stryker's incremental file,
one tracked file per module under `mutation/`, so that every clone reads the
same results. The floor SHALL count the survivors across every stored file.
A stored file whose module is no longer tracked, no longer has a test file,
or is no longer listed, SHALL fail the run before it mutates anything, naming
it: the count would include code nothing judges. A listed module with a test
file and no stored file SHALL be mutated whole, and the run SHALL then fail
naming the file it wrote until that file is committed: the count would
otherwise leave the module out. A stored file SHALL record a fingerprint of
the test files and the fixtures they import that it was measured against,
and of the command, Stryker options and timeouts its mutants ran under, and
SHALL hold nothing that depends on the machine or the checkout that wrote
it — no absolute path, system, timing or test output — so that every clone
writes the same file for the same results.

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
- **THEN** the run mutates `bun/<name>.ts` whole, whether or not the branch
  changed anything under `bun/`, and fails naming `mutation/<name>.json`
  until it is committed

#### Scenario: The same results written in another checkout

- **WHEN** CI or another worktree re-runs a module whose results it does not
  change
- **THEN** the stored file it writes is the one `HEAD` tracks

### Requirement: A run mutates only what its stored results do not cover

A run SHALL mutate exactly the listed modules with tests that have no stored file, whose
source differs from the copy their stored file holds, or whose tests, the
fixtures they import, the shared test configuration and Stryker's options no
longer match its fingerprint — a branch's changes, and any stale file a merge
left. The last SHALL re-run whole, because the command runner reports no
tests, and a module with no stored file too; the rest incrementally. The
baseline SHALL be the same run asked for every listed module. A run that would
mutate SHALL fail first while the checkout holds an edited or untracked file
outside `mutation/`, naming each, since Stryker copies the working tree and
not `HEAD`. Whether or not any module needs a run, a listed module whose
source, tests, the fixtures they import or the shared test configuration
differ from `HEAD`'s copy SHALL fail the run first, naming each, since its
results and its fingerprint are measured against `HEAD`'s copy.

Of the files a module's tests reach, the fingerprint SHALL hold only the
fixtures they import directly, `bunfig.toml` and what it preloads: a change
to a module a test imports that is not a fixture, or to a fixture only
another fixture imports, re-runs no module whose tests reach it that way. A run asked for every module whole refreshes
them by hand; deriving every importer would be machinery for a rare case.

#### Scenario: Stryker's options changed

- **WHEN** `stryker.config.json`'s options other than `mutate`, the command a
  mutant runs, or its timeouts differ from those a stored file records
- **THEN** the run re-runs every listed module whole

#### Scenario: A checkout with uncommitted files

- **WHEN** a module needs a run and the checkout holds an untracked
  `notes.ts`
- **THEN** the run fails naming `notes.ts` before it mutates anything, and a
  run that needs no module does not

#### Scenario: A listed module's file left uncommitted

- **WHEN** a listed `bun/<name>.ts`, a test file matching `bun/<name>`, a
  fixture that test imports or `bunfig.toml` is edited and not committed, and
  every stored file is current
- **THEN** the run fails naming that file before it mutates anything

#### Scenario: A new module has no stored file

- **WHEN** a branch adds `bun/new.ts` and `bun/new.test.ts`, and lists it
- **THEN** the run mutates `bun/new.ts` whole, writes `mutation/new.json`,
  and fails until that file is committed

#### Scenario: The module's source changed

- **WHEN** a listed `bun/<name>.ts` differs from the source
  `mutation/<name>.json` holds, and its tests match the fingerprint
- **THEN** the run mutates that module incrementally and no other module

#### Scenario: A test file changed

- **WHEN** the list names `bun/<name>.ts` and `bun/<name>-steps.ts`, and only
  `bun/<name>-steps.test.ts` changed since the stored files were written
- **THEN** the run re-runs whole every listed module whose test filter matches
  that path — `bun/<name>.ts` and `bun/<name>-steps.ts` — and no other

#### Scenario: A fixture another module's tests import

- **WHEN** only `bun/<other>.fixture.ts` changed, and a test file of a listed
  `bun/<name>.ts` imports it
- **THEN** the run re-runs `bun/<name>.ts` whole among the modules whose
  tests import it

#### Scenario: A run asked for every module

- **WHEN** the run is started for every listed module
- **THEN** it mutates each module in turn, each incrementally from its stored
  file where one exists, so an interrupted baseline resumes where it stopped
