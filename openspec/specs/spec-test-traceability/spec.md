# spec-test-traceability Specification

## Purpose

How a test names the acceptance criterion it closes, and what stops the number
of criteria nothing asserts from growing. It exists because `openspec/config.yaml`
binds every criterion to a task, and a ticked task is not an assertion: a
criterion could reach the archive with nothing executing it and nothing in the
repository able to tell that state from the other. Recovering the join after
the fact by matching names was measured and scores about a coin flip, so the
join is written down where it is made.

## Requirements

### Requirement: A criterion is identified by its capability and its heading

A criterion's identifier SHALL be derived, never stored: `<capability>/<slug>`,
where the capability is the directory name under `openspec/specs/` and the slug
is the `#### Scenario:` heading lowercased with every run of non-alphanumeric
characters replaced by a single hyphen and leading and trailing hyphens
removed. Nothing SHALL be written into a spec file to carry an identifier,
because a check whose adoption costs 380 edits is a check nobody adopts.

Three headings repeat under different requirements within one capability, so a
slug SHALL NOT be assumed unique. An identifier matching more than one
criterion SHALL be an error only when a test cites it — the rename is then paid
for by whoever first needs the citation, and until then both criteria simply
count as uncited.

Two sets are read, and they are deliberately different. Criteria are **counted**
from `openspec/specs/*/spec.md` only, so a criterion enters the count when its
change is archived — counting a change's own criteria earlier would fail the
proposal, which by design ships before any test exists. Citations are
**validated** against those plus every active change's delta specs
(`openspec/changes/*/specs/*/spec.md`), so a test written during apply may cite
the criterion it is being written for. At archive the criterion becomes counted
and cited in one move, leaving the count where it was.

#### Scenario: An identifier is derived from a heading

- **WHEN** `openspec/specs/draft-session/spec.md` carries
  `#### Scenario: Board is not an active context`
- **THEN** the criterion's identifier is
  `draft-session/board-is-not-an-active-context`

#### Scenario: An ambiguous identifier is cited

- **WHEN** a test cites `local-review-loop/a-skipped-minor`, which two
  requirements in that capability both carry
- **THEN** the check fails, naming both requirement headings, so the author
  renames one rather than guessing which was meant

#### Scenario: An ambiguous identifier nobody cites

- **WHEN** the same two criteria exist and no test cites either
- **THEN** the check passes and both count as uncited

#### Scenario: A criterion still in flight

- **WHEN** a change under `openspec/changes/` adds a criterion in its delta
  spec
- **THEN** the count is unchanged, and a test may already cite it

#### Scenario: A change is archived with its tests already written

- **WHEN** a change adding four criteria, each cited by a test written during
  apply, is archived
- **THEN** the count of uncited criteria is unchanged, so no floor edit is
  needed

### Requirement: A test cites the criteria it closes

A test SHALL cite a criterion in a `// spec:` comment placed directly above a
`test`, `it` or `describe` call, separated from it by nothing but blank lines
and further comment lines. A member form of those three SHALL be accepted as
well — `test.each`, `test.skip`, `describe.each` — because `docs/testing.md`
counts a `test.each` row as a test, and a scanner that recognised only `test(`
would call a citation above one unmatched. One comment SHALL carry any number of identifiers,
whitespace-separated or one per continuation line, because a single act may
satisfy several criteria; and several tests SHALL be free to cite one
criterion, because `docs/testing.md` requires one arrange and one act per test
and so expands a criterion into several of them. A criterion counts as cited
once, however many tests cite it.

A citation matching no criterion in either set SHALL fail the check, naming the
citation and its file. This is what catches a criterion renamed or deleted out from under
the test that closed it — the identifier is derived from the heading, so
rewording a heading is what breaks the link, and breaking it loudly is the
point.

The scanned set SHALL be every tracked test file outside `node_modules`,
whichever runner owns it — a name carrying `.test.`, `.spec.`, `_test.` or
`_spec.` before a JavaScript or TypeScript extension. Those four forms are
Bun's own, so a `_test.ts` file the runner executes cannot hide from the
scanner.

The set SHALL NOT be narrowed by any runner's configuration. `bunfig.toml`'s
`pathIgnorePatterns` hands `e2e/**` to Playwright, and an end-to-end test
closes a criterion exactly as a unit test does; honouring that ignore list
would make every criterion only e2e can reach permanently uncitable, which is
the opposite of what this capability is for.

#### Scenario: A test cites one criterion

- **WHEN** `// spec: draft-board/hero-missing-from-the-palette` sits directly
  above a `test(` call
- **THEN** that criterion counts as cited

#### Scenario: One act closes several criteria

- **WHEN** a single comment names three identifiers above one test
- **THEN** all three count as cited

#### Scenario: One criterion needs several tests

- **WHEN** five tests each cite `commit-gates/a-suppression-is-added`
- **THEN** it counts as cited once, and the count of uncited criteria falls by
  one

#### Scenario: A citation floating in a file

- **WHEN** a `// spec:` comment is followed by anything other than a `test`,
  `it` or `describe` call
- **THEN** the check fails, so a block of citations cannot claim coverage no
  test performs

#### Scenario: A criterion renamed under its test

- **WHEN** a scenario heading is reworded and the test citing its old slug is
  left alone
- **THEN** the check fails, naming the citation and its file

### Requirement: The count of uncited criteria may not rise silently

The check SHALL compare the number of uncited criteria against a floor constant
declared in the check itself, and SHALL fail when the count is above it. The
floor SHALL also be failed when the count is *below* it, reporting the value to
write instead, so the number tracks reality rather than drifting into a
meaningless upper bound.

The floor's line SHALL carry a trailing comment holding at least one
non-whitespace character after the marker, and the check SHALL fail when it does
not — `const FLOOR = 380; //` states no reason and SHALL NOT pass. That is the whole exemption mechanism: a criterion no runtime can
assert — 88 of the 382 are discharged by a person, not a process — is
admitted by raising the floor with a reason a reviewer reads, rather than by a
register of its own listing them one by one.

The check SHALL ship as `scripts/spec-coverage.test.ts`. CI already runs `bun
test`, so no workflow changes and the gate is blocking from the first commit.

#### Scenario: The repository as it stands

- **WHEN** the check runs over the tree with the floor holding the measurement
  its line's reason describes
- **THEN** it passes

#### Scenario: A criterion added without a test

- **WHEN** an archived change adds a criterion nothing cites
- **THEN** the check fails, reporting the count and the floor

#### Scenario: A criterion admitted as untestable

- **WHEN** the same commit raises the floor by one and writes the reason on
  that line
- **THEN** the check passes, and the exemption is a sentence in the diff

#### Scenario: The floor changed with no reason given

- **WHEN** the floor's line carries no trailing comment, or one whose text is
  empty or whitespace
- **THEN** the check fails, whichever direction the number moved

#### Scenario: A criterion newly covered

- **WHEN** a test is added citing a criterion that had none, leaving the count
  below the floor
- **THEN** the check fails and names the lower value to write, so the gain is
  recorded rather than absorbed
