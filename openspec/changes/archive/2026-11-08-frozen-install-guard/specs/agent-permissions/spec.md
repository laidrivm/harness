## MODIFIED Requirements

### Requirement: A frozen install runs through the deps script

The project's `package.json` SHALL carry the script `deps` with exactly the
text `bun install --frozen-lockfile`, and an agent SHALL run a frozen install
as `bun run deps`; an install that must rewrite the lockfile, or one from a
`package.json` with uncommitted edits, stays a prompted `bun install`. The
`ask` entries of *Every manifest-mutating invocation prompts, whatever else
allows it* SHALL stay as they are, so every literal `bun install` or `bun i`
the command guard lets through still prompts. The command guard SHALL block a
`bun install` or `bun i` carrying `--frozen-lockfile` among its words in the
line the agent typed, wherever it stands there — a compound line, a shell's
`-c` program or an `eval` included — and SHALL NOT block one it reads from a
committed script's text, which the `ask` entries never match. The reason SHALL
name `bun run deps`; a plain `bun install`, which prompts, for a re-pin, a
`package.json` with uncommitted edits and a `bun.lock` that lacks the pin;
and that a frozen install with other flags, such as `--ignore-scripts`, or of
a package with no `deps` script, is the user's to run, since `bun run deps`
runs the root lifecycle scripts of the package that holds it. The
block is a redirection rather than a boundary: a frozen install the guard
does not read as one is left to the `ask` entry, which prompts. A blocked
call shows no prompt only because Claude Code's hooks reference runs a
`PreToolUse` hook before the permission flow; that order is Claude Code's,
observed rather than tested here. The install is
pinned only by the `bun.lock` on disk, which nothing compares with `HEAD`. The
install SHALL run the root lifecycle scripts the committed manifest names
(`preinstall`, `postinstall`, `prepare`), with no `--ignore-scripts`: a
manifest edit is left unchecked by the user's answer 1 а of 2026-11-05. The
command guard SHALL judge `bun run deps` as it judges any `bun run`: by the
script's text, from a committed `package.json`; and it SHALL block a
`bun run deps` whose command holds any word but those three — after the
script's name, since bun forwards those words to the install, or before
`bun`, such as an `xargs` or an assignment. The guard reads the typed
command, not the environment it runs in, so a variable an earlier `export`
set reaches the install unread.

#### Scenario: The script runs without a prompt

- **WHEN** the agent attempts `bun run deps` in a checkout whose committed
  `package.json` holds the script, and whose `predeps` and `postdeps`, where
  present, pass the guard as typed lines, with `Bash(bun run *)` allowed
- **THEN** the hook does not block it and no `ask` entry prompts, because an
  `ask` rule matches the command's text, not a script's body

#### Scenario: A typed frozen install is refused

- **WHEN** the agent attempts `bun install --frozen-lockfile`,
  `bun i --frozen-lockfile`, `bun install --frozen-lockfile --ignore-scripts`
  or `bun install --frozen-lockfile 2>&1`
- **THEN** the hook blocks the call, and the reason names `bun run deps`; a
  plain `bun install` for a re-pin, a `package.json` with uncommitted edits
  and a `bun.lock` that lacks the pin; and other flags, or a package with no
  `deps` script, as the user's to run

#### Scenario: A frozen install within a compound line

- **WHEN** the agent attempts `cd sub && bun install --frozen-lockfile`,
  `bun install --frozen-lockfile | tail -5` or
  `bash -c "bun i --frozen-lockfile"`
- **THEN** the hook blocks the call, with the same reason

#### Scenario: A frozen install inside a committed script

- **WHEN** the agent attempts `bun run deps`, or `bun run setup` where the
  committed `package.json` holds
  `"setup": "bun install --frozen-lockfile && bun run build"` and a `build`
  script
- **THEN** the hook does not block either, because the install is the
  script's text, not the typed line

#### Scenario: A literal install still prompts

- **WHEN** the agent attempts `bun install`, `bun i` or
  `bun install lodash`
- **THEN** the hook does not block it, and Claude Code prompts, as before
  this change, because a matching `ask` rule prompts even when a hook returns
  `"allow"`

#### Scenario: The flag only as text

- **WHEN** the agent attempts `echo bun install --frozen-lockfile` or
  `git commit -m "bun install --frozen-lockfile"`
- **THEN** the hook does not block it for a frozen install, because no
  command there is bun

#### Scenario: Words after the script's name

- **WHEN** the agent attempts `bun run deps --no-verify`,
  `bun run deps --production`, `bun run deps lodash`,
  `bun run deps $(printf -- --no-verify)` or
  `bun run $(printf deps) --no-verify` — any `bun run` a substitution feeds,
  since the parse drops its output from the words
- **THEN** the hook blocks the call, and the reason names `bun run deps` with
  nothing before or after it

#### Scenario: Words before bun

- **WHEN** the agent attempts `echo --no-verify | xargs bun run deps` or
  `BUN_OPTIONS=--no-verify bun run deps`
- **THEN** the hook blocks the call, and the reason names `bun run deps` with
  nothing before or after it

#### Scenario: A script the tree does not vouch for

- **WHEN** the agent attempts `bun run deps` while `package.json` carries an
  uncommitted or staged edit
- **THEN** the guard refuses the call, as it refuses any `bun run` script
  whose `package.json` is not committed
