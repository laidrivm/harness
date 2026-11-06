## MODIFIED Requirements

### Requirement: A cloud session installs the harness as it starts

The `SessionStart` hook the harness registers SHALL, when the environment
variable `CLAUDE_CODE_REMOTE` is exactly `true`, install the project's
dependencies from its lockfile in the project's directory —
`$CLAUDE_PROJECT_DIR`, or the current directory where that is unset — before
it runs the stale-install notice that `harness-updates`' *A session names an
install that lags the pin* fixes. The install SHALL refuse to change
`package.json` or the lockfile and SHALL run no lifecycle script. A
successful install SHALL print nothing. A failed one SHALL print one line
naming the failure and bun's last line of output, and SHALL NOT stop the
session. With the variable unset or holding any other value, the hook SHALL
install nothing.

The install is a hook's command and no tool call, so it SHALL pass neither
through the Bash bootstrap nor through the command guard. While the installed
package holds no command guard — before the harness is installed, or with an
install too old to hold one — the bootstrap SHALL let through only `bun
install --frozen-lockfile` or `bun i --frozen-lockfile`, character for
character once surrounding whitespace is trimmed, and block every other
command, a bare `bun install` among them; once the guard is there,
`agent-permissions`' *An install runs only in its frozen form* decides a
`bun install` the agent runs.

#### Scenario: A cloud session starts on a fresh clone

- **WHEN** a session starts with `CLAUDE_CODE_REMOTE=true` in a clone with no
  `node_modules/`
- **THEN** the hook installs from the lockfile with no prompt, prints
  nothing, and `node_modules/harness/` holds the pinned commit when the hook
  exits

#### Scenario: A local session

- **WHEN** a session starts with `CLAUDE_CODE_REMOTE` unset, empty, `false`
  or `1`
- **THEN** the hook installs nothing and prints only what the notice prints

#### Scenario: The install fails

- **WHEN** the cloud install fails, as when the proxy answers 403 for a
  tarball
- **THEN** one line names the failed install and bun's last line, the notice
  then says the harness is not installed, and the session starts

#### Scenario: The notice never races the install

- **WHEN** the cloud install succeeds
- **THEN** the notice runs after it in the same command and prints nothing,
  never that the harness is not installed

#### Scenario: A lockfile that disagrees with the manifest

- **WHEN** `package.json` names a dependency the lockfile does not hold
- **THEN** the install fails as above, and neither file changes

#### Scenario: No package code runs unprompted

- **WHEN** a dependency or the project itself declares a lifecycle script
- **THEN** the cloud install runs none of them

#### Scenario: The local policy is unchanged

- **WHEN** the agent runs `bun install` itself in a cloud session
- **THEN** it is decided exactly as in a local session — the cloud install
  changes no part of the local policy — so the guard refuses it and names
  `bun install --frozen-lockfile`

#### Scenario: The agent's own install before the harness is installed

- **WHEN** the harness is not installed and the agent runs
  `bun install --frozen-lockfile` or `bun i --frozen-lockfile`
- **THEN** the bootstrap lets it through
- **AND WHEN** the agent runs `bun install`, `bun i`, `bun install lodash` or
  `git status`
- **THEN** the bootstrap blocks the call, and the reason names
  `bun install --frozen-lockfile`
