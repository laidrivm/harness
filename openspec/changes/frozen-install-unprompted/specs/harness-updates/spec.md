## ADDED Requirements

### Requirement: Sync writes the deps script

Sync SHALL write the script `"deps": "bun install --frozen-lockfile"` into
the consumer's `package.json` beside the settings it writes, leaving every
other key as it was, and the policy check SHALL fail while the script is
missing or holds other text. A `deps` script the consumer already holds with
other text SHALL make sync refuse, naming that text, with no file written.

#### Scenario: A consumer without the script

- **WHEN** sync runs in a consumer whose `package.json` has no `deps` script,
  or no `scripts` key
- **THEN** `scripts.deps` holds `bun install --frozen-lockfile`, and every
  other key and the file's indentation are unchanged

#### Scenario: A consumer that already holds it

- **WHEN** `scripts.deps` already holds `bun install --frozen-lockfile`
- **THEN** sync leaves `package.json` byte for byte

#### Scenario: A consumer's own deps script

- **WHEN** `scripts.deps` holds other text, such as `pnpm install`
- **THEN** sync exits non-zero naming that text, and neither `package.json`,
  `.claude/settings.json` nor `bunfig.toml` changes

#### Scenario: The check reads the script

- **WHEN** the policy check runs on a consumer whose `scripts.deps` is
  missing or holds other text
- **THEN** it fails naming `package.json` and the expected text

## MODIFIED Requirements

### Requirement: A session names an install that lags the pin

At session start the harness SHALL compare the commit the installed harness
came from with the consumer's pin. When they differ it SHALL print one line
naming both commits and `bun run deps`, and it SHALL never block the session.
This SHALL hold for an installed harness version too old to contain the
comparison itself.

#### Scenario: A stale install is named at session start

- **WHEN** a session starts with an installed harness from a different
  commit than the pin
- **THEN** one line naming the installed commit, the pinned commit and
  `bun run deps` is printed, and the session starts

#### Scenario: An install older than the notice is still named

- **WHEN** the installed harness is a version that predates the notice and
  holds none of the harness's scripts
- **THEN** the same line is printed, because the notice runs from the
  consumer's settings rather than from the package

#### Scenario: A current install says nothing

- **WHEN** a session starts with the installed harness at the pinned
  commit, or with no record bun left of which commit it installed
- **THEN** nothing is printed and the session starts
