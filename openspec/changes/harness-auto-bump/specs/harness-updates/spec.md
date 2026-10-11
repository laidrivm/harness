# harness-updates — delta spec

## Purpose

How a consumer adopts a new harness commit: what writes the files a pin move
changes, when a bump is attempted and lands with nobody acting, what must
pass first, and how a session learns that its install lags the pin.

## ADDED Requirements

### Requirement: Sync writes every value the policy check dictates

The harness's sync command SHALL write into the consumer's tree every value
the harness's policy check compares exactly: the hook registrations, the
`Bash(` entries of the `deny` and `ask` permission lists, the `Edit(.npmrc)`
deny and `Edit(bunfig.toml)` ask entries, and `bunfig.toml`'s `[install]`
section. After a sync, the check SHALL find none of them wrong.

#### Scenario: A harness change to its policy needs no manual edit

- **WHEN** a consumer's settings carry the previous harness version's hook
  commands, permission entries and `[install]` values, and the consumer runs
  the sync command of a harness version that changed all three
- **THEN** the harness's check passes on the consumer's tree with no other
  edit, and the previous version's hooks are gone rather than duplicated

### Requirement: Sync leaves the consumer's own settings as it found them

The sync command SHALL change nothing the policy check does not dictate by
value: the allow list, hooks whose commands do not reach the harness package,
permission entries that are not `Bash(`, other settings keys and other TOML
tables. When it cannot show that its `bunfig.toml` edit preserved the rest
of the file, it SHALL write neither file and fail.

#### Scenario: The project's own settings survive a sync

- **WHEN** a consumer's settings carry a project hook, an allow list, an
  `mcp__` ask entry, a project `Edit(...)` deny entry, an unknown top-level
  key and a `bunfig.toml` with other tables
- **THEN** after a sync each of them parses to the value it had before

#### Scenario: An install section the rewrite would damage is left untouched

- **WHEN** a consumer's `bunfig.toml` is laid out so that replacing its
  `[install]` section's lines would change another table's parsed value or
  leave `[install]` not equal to the harness's values
- **THEN** the sync fails naming `bunfig.toml`, and neither
  `bunfig.toml` nor the settings file has changed

### Requirement: A bump attempts only the harness's newest green commit

A consumer's bump SHALL target the head of the harness's `main` branch, and
only once that commit's harness test run has succeeded. When the head is not
yet green, or equals the consumer's pin, the bump SHALL exit successfully
having changed nothing and SHALL NOT proceed to land.

#### Scenario: A quiet day changes nothing

- **WHEN** a bump runs while the harness's head either has no successful
  test run or is the commit the consumer already pins
- **THEN** it exits 0, the consumer's tree is unchanged, and it reports no
  target to land

### Requirement: A bump lands only what passed the consumer's checks

A bump SHALL move the pin and lockfile, run the sync command, then the
harness's check and the consumer's configured `bumpTest` command, all from
the new harness version and without a token that can write to the
repository. When any of them fails, nothing SHALL be pushed. A missing
`bumpTest` key SHALL fail the bump, naming the key.

#### Scenario: A bump that fails the consumer's checks does not land

- **WHEN** the moved pin makes the harness's check or the consumer's
  `bumpTest` command fail
- **THEN** the bump exits non-zero, reports no target to land, and the
  consumer's `main` does not move

#### Scenario: A bump that passes reports what it checked

- **WHEN** the moved pin passes the sync, the check and `bumpTest`
- **THEN** the bump reports the target commit and an identifier of the exact
  tree it checked, and has pushed nothing

### Requirement: Landing pushes exactly the tree that was checked

Landing SHALL redo the bump's edit from a fresh checkout of the same `main`
without running any of the consumer's dependencies' code, and SHALL commit
and push to `main` only when the result is the tree the checks reported. It
Its install SHALL run no lifecycle script, so no consumer git hook is installed
to run at the push.

#### Scenario: A checked bump lands on main

- **WHEN** landing reproduces the reported tree for the reported target
- **THEN** the consumer's `main` gains one commit whose subject names the
  old and new harness commits, changing only the pin, the lockfile, the
  rules copy and what sync writes

#### Scenario: A tree that differs from the checked one is not pushed

- **WHEN** landing's reproduced tree differs from the reported one
- **THEN** landing exits non-zero and the consumer's `main` does not move

### Requirement: A session names an install that lags the pin

At session start the harness SHALL compare the commit the installed harness
came from with the consumer's pin. When they differ it SHALL print one line
naming both commits and `bun install`, and it SHALL never block the session.
This SHALL hold for an installed harness version too old to contain the
comparison itself.

#### Scenario: A stale install is named at session start

- **WHEN** a session starts with an installed harness from a different
  commit than the pin
- **THEN** one line naming the installed commit, the pinned commit and
  `bun install` is printed, and the session starts

#### Scenario: An install older than the notice is still named

- **WHEN** the installed harness is a version that predates the notice and
  holds none of the harness's scripts
- **THEN** the same line is printed, because the notice runs from the
  consumer's settings rather than from the package

#### Scenario: A current install says nothing

- **WHEN** a session starts with the installed harness at the pinned
  commit, or with no record bun left of which commit it installed
- **THEN** nothing is printed and the session starts
