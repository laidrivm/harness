# harness-updates Specification

## Purpose

How a consumer adopts a new harness commit: what writes the files a pin move
changes, when a bump is attempted and lands with nobody acting, what must
pass first, and how a session learns that its install lags the pin.

## Requirements

### Requirement: Sync writes every value the policy check dictates

The harness's sync command SHALL write into the consumer's tree every value
the harness's policy check compares exactly: the hook registrations, the
`Bash(` entries of the `deny` and `ask` permission lists, the `mcp__` entries
of the `ask` list, the `Edit(.npmrc)` deny and `Edit(bunfig.toml)` ask
entries, the `attribution` setting, and `bunfig.toml`'s `[install]` section.
After a sync, the check SHALL find none of them wrong.

#### Scenario: A harness change to its policy needs no manual edit

- **WHEN** a consumer's settings carry the previous harness version's hook
  commands, permission entries and `[install]` values, and the consumer runs
  the sync command of a harness version that changed all three
- **THEN** the harness's check passes on the consumer's tree with no other
  edit, and the previous version's hooks are gone rather than duplicated

#### Scenario: A consumer adopts the MCP ask entries through the sync

- **WHEN** a consumer's `ask` list carries no `mcp__` entry, or carries
  `mcp__` entries the harness does not list, and the consumer runs the sync
  command
- **THEN** its `mcp__` ask entries are exactly the harness's, in the
  harness's order, and the check finds no permission list wrong

#### Scenario: A consumer adopts the attribution setting through the sync

- **WHEN** a consumer's settings carry no `attribution` key, or one that also
  sets `commit`, and the consumer runs the sync command
- **THEN** its `attribution` is exactly the harness's, and the check reports
  nothing about it

### Requirement: Sync leaves the consumer's own settings as it found them

The sync command SHALL change nothing the policy check does not dictate by
value: the allow list, hooks the harness did not write (including ones that
call its scripts), permission entries that are neither `Bash(` nor `mcp__`
ask entries, other settings keys and other TOML tables. When it cannot show
that its `bunfig.toml` edit preserved the rest of the file, it SHALL write
neither file and fail.

#### Scenario: The project's own settings survive a sync

- **WHEN** a consumer's settings carry a project hook, a project hook that
  runs a harness script by its `node_modules/harness/` path, an allow list
  holding an `mcp__` entry, an `mcp__` deny entry, a project `Edit(...)` deny
  entry, an unknown top-level key and a `bunfig.toml` with other tables
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

Landing SHALL redo the bump's edit from a fresh checkout of the same `main`,
running the harness's own code but none of the consumer's other dependencies,
and SHALL commit and push to `main` only when the result is the tree the
checks reported. Its install SHALL run no lifecycle script, so no consumer git
hook is installed to run at the push.

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

### Requirement: The harness's own sessions run its gates from its pin

The harness's own tracked `.claude/settings.json` SHALL register every hook
the harness gives a consumer, with the text it gives the consumer, and SHALL
register no hook that runs a script from the harness's working tree. Its
sessions SHALL therefore run the gates from the harness's own pinned install,
a commit merged to `main`, so that an edit to a gate's source changes no
gate holding the session that made it. The pin SHALL be a development
dependency, so that a consumer installing the harness installs no second copy
of it. The stale-install notice SHALL read a pin held as a development
dependency when no runtime dependency names one, and SHALL prefer the runtime
dependency when both do.

The harness's test run SHALL fail when its settings lack one of those
registrations or carry a hook that runs a working-tree script.

#### Scenario: A gate edited in the working tree does not hold the session

- **WHEN** the harness is installed at its pin and a session's working tree
  replaces `bun/command-guard.ts` with a script that allows everything
- **THEN** a `git commit` on `main` is still refused by the registered hook,
  because the hook runs the pinned copy

#### Scenario: A registration is missing from the harness's settings

- **WHEN** the harness's settings lack the command of one hook the harness
  gives consumers, under that hook's event and matcher
- **THEN** the harness's test run fails, naming the hook

#### Scenario: A hook runs a working-tree script

- **WHEN** any hook in the harness's settings runs a script under
  `$CLAUDE_PROJECT_DIR/bun/`
- **THEN** the harness's test run fails, naming the hook

#### Scenario: A consumer installs one copy of the harness

- **WHEN** a consumer installs the harness from git at a commit whose
  manifest pins the harness as a development dependency
- **THEN** one package is installed, and the consumer's tree holds no nested
  copy of the harness

#### Scenario: The notice reads a development-dependency pin

- **WHEN** a session starts in a project whose only pin is a development
  dependency, with the harness installed from a different commit
- **THEN** the notice prints the line naming both commits and `bun install`

#### Scenario: A runtime pin is preferred

- **WHEN** a project pins the harness both as a runtime and as a development
  dependency, at different commits
- **THEN** the notice compares the install with the runtime pin

### Requirement: A hook the harness keeps to itself reaches no consumer

A gate hook the harness registers for its own sessions only SHALL be
registered in its tracked `.claude/settings.json` and nowhere a sync writes
from, so that a consumer's sync never gains it and a sync of the harness's own
settings keeps it. It SHALL run the harness's pinned copy, as every other hook
there does. Consumers take such a hook only through a change that adds it to
what the sync writes.

#### Scenario: A consumer syncs

- **WHEN** a consumer runs the sync command of a harness version that records
  skill calls in its own sessions
- **THEN** the consumer's settings gain no hook for the `Skill` tool or for
  `UserPromptExpansion`

#### Scenario: The harness's own settings are synced

- **WHEN** the sync command runs over the harness's own tracked settings
- **THEN** the skill-call hook's registrations are still there, unchanged

#### Scenario: The skill-call hook's registration

- **WHEN** the harness's test run reads its tracked settings
- **THEN** it finds the skill-call hook under `PostToolUse` with the matcher
  `Skill` and under `UserPromptExpansion` with no matcher, each a command
  hook run in the foreground with no `if`, running the pinned copy
