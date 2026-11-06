# mutation-floor Specification

## Purpose

What the floor check counts and forbids, and what the harness mutates. The
check counts the mutants a Stryker report says survived and fails when that
count moves from the floor the repository declares, in either direction, or
when the floor states no reason — in the harness and in every repository
that installs it and runs the check. The harness mutates each module
`stryker.config.json`'s `mutate` lists, alone, against the tests under
`bun/<name>`, and stores each module's results in the tree. It exists
because a test that asserts a value and one that merely executes the line
cover the same lines, so coverage cannot tell them apart and a surviving
mutant can.

## Requirements

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

The run SHALL give the sandbox Stryker mutates in a git repository of its own,
holding one commit of the sandbox's files,
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
or is no longer listed, or one holding results for any source but its own
module, SHALL fail the run before it mutates anything, naming it: the count
would include code nothing judges, or count a module twice. A listed module with a test
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

#### Scenario: A stored file holding results of another module

- **WHEN** `mutation/<name>.json` holds results for a source other than
  `bun/<name>.ts`
- **THEN** the run fails naming `mutation/<name>.json` and that source

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
