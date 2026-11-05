## RENAMED Requirements

- FROM: `### Requirement: Every manifest-mutating invocation prompts, whatever else allows it`
- TO: `### Requirement: Every manifest-mutating invocation prompts or is refused, whatever else allows it`

## MODIFIED Requirements

### Requirement: Every manifest-mutating invocation prompts or is refused, whatever else allows it

`permissions.ask` in `.claude/settings.json` SHALL cover every invocation form
that changes the project's dependency record — `package.json` or the lockfile
— outside bun's install command, which *An install runs only in its frozen
form* refuses instead. That is `bun add` and `bun remove`;
`bun update`, `bun patch` and its undocumented equivalent `bun patch-commit`;
and the `bun pm` subcommands that edit `package.json` directly — `pkg`,
`version` and `trust`. It SHALL also cover each alias `bun` documents for any
of them: `bun update` gained `bun up` in
1.4.2 and the surface a check reads is the installed binary's, so an alias
arrives with a release rather than with a decision. It SHALL carry no entry
naming a denied package manager, because an `ask` rule for a denied command
can never be reached, no entry naming `bun install` or `bun i`, since the
frozen form those carry runs unprompted, and no entry broad enough to capture
a read-only command
— save `bun pm pkg get`, which the single `bun pm pkg` entry prompts for by
design. Claude Code matches a permission pattern against the literal command
string, so an alias is a separate entry and not a variant of one.

An `ask` entry prompts even where an `allow` pattern from any settings source
also matches the call, however broad. Claude Code evaluates deny, then ask,
then allow, across every scope, so a grant in `.claude/settings.local.json` or
a user-level settings file does not suppress the prompt. In `dontAsk` mode,
which refuses every call that would prompt, the same entry refuses the call
instead.

#### Scenario: A broader local allow entry does not suppress the prompt

- **WHEN** the session is not in `dontAsk` mode, and
  `.claude/settings.local.json` carries `Bash(bun *)` under
  `permissions.allow`
- **AND** the agent attempts `bun add preact`
- **THEN** Claude Code still prompts, because the `ask` entry is evaluated
  before any `allow`

#### Scenario: Adding a dependency

- **WHEN** the agent attempts `bun add preact`
- **THEN** Claude Code prompts the user for approval

#### Scenario: The same command through its alias

- **WHEN** the agent attempts `bun a preact`, or any of `bun rm`, `bun r` and
  `bun uninstall`
- **THEN** Claude Code prompts, because each alias carries its own `ask` entry

#### Scenario: An alias outside the install family

- **WHEN** the installed `bun update --help` documents the alias `bun up`
- **THEN** `permissions.ask` carries `Bash(bun up *)`, because the clause
  reaches every gated command rather than the install family alone

#### Scenario: The install command carries no ask entry

- **WHEN** `.claude/settings.json` is read
- **THEN** no string under `permissions.ask` names `bun install` or `bun i`,
  and `Bash(bun add *)` and `Bash(bun remove *)` are still there

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

### Requirement: The untracked settings file is swept against the tracked policy

A command run from a repository's root SHALL sort each `permissions.allow`
entry of `.claude/settings.local.json` against that repository's tracked
`.claude/settings.json`, in Claude Code's order: deny, then ask, then allow. It
SHALL fail while an entry remains that the tracked file already decides or
that is not machine-local by *The tracked allow list holds only what a clone
can use*, naming each, and SHALL write neither file.

#### Scenario: An entry the tracked file already decides

- **WHEN** the local file allows `Bash(bun add:*)` and the tracked file
  asks for `Bash(bun add *)`
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

## ADDED Requirements

### Requirement: An install runs only in its frozen form

The guard SHALL block every `bun install` or `bun i` except exactly
`bun install --frozen-lockfile` or `bun i --frozen-lockfile` — `bun` the
command's first word, then the subcommand, that one flag and nothing else —
run where the nearest `package.json` and the `bun.lock` beside it are tracked
and unchanged against `HEAD` in every directory the line may run in. The
reason SHALL name the frozen form and ask that any other install be run by
the user in their own terminal.

#### Scenario: The frozen form runs without a prompt

- **WHEN** the agent attempts `bun install --frozen-lockfile` or
  `bun i --frozen-lockfile` in a checkout whose `package.json` and `bun.lock`
  are committed and unedited
- **THEN** the hook does not block it, and no `ask` entry prompts for it

#### Scenario: The frozen form however it is quoted, spaced or reached

- **WHEN** the agent attempts `bun  i --frozen-lockfile`,
  `bun "install" --frozen-lockfile` or `~/.bun/bin/bun i --frozen-lockfile`
- **THEN** the hook does not block it, because the shell runs the same bun
  with the same words

#### Scenario: Something before bun

- **WHEN** the agent attempts `timeout 600 bun install --frozen-lockfile`,
  `env -C /tmp/x bun i --frozen-lockfile`,
  `echo --config=x.toml | xargs bun i --frozen-lockfile` or
  `>package.json bun install --frozen-lockfile`
- **THEN** the hook blocks the call, because a word before `bun` can move the
  install, add to its words or rewrite the manifest

#### Scenario: A manifest the tree does not vouch for

- **WHEN** the agent attempts `bun install --frozen-lockfile` where
  `package.json` or `bun.lock` carries an uncommitted or staged edit, is
  untracked, or is missing, or attempts
  `cd /tmp/x && bun install --frozen-lockfile` outside any repository
- **THEN** the hook blocks the call, because the install would run what no
  reviewer read: dependencies the agent wrote in, and the root package's
  lifecycle scripts

#### Scenario: A bare install

- **WHEN** the agent attempts `bun install` or `bun i`
- **THEN** the hook blocks the call, and the reason names
  `bun install --frozen-lockfile` and the user's own terminal

#### Scenario: An install that names a package

- **WHEN** the agent attempts `bun install lodash` or `bun i foo`
- **THEN** the hook blocks the call

#### Scenario: Another word beside the flag

- **WHEN** the agent attempts `bun install --frozen-lockfile --production`,
  `bun install --frozen-lockfile=false` or
  `bun install --frozen-lockfile > package.json`
- **THEN** the hook blocks the call, because the command is not exactly the
  frozen form

#### Scenario: An option before the subcommand

- **WHEN** the agent attempts `bun --cwd ../x install --frozen-lockfile`
- **THEN** the hook blocks the call

#### Scenario: A variable assigned before bun

- **WHEN** the agent attempts `CI=1 bun install --frozen-lockfile`,
  `BUN_CONFIG_SKIP_LOAD_LOCKFILE=1 bun install --frozen-lockfile`,
  `BUN_CONFIG_SKIP_LOAD_LOCKFILE+=1 bun install --frozen-lockfile` or
  `env BUN_CONFIG_REGISTRY=https://x.test bun i --frozen-lockfile`
- **THEN** the hook blocks the call, because a variable bun reads can make
  the install resolve what the lockfile does not hold

#### Scenario: An appending assignment is not the command

- **WHEN** the agent attempts `X+=1 bun install`
- **THEN** the hook blocks the call, because bash and zsh run the command
  after an appending assignment as they do after `X=1`, so `bun` is the
  command and not `X+=1`

#### Scenario: Each command of a compound line is judged alone

- **WHEN** the agent attempts `bun install --frozen-lockfile && bun test`
- **THEN** the hook does not block it
- **AND WHEN** the agent attempts `bun install --frozen-lockfile; bun install`
  or `bash -c "bun install"`
- **THEN** the hook blocks the call

#### Scenario: A local allow entry does not reopen the bare install

- **WHEN** `.claude/settings.local.json` allows `Bash(bun install *)` and the
  agent attempts `bun install`
- **THEN** the hook still blocks the call, because exit 2 blocks whatever a
  permission entry allows

#### Scenario: Another package command is not refused by this check

- **WHEN** the agent attempts `bun add preact`, `bun run install` or
  `bun pm ls`
- **THEN** this check does not block it, and `bun add preact` prompts as
  before
