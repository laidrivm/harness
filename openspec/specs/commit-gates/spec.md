# commit-gates Specification

## Purpose

What is checked before a commit lands and before a pull request can pass —
the secret scan and the ban on linter and type-checker suppressions. It exists
because both prohibitions were prose the agent could restate and still walk
past: a secret reaches a public repository once, and a suppression that nobody
approved is a silenced finding nobody reads.

## Requirements
### Requirement: A secret scan runs in CI and, when available, before a commit

CI SHALL run `gitleaks` over the branch on every pull request, from a
container image pinned by digest, matching how `actionlint` is already
pinned. The pre-commit hook SHALL run the locally installed `gitleaks` when
one is on `PATH` and SHALL skip silently when none is, so a fresh clone works
without installing it. A finding in CI SHALL fail the check.

#### Scenario: A token reaches a pull request

- **WHEN** a branch carries a file containing a recognisable API token
- **THEN** the CI check fails and names the file and line

#### Scenario: A developer without the binary

- **WHEN** `gitleaks` is not on `PATH` and a commit is made
- **THEN** the pre-commit hook completes without error and without scanning

#### Scenario: The image is not pinned

- **WHEN** the workflow references the image by tag alone
- **THEN** the change is rejected at review — a tag is mutable, and this
  repository pins container actions by digest

### Requirement: Linter and type-checker suppressions fail CI

CI SHALL fail when a tracked **source** file contains `biome-ignore`,
`@ts-expect-error` or `@ts-ignore`. The scanned set SHALL be every tracked
file that is not prose, rather than an enumeration of source extensions: a
linter acts on more of them than one list remembers, and a source type left off
such a list is exempt with nobody deciding it. Prose is exempt because
documentation and OpenSpec artefacts discuss suppressions by name, this
specification among them, and a check that fails on its own proposal is a check
nobody keeps. The check's own script and test SHALL be
outside the scanned set too, for the same reason and no other: they must carry
the three markers literally to do their job. An approved suppression SHALL be
admitted only by naming its exact path, **which marker**, and how many
occurrences of it are approved there, in the check's own allowlist — so the
approval arrives as a reviewable line in the diff rather than as a silent
comment in a source file, a second suppression cannot ride in on the first
one's approval, and swapping an approved `@ts-ignore` for a `biome-ignore` at
the same path is a new approval rather than a free one. An entry SHALL NOT name
the line the suppression sits on: an approval follows the count and not the
occurrence, so deleting an approved suppression and adding another of the same
marker at the same path passes — an accepted ceiling, because the substitution
is two lines of the diff a reviewer reads, while a line number moves with every
unrelated edit above it and would have the allowlist re-approved by someone who
never re-read the reason. The check SHALL read tracked files only, so an
ignored or untracked file cannot fail a clone that does not have it.

#### Scenario: A suppression is added

- **WHEN** a commit adds `// biome-ignore lint/suspicious/noExplicitAny: …`
  to `src/model.ts`
- **THEN** the CI check fails and names the file and line

#### Scenario: An approved suppression

- **WHEN** the same commit also adds `src/model.ts`, `biome-ignore`, count one
  to the check's allowlist
- **THEN** the CI check passes, and the approval is visible in the diff

#### Scenario: An approved suppression swapped for another kind

- **WHEN** that `biome-ignore` is later replaced by an `@ts-ignore` at the same
  path, leaving the allowlist untouched
- **THEN** the CI check fails, because the entry approves one marker and not
  the line it sits on

#### Scenario: The repository as it stands

- **WHEN** the check runs over the current tree
- **THEN** it passes with an empty allowlist, because no tracked source
  carries a suppression today

#### Scenario: A document that discusses suppressions

- **WHEN** a markdown file names `biome-ignore` while explaining this rule
- **THEN** the check passes, because prose is the one thing exempt

#### Scenario: A source type the specification never enumerated

- **WHEN** a tracked `.mjs` file carries a suppression
- **THEN** the check fails, because the exemption is prose and not a list of
  the source extensions somebody thought of

#### Scenario: An allowlisted file gains a second suppression

- **WHEN** a file already on the allowlist gains an unrelated second
  suppression
- **THEN** the check fails — the allowlist admits the approved occurrence, and
  the count is part of what it pins

#### Scenario: A suppression inside a dependency

- **WHEN** `node_modules` or `dist` contains a suppression
- **THEN** the check passes, because it reads tracked files only

### Requirement: The pre-push hook runs the gates named here

The pre-push hook SHALL run, in addition to the type check and `bun test`:
`biome ci`, the YAML syntax check, the suppression scan, and the mutation
floor with the Stryker run that produces its report. A non-zero exit from any
of them SHALL block the push. The diff budget SHALL remain the single
exception, absorbed as `change-slicing` requires, because it measures rather
than judges.

No specification under `openspec/specs/` other than this one SHALL enumerate
what the hook runs. The list was previously spread across four of them, two of
which disagreed, and a gate no single file claims is one a change can break
without contradicting anything. A change's own artefacts and `README.md` may
name individual checks and SHALL link here for the list.

A check whose tool may be absent from a developer's machine — `actionlint` over
`.github/workflows/`, `gitleaks` over the commits the push would add — SHALL be
guarded by
`command -v` and SHALL be skipped silently when the binary is not on `PATH`, so
a fresh clone can push. Absence SHALL NOT fail the hook: CI runs both from
pinned versions, and that is where their verdict is binding. Presence SHALL be
treated like any other gate — a non-zero exit blocks the push, because a
finding a developer can see before pushing is one they should not push past.

The hook SHALL NOT run the browser suite or the coverage report — `smoke-suite`
owns why for both — nor `bun audit`, which queries an advisory database over
the network and would make an offline push fail on a gate about published
vulnerabilities rather than about the branch. CI runs it on a pull request that
touches `package.json`, and nightly.

#### Scenario: A gate that CI would fail blocks the push instead

- **WHEN** a branch is pushed whose surviving-mutant count exceeds the floor
- **THEN** the hook reports the count and the floor and exits non-zero, and the
  push does not happen

#### Scenario: A tool the machine does not have

- **WHEN** `actionlint` is not on `PATH` and a branch is pushed
- **THEN** the hook completes without error and without linting the workflows

The secret scan SHALL be bounded to the checked-out branch's range —
`--log-opts` from the base branch to `HEAD`, resolved as
`scripts/diff-budget.sh` resolves its own base — and SHALL NOT walk the whole
history the way CI does. Two failure modes decide the bound: an unbounded scan
means one secret ever reaching history blocks every push by everyone until a
baseline is written, and a working-tree scan reads the gitignored files that
exist for one author and in no clone.

`HEAD` is the supported push shape, and the hook SHALL NOT be read as covering
more. It does not consume the ref-update records git writes to a pre-push
hook's standard input, so a push of some ref other than the checked-out one
leaves its commits unscanned here. That is the same gap as a machine without
`gitleaks`, and it closes the same way: CI keeps the history-wide scan, where a
failure stops one pull request rather than everybody's pushes, and that is
where the verdict is binding.

#### Scenario: A tool the machine has, reporting a finding

- **WHEN** `gitleaks` is on `PATH` and the branch carries a recognisable API
  token
- **THEN** the hook exits non-zero and the push does not happen

#### Scenario: A secret that is already in the base branch

- **WHEN** `gitleaks` is on `PATH` and a recognisable token sits in a commit
  the branch did not add
- **THEN** the hook does not report it, because the scan is bounded to the
  range the push would send; CI's history-wide scan is what owns that case

#### Scenario: The budget is still soft

- **WHEN** a branch at 950 counted lines is pushed and every other gate passes
- **THEN** the hook prints the `FAIL` gate line and the push proceeds

#### Scenario: The list has one home

- **WHEN** a file under `openspec/specs/` other than this one enumerates what
  the pre-push hook runs
- **THEN** the change is rejected at review — the fragment belongs here, and
  the other specification states only the part it owns
