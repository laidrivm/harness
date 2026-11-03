## ADDED Requirements

### Requirement: The yield ledger stays out of a checkout that cannot commit it

When the checkout is on `main` or a detached `HEAD` — where the command guard
refuses a commit — the session wrap-up SHALL append its yield entry to
`<state>/harness/pipeline-yield-<yyyy-mm>.md`, `<state>` the directory the
gate ledger is written under, and SHALL change no file of the tree for it. On
any other branch it SHALL append to `docs/context/pipeline-yield-<yyyy-mm>.md`
as before. The previous entry it reads dates from, and the earlier `first
review` lines it skips measured pull requests by, SHALL be in the ledger it
appends to.

#### Scenario: A wrap-up on main

- **WHEN** a wrap-up runs in a clone whose branch is `main`
- **THEN** its yield entry is appended under `<state>/harness/`, and `git
  status` shows no change under `docs/context/pipeline-yield-*`

#### Scenario: A wrap-up on a detached HEAD

- **WHEN** `git branch --show-current` prints nothing
- **THEN** the entry goes under `<state>/harness/` as on `main`

#### Scenario: A wrap-up on a feature branch

- **WHEN** a wrap-up runs on `feat/foo`
- **THEN** its entry is appended to `docs/context/pipeline-yield-<yyyy-mm>.md`
  in the tree, to be committed to that branch

#### Scenario: The previous entry on a host

- **WHEN** a wrap-up on `main` reads the date of the previous entry holding a
  `gates` line
- **THEN** it reads it from `<state>/harness/pipeline-yield-*.md`, never from
  `docs/context/`
