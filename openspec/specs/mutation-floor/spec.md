# mutation-floor Specification

## Purpose

What is mutated in this repository, what kills a mutant, and what the floor
forbids. It exists because `src/model.ts` is at
100% line and function coverage from its own tests, so coverage can no longer
tell a test that asserts a value from one that merely executes a line — and the
model is the one place here where a wrong sign or a wrong boundary yields a
plausible number instead of a crash.

## Requirements

### Requirement: The count of surviving mutants may not rise silently

A check SHALL read Stryker's JSON report, count the mutants that survived, and
compare that count against a floor constant declared in the check itself. A
mutant counts as surviving when its status is `Survived` or `NoCoverage`:
`Killed`, `Timeout`, `Ignored`, `CompileError` and `RuntimeError` all mean
something other than "the tests let this through", and `NoCoverage` means no
test ran against it at all. `NoCoverage` should not arise under the command
runner, which performs no coverage analysis, and is counted rather than
excluded precisely because its appearance would mean the setup is not what this
requirement assumes.

Stryker's own `thresholds.break` SHALL stay `null`: it compares a
mutation-score percentage whose denominator moves with every edit to
`src/model.ts`, so the same set of survivors yields a different score after an
unrelated refactor and no one can write a reason about it.

`stryker.config.json` SHALL list `json` among its `reporters`. The default is
`clear-text`, `progress` and `html`, and `jsonReporter.fileName` names a path
without enabling the reporter that writes it — a configuration setting only the
filename produces no report, and the check then fails on an absent file at
every run.

The check SHALL run no tool. Whoever invokes it runs Stryker first — the CI job
runs the two as separate commands — so a Stryker that crashed is a non-zero
exit the shell already surfaces, and the check never has to tell its own
verdict apart from the tool's failure. For the same reason the invoker, not the
check, SHALL delete the previous report before the run: a reader cannot tell a
stale file from a fresh one, and an absent report already fails.

A mutant whose status appears in neither list above SHALL fail the check,
naming the status. Counting the known survivors and ignoring the rest would
silently under-count if Stryker ever reports a not-killed mutant under a name this
check predates.

The check SHALL fail when the count is above the floor, reporting both numbers.
It SHALL also fail when the count is *below* the floor, naming the value to
write, so a gain is recorded rather than absorbed into slack.

The floor's line SHALL carry a trailing comment holding at least one
non-whitespace character after the marker, and the check SHALL fail when it
does not — `const FLOOR = 12; //` states no reason and SHALL NOT pass. The
comment is required whichever direction the number moved, because establishing
the direction would mean reading the previous value out of git history for a
guarantee the diff already gives.

#### Scenario: The repository as it stands

- **WHEN** the check runs over the current tree with the floor set to the first
  measurement and its reason on that line
- **THEN** it passes

#### Scenario: A branch added without a test

- **WHEN** a line is added to `src/model.ts` whose mutant no test under
  `src/model` kills
- **THEN** the check fails, reporting the survivor count and the floor

#### Scenario: A survivor newly killed

- **WHEN** a test is added that kills a mutant which previously survived,
  leaving the count below the floor
- **THEN** the check fails and names the lower value to write

#### Scenario: The floor changed with no reason given

- **WHEN** the floor's line carries no trailing comment, or one whose text is
  empty or whitespace
- **THEN** the check fails, whichever direction the number moved
