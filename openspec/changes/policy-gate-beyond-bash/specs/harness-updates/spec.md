# harness-updates — delta spec

## MODIFIED Requirements

### Requirement: Sync writes every value the policy check dictates

The harness's sync command SHALL write into the consumer's tree every value
the harness's policy check compares exactly: the hook registrations, the
`Bash(` entries of the `deny` and `ask` permission lists, the `mcp__` entries
of the `ask` list, the `Edit(.npmrc)` deny and `Edit(bunfig.toml)` ask
entries, and `bunfig.toml`'s `[install]` section. After a sync, the check
SHALL find none of them wrong.

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
