## ADDED Requirements

### Requirement: Every claude the runner starts as the session user runs ponytail at ultra

On every container start, before it starts the persistent session, the
runner's entrypoint SHALL write the session user's ponytail config file with
`defaultMode` `ultra`, as the session user. The launcher a pass's session
runs under SHALL give `claude` the session user's home and no
`XDG_CONFIG_HOME`, so the pass reads the same file. Nothing the harness ships
to a laptop or a consumer SHALL set ponytail's level.

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

#### Scenario: A pass's session reads the same file

- **WHEN** the launcher runs a command with `HOME` and `XDG_CONFIG_HOME` set
  to the runner's values
- **THEN** the command sees `HOME=/home/agent` and no `XDG_CONFIG_HOME`

#### Scenario: The laptop's level is untouched

- **WHEN** the harness's tracked settings file and the files sync writes are
  read
- **THEN** none sets `PONYTAIL_DEFAULT_MODE` or names ponytail's config file
