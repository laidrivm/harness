## ADDED Requirements

### Requirement: The yield ledger is kept outside the tree

The session wrap-up SHALL append its yield entry to
`<state>/harness/pipeline-yield-<yyyy-mm>.md`, `<state>` the directory the
gate ledger is written under, on every branch, and SHALL change no file of
the tree for it. The previous entry it dates its windows from, and the
earlier `first review` lines it skips measured pull requests by, SHALL be
read from that ledger, or from `docs/context/pipeline-yield-*.md` while that
ledger holds no entry yet.

#### Scenario: A wrap-up on main

- **WHEN** a wrap-up runs in a clone whose branch is `main`
- **THEN** its yield entry is appended under `<state>/harness/`, and `git
  status` shows no change under `docs/context/pipeline-yield-*`

#### Scenario: A wrap-up on a feature branch

- **WHEN** a wrap-up runs on `feat/foo`, merged or not
- **THEN** its entry goes under `<state>/harness/` as on `main`, and nothing
  is committed for it

#### Scenario: The first entry on a machine

- **WHEN** `<state>/harness/` holds no `pipeline-yield-*.md` and the tree's
  `docs/context/` holds entries
- **THEN** `<gates-since>` and `<since>` are dated from the latest of those
  entries, and the new entry is written under `<state>/harness/`

#### Scenario: A wrap-up on a detached HEAD

- **WHEN** the checkout has no branch
- **THEN** the entry's heading names the detached commit as `git status`
  prints it, never an empty branch
