# cloud-sessions delta

## Purpose

What a Claude Code cloud session or routine does so that the harness runs in
it as it runs locally: the install at session start, which no permission
prompt can stop, and the setup script that gives the VM the bun CI runs.

## ADDED Requirements

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
through the Bash bootstrap nor through `permissions.ask`, and neither SHALL
change: the bootstrap lets only the install through before the harness is
installed, and `agent-permissions`' *Every manifest-mutating invocation
prompts, whatever else allows it* still prompts for a `bun install` the
agent runs.

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

- **WHEN** the agent runs `bun install` itself in any session
- **THEN** it prompts as before, and before the harness is installed the
  bootstrap lets through only `bun install` or `bun i`, bare or with
  `--frozen-lockfile`, as before

### Requirement: The cloud environment's setup script installs CI's bun

The README SHALL hold the setup script a cloud environment for this
repository runs, and the script SHALL install bun at one exact version. That
version SHALL equal the `bun-version` every tracked workflow and the README's
bump workflow name, and the README SHALL say beside the script that nothing
updates the version but a hand edit of every site. The harness's test run
SHALL fail when any of those sites names another version.

#### Scenario: Every site agrees

- **WHEN** the setup script installs `bun@1.4.2` and every `bun-version`
  line in `.github/workflows/` and in the README reads `1.4.2`
- **THEN** the test passes

#### Scenario: A bump misses a site

- **WHEN** one workflow's `bun-version` reads a version the setup script
  does not
- **THEN** the test fails, naming that file and both versions

#### Scenario: A site the test cannot find

- **WHEN** the README holds no setup script line installing bun at an exact
  version, or no tracked workflow names a `bun-version`
- **THEN** the test fails, naming what it did not find, rather than passing
  over nothing
