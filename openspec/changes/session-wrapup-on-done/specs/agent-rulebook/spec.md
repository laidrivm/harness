## ADDED Requirements

### Requirement: The yield ledger is kept outside the tree

The session wrap-up SHALL append its yield entry to
`<state>/harness/pipeline-yield-<yyyy-mm>.md`, `<state>` the directory the
gate ledger is written under, on every branch and every machine, and SHALL
write, commit or read no `docs/context/pipeline-yield-*.md`. The previous
entry it dates its windows from, and the earlier `first review` lines it
skips measured pull requests by, SHALL be read from that ledger alone. The
harness SHALL track no `docs/context/pipeline-yield-*.md`.

#### Scenario: A wrap-up on main

- **WHEN** a wrap-up runs in a clone whose branch is `main`
- **THEN** its yield entry is appended under `<state>/harness/`, and `git
  status` shows no change under `docs/context/`

#### Scenario: A wrap-up on a feature branch

- **WHEN** a wrap-up runs on `feat/foo`, merged or not
- **THEN** its entry goes under `<state>/harness/` as on `main`, and nothing
  is committed for it

#### Scenario: The first entry on a machine

- **WHEN** `<state>/harness/` holds no `pipeline-yield-*.md`
- **THEN** the `gates` line counts every record of the gate ledger and the
  `first review` line starts today, as for the first entry ever, and the
  tree is not read for an earlier entry

#### Scenario: A wrap-up on a detached HEAD

- **WHEN** the checkout has no branch
- **THEN** the entry's heading names the detached commit as `git status`
  prints it, never an empty branch

#### Scenario: No ledger in the harness tree

- **WHEN** the harness's tracked files are listed
- **THEN** none matches `docs/context/pipeline-yield-*.md`
