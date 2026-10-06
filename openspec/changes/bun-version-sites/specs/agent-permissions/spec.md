# agent-permissions — delta spec

## MODIFIED Requirements

### Requirement: Every manifest-mutating invocation prompts

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

Unlike `deny`, an `ask` entry does not override a grant from another source: a
broader `allow` pattern in `.claude/settings.local.json` or a user-level
settings file suppresses the prompt. This repository cannot test that, because
the local file is gitignored, so the requirement holds only where no broader
grant exists.

#### Scenario: A broader local allow entry suppresses the prompt

- **WHEN** `.claude/settings.local.json` carries `Bash(bun *)` under
  `permissions.allow`
- **AND** the agent attempts `bun add preact`
- **THEN** Claude Code does not prompt, and no test in this repository detects
  it

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
- **THEN** Claude Code prompts, because `CLAUDE.md` reserves that decision for
  the user

#### Scenario: A read-only sibling is not captured

- **WHEN** the agent attempts `bun pm untrusted` or `bun pm why preact`
- **THEN** Claude Code does not prompt, because surfacing that output is how
  the user reaches the `trustedDependencies` decision

#### Scenario: Settings carry no unreachable ask rule

- **WHEN** `.claude/settings.json` is read
- **THEN** no string under `permissions.ask` names `npx`, `npm`, `pnpm` or
  `yarn`
