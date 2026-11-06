## ADDED Requirements

### Requirement: Every claude the runner starts as the session user reads ponytail's level as ultra

On every container start, before it starts the persistent session, the
runner's entrypoint SHALL write the session user's ponytail config file with
`defaultMode` `ultra`, as the session user. A failed write SHALL NOT stop the
entrypoint. The launcher a pass's session
runs under SHALL give `claude` the session user's home and no
`XDG_CONFIG_HOME`, so the pass reads the same file. Nothing the harness ships
to a laptop or a consumer SHALL set ponytail's level. This requirement sets
the level, not the plugin's presence: only the persistent session installs
ponytail (the next requirement), and a pass whose clone does not load that
install runs without ponytail (design.md, D5).

#### Scenario: The level is written before the session starts

- **WHEN** the entrypoint is read
- **THEN** the line writing `$HOME/.config/ponytail/config.json` runs before
  the line starting tmux session `main`, and after the `authorized_keys`
  lines

#### Scenario: The written file names ultra

- **WHEN** that line's command runs with a temporary `HOME` holding no
  `.config`
- **THEN** `$HOME/.config/ponytail/config.json` parses to an object whose
  `defaultMode` is `ultra`, and a second run leaves the same file

#### Scenario: The write runs as the session user

- **WHEN** the entrypoint is read
- **THEN** the line writing the config file starts with `runuser -u agent --`,
  so a symlink planted in the session user's volume cannot turn it into a
  root write

#### Scenario: A failed write leaves the runner starting

- **WHEN** the config file cannot be written, because the session user's
  volume holds a file where its directory belongs or a directory it cannot
  write
- **THEN** the entrypoint prints a line naming ponytail's level and goes on
  to start the session and sshd

#### Scenario: A pass's session reads the same file

- **WHEN** the launcher runs a command with `HOME` and `XDG_CONFIG_HOME` set
  to the runner's values
- **THEN** the command sees `HOME=/home/agent` and no `XDG_CONFIG_HOME`

#### Scenario: The laptop's level is untouched

- **WHEN** the harness's tracked settings file and the files sync writes are
  read
- **THEN** none sets `PONYTAIL_DEFAULT_MODE` or names ponytail's config file

### Requirement: The persistent session installs ponytail before each start

In each round that finds the session's clone, the start script SHALL run
`claude plugin install ponytail@ponytail --scope project` in the clone, after
`bun install --frozen-lockfile` and before `claude`, with Claude Code's
auto-updater off and under a time limit. A failed or timed-out install SHALL
print a line naming ponytail's
install and SHALL NOT stop `claude` from starting. Where the clone does not
exist, the script SHALL NOT run the install.

#### Scenario: Ponytail is installed before each start

- **WHEN** the start script runs a round in the session's clone, under `sh`
  or `dash`
- **THEN** it runs `claude plugin install ponytail@ponytail --scope project`
  in the clone, under `timeout`, with `DISABLE_AUTOUPDATER=1`, after the
  dependency install and before `claude` starts

#### Scenario: A failed plugin install leaves the session starting

- **WHEN** `claude plugin install` exits non-zero, offline or before the
  clone is trusted, or outruns its time limit
- **THEN** the pane shows a line naming ponytail's install, and `claude`
  starts all the same

#### Scenario: No plugin install without the clone

- **WHEN** the session's clone does not exist
- **THEN** the script does not run `claude plugin install`
