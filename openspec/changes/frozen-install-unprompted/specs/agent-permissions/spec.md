## ADDED Requirements

### Requirement: A frozen install runs through the deps script

The project's `package.json` SHALL carry the script `deps` with exactly the
text `bun install --frozen-lockfile`, and an agent SHALL install with
`bun run deps`. The `ask` entries of *Every manifest-mutating invocation
prompts, whatever else allows it* SHALL stay as they are, so every literal
`bun install` or `bun i` still prompts. The command guard SHALL judge
`bun run deps` as it judges any `bun run`: by the script's text, from a
committed `package.json`; and it SHALL block `bun run deps` with any word
after it, since bun forwards those words to the install.

#### Scenario: The script runs without a prompt

- **WHEN** the agent attempts `bun run deps` in a checkout whose committed
  `package.json` holds the script, with `Bash(bun run *)` allowed
- **THEN** the hook does not block it and no `ask` entry prompts, because an
  `ask` rule matches the command's text, not a script's body

#### Scenario: A literal install still prompts

- **WHEN** the agent attempts `bun install --frozen-lockfile`, `bun install`
  or `bun install lodash`
- **THEN** Claude Code prompts, as before this change, because a matching
  `ask` rule prompts even when a hook returns `"allow"`

#### Scenario: Words after the script's name

- **WHEN** the agent attempts `bun run deps --no-verify`,
  `bun run deps --production` or `bun run deps lodash`
- **THEN** the hook blocks the call, and the reason names `bun run deps` with
  nothing after it

#### Scenario: A script the tree does not vouch for

- **WHEN** the agent attempts `bun run deps` while `package.json` carries an
  uncommitted or staged edit
- **THEN** the guard refuses the call, as it refuses any `bun run` script
  whose `package.json` is not committed
