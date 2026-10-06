# mutation-floor Specification

## Purpose

What is mutated in this repository, what kills a mutant, how a survivor is
admitted, and what the floor forbids. It exists because `src/model.ts` is at
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

### Requirement: An equivalent mutant is admitted at the line it occupies

A mutant that cannot be killed because it does not change behaviour SHALL be
admitted with a `// Stryker disable next-line <Mutator>[,<Mutator>…]: <reason>`
comment on the line above it, naming the mutators concerned and giving a
reason. Stryker then reports the mutant as `Ignored`, the reason travels into
the report, and both sit in the diff beside the code they excuse. This SHALL be
the exemption mechanism the project uses: there is no register of exempt
mutants.

That form SHALL be the only one the check accepts in `src/model.ts`, and it
SHALL fail on every other, naming the line. Specifically: a comment naming
`all` rather than mutators, because `all` would also silence a mutant added to
that line later which no one has judged; a comment without `next-line`, whose
scope runs to the end of the file or to a matching `// Stryker restore`; and a
comment carrying no reason, or none after its colon. A comma-separated list of
named mutators is accepted — a single line can carry two mutants that are both
equivalent for the same reason.

The check SHALL read the same comments Stryker does — a `/* … */` comment as
well as a `//` one, and either anywhere on the line rather than only leading it
— because Stryker matches its directive against every comment the parser hands
it. It SHALL nonetheless accept only the `//` spelling, so a block-comment
directive fails however well it is formed: Stryker honours both, and one
spelling in `src/model.ts` is what stops an exemption from hiding inside a
comment that does not look like one.

Stryker offers exemptions this requirement does not cover — `// Stryker
restore`, and an ignore-plugin declared in `ignorers`. Neither is used, and
neither is checked for: an ignore-plugin is a new file and a new dependency,
and a `restore` without a matching `disable` changes nothing — and the paired
`disable` that would give it meaning is itself rejected, since it cannot carry
`next-line`.

`mutator.excludedMutations` in `stryker.config.json` would achieve the same
exemption with no trace at the line it affects, and it is not taken. It is not
checked for either: a fifteen-line configuration file is read whole by whoever
reviews a change to it, where a disable comment hides in 296 lines of
arithmetic. The scan exists for the one that hides.

#### Scenario: An equivalent mutant is marked

- **WHEN** a surviving mutant is judged equivalent and a
  `// Stryker disable next-line <Mutator>: <reason>` comment is added above its
  line
- **THEN** its status becomes `Ignored`, the survivor count falls by one, and
  the floor is lowered to match

#### Scenario: A well-formed directive in a block comment

- **WHEN** a comment in `src/model.ts` reads
  `/* Stryker disable next-line ArithmeticOperator: <reason> */`
- **THEN** the check fails, because the accepted form is the `//` spelling,
  even though Stryker honours this one

#### Scenario: A blanket disable comment

- **WHEN** a comment in `src/model.ts` reads `// Stryker disable next-line all`
- **THEN** the check fails, because the mutator is not named

#### Scenario: An exemption with no reason

- **WHEN** a disable comment names a mutator but the text after the colon is
  absent, empty or whitespace
- **THEN** the check fails
