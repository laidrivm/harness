# harness-updates — delta spec

## MODIFIED Requirements

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
