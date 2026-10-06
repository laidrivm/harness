# spec-test-traceability — delta spec

## MODIFIED Requirements

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

#### Scenario: A citation below an escaped quote

- **WHEN** a test file holds a line whose string literal contains an escaped
  quote followed by `/*` — `const s = "he said \"/*\"";` — and a `// spec:`
  citation on a later line
- **THEN** the citation counts, because the scan carries the string's state
  through the escape rather than ending the literal at it
