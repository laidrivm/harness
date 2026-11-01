## MODIFIED Requirements

### Requirement: The count of surviving mutants may not rise silently

A check SHALL read a report in Stryker's JSON schema at `reports/mutation/mutation.json`,
resolved from the repository root, count the mutants that survived, and
compare that count against the floor declared as
`harness.mutationFloor.surviving` in the `package.json` of the repository it
runs in, failing and naming that field when it is not a whole number. A mutant counts as surviving when its status is `Survived` or
`NoCoverage`: `Killed`, `Timeout`, `Ignored`, `CompileError` and
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
