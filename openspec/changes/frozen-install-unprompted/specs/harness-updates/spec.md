## MODIFIED Requirements

### Requirement: A session names an install that lags the pin

At session start the harness SHALL compare the commit the installed harness
came from with the consumer's pin. When they differ it SHALL print one line
naming both commits and `bun install --frozen-lockfile`, the install the agent
may run, and it SHALL never block the session. When no harness is installed it
SHALL name the same command. This SHALL hold for an installed harness version
too old to contain the comparison itself.

#### Scenario: A stale install is named at session start

- **WHEN** a session starts with an installed harness from a different
  commit than the pin
- **THEN** one line naming the installed commit, the pinned commit and
  `bun install --frozen-lockfile` is printed, and the session starts

#### Scenario: An install older than the notice is still named

- **WHEN** the installed harness is a version that predates the notice and
  holds none of the harness's scripts
- **THEN** the same line is printed, because the notice runs from the
  consumer's settings rather than from the package

#### Scenario: A current install says nothing

- **WHEN** a session starts with the installed harness at the pinned
  commit, or with no record bun left of which commit it installed
- **THEN** nothing is printed and the session starts

#### Scenario: No harness installed

- **WHEN** a session starts in a project with no `node_modules/harness/`
- **THEN** one line says the harness is not installed and names
  `bun install --frozen-lockfile`, and the session starts
