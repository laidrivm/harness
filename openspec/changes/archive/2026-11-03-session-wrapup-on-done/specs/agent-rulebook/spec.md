## ADDED Requirements

### Requirement: The yield ledger is kept outside the tree

The session wrap-up SHALL append its yield entry to
`~/.local/state/harness/pipeline-yield/<repo>/<yyyy-mm>.md`, `<repo>` the
`<owner>/<name>` that `origin`'s URL ends in, or `local/<basename>` of the
repository's top-level directory where there is no `origin`, on every branch
and every machine, and
SHALL write, commit or read no `docs/context/pipeline-yield-*.md`. The
previous entry it dates its windows from, and the earlier `first review`
lines it skips measured pull requests by, SHALL be read from
`<repo>`'s files there alone. The harness SHALL track no
`docs/context/pipeline-yield-*.md`.

#### Scenario: A wrap-up on main

- **WHEN** a wrap-up runs in a clone whose branch is `main`
- **THEN** its yield entry is appended under
  `~/.local/state/harness/pipeline-yield/`, and `git status` shows no change
  under `docs/context/pipeline-yield-*`

#### Scenario: A wrap-up on a feature branch

- **WHEN** a wrap-up runs on `feat/foo`, merged or not
- **THEN** its entry goes where it goes on `main`, and nothing is committed
  for it

#### Scenario: Two repositories on one machine

- **WHEN** a wrap-up in `mellon` follows one in `harness` on the same machine
- **THEN** it appends to `laidrivm/mellon/<yyyy-mm>.md`, and dates its windows
  and skips measured pull requests by `mellon`'s entries alone, as a
  `mellon` of another owner would keep its own directory

#### Scenario: The first entry on a machine

- **WHEN** the directory holds no file of `<repo>`
- **THEN** the `gates` line counts every gate-ledger record of this project
  and its subdirectories, and the `first review` line starts today, as for
  the first entry ever, and the tree is not read for an earlier entry

#### Scenario: A wrap-up on a detached HEAD

- **WHEN** the checkout has no branch
- **THEN** the entry's heading names the detached commit as `git status`
  prints it, never an empty branch

#### Scenario: No ledger in the harness tree

- **WHEN** the harness's tracked files are listed
- **THEN** none matches `docs/context/pipeline-yield-*.md`
