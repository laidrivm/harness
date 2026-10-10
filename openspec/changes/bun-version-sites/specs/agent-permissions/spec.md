# agent-permissions — delta spec

## REMOVED Requirements

### Requirement: Every manifest-mutating invocation prompts

**Reason**: Its scenario *A broader local allow entry suppresses the prompt*
states the opposite of Claude Code's documented precedence, where an `ask`
rule prompts whatever `allow` also matches. OpenSpec refuses to drop a
scenario from a modified requirement, so the corrected text is added whole
under a new name instead.
**Migration**: Read *Every manifest-mutating invocation prompts, whatever else
allows it*, which carries every other scenario unchanged.

## ADDED Requirements

### Requirement: Every manifest-mutating invocation prompts, whatever else allows it

`permissions.ask` in `.claude/settings.json` SHALL cover every invocation form
that changes the project's dependency record — `package.json` or the lockfile.
That is bun's install family, `bun add`, `bun install` and `bun remove`;
`bun update`, `bun patch` and its undocumented equivalent `bun patch-commit`;
and the `bun pm` subcommands that edit `package.json` directly — `pkg`,
`version` and `trust`. It SHALL also cover each alias `bun` documents for any
of them, not for the install family alone: `bun update` gained `bun up` in
1.4.2 and the surface a check reads is the installed binary's, so an alias
arrives with a release rather than with a decision. It SHALL carry no entry
naming a denied package manager, because an `ask` rule for a denied command
can never be reached, and no entry broad enough to capture a read-only command
— save `bun pm pkg get`, which the single `bun pm pkg` entry prompts for by
design. Claude Code matches a permission pattern against the literal command
string, so an alias is a separate entry and not a variant of one.

An `ask` entry prompts even where an `allow` pattern from any settings source
also matches the call, however broad. Claude Code evaluates deny, then ask,
then allow, across every scope, so a grant in `.claude/settings.local.json` or
a user-level settings file does not suppress the prompt.

#### Scenario: A broader local allow entry does not suppress the prompt

- **WHEN** `.claude/settings.local.json` carries `Bash(bun *)` under
  `permissions.allow`
- **AND** the agent attempts `bun add preact`
- **THEN** Claude Code still prompts, because the `ask` entry is evaluated
  before any `allow`

#### Scenario: Adding a dependency

- **WHEN** the agent attempts `bun add preact`
- **THEN** Claude Code prompts the user for approval

#### Scenario: The same command through its alias

- **WHEN** the agent attempts `bun a preact`, `bun i`, or any of `bun rm`,
  `bun r` and `bun uninstall`
- **THEN** Claude Code prompts, because each alias carries its own `ask` entry

#### Scenario: An alias outside the install family

- **WHEN** the installed `bun update --help` documents the alias `bun up`
- **THEN** `permissions.ask` carries `Bash(bun up *)`, because the clause
  reaches every gated command rather than the install family alone

#### Scenario: Removing a dependency

- **WHEN** the agent attempts `bun remove preact`
- **THEN** Claude Code prompts, because removal writes `package.json` and the
  lockfile

#### Scenario: A subcommand that edits the manifest directly

- **WHEN** the agent attempts `bun pm pkg set sideEffects=false`,
  `bun pm version patch`, `bun update --latest` or `bun patch --commit`
- **THEN** Claude Code prompts, because each rewrites `package.json` without
  going through the install family

#### Scenario: trustedDependencies is never granted silently

- **WHEN** the agent attempts `bun pm trust some-package`
- **THEN** Claude Code prompts, because `core/code-style.md` reserves that
  decision for the user

#### Scenario: A read-only sibling is not captured

- **WHEN** the agent attempts `bun pm untrusted` or `bun pm why preact`
- **THEN** Claude Code does not prompt, because surfacing that output is how
  the user reaches the `trustedDependencies` decision

#### Scenario: Settings carry no unreachable ask rule

- **WHEN** `.claude/settings.json` is read
- **THEN** no string under `permissions.ask` names `npx`, `npm`, `pnpm` or
  `yarn`
