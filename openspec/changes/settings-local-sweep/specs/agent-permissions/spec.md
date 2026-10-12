# agent-permissions — delta spec

## ADDED Requirements

### Requirement: The untracked settings file is swept against the tracked policy

A command run from a repository's root SHALL sort each `permissions.allow`
entry of `.claude/settings.local.json` against that repository's tracked
`.claude/settings.json`, in Claude Code's order: deny, then ask, then allow. It
SHALL fail while an entry remains that the tracked file already decides or
that is not machine-local by *The tracked allow list holds only what a clone
can use*, naming each, and SHALL write neither file.

#### Scenario: An entry the tracked file already decides

- **WHEN** the local file allows `Bash(bun install:*)` and the tracked file
  asks for `Bash(bun install *)`
- **THEN** the sweep names the entry as decided by that ask entry and exits
  non-zero — ask is evaluated before allow, so the grant does nothing

#### Scenario: A gap in the tracked policy

- **WHEN** the local file allows `Bash(git push *)` and no tracked entry
  matches it
- **THEN** the sweep names it as a gap, to be promoted to the tracked file or
  dropped, and exits non-zero

#### Scenario: Nothing left to promote or drop

- **WHEN** the local file is absent, or holds only an entry naming
  `//Users/<someone>/…`
- **THEN** the sweep exits 0, listing the machine-local entry as kept
- **AND** neither file has changed
