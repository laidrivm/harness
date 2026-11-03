## ADDED Requirements

### Requirement: The tracked settings enable the harness's plugins

The tracked `.claude/settings.json` SHALL set `enabledPlugins` to `true` for
`ponytail@ponytail` and `cc-plugin-you-should-know@builtin`. A consumer's
check SHALL fail, naming the plugin, when either is absent or not `true`.
Other entries under `enabledPlugins` are the consumer's own, and the check
SHALL not report them. The harness's own settings file SHALL carry the same
two entries, pinned by a test.

#### Scenario: A consumer without the plugins

- **WHEN** a consumer's settings carry no `enabledPlugins` key, or one
  without `cc-plugin-you-should-know@builtin`
- **THEN** its check names each missing plugin

#### Scenario: A plugin turned off in the tracked file

- **WHEN** a consumer's tracked settings set `ponytail@ponytail` to `false`
- **THEN** its check names `ponytail@ponytail`, because the local file is
  where one person turns a plugin off

#### Scenario: A consumer's own plugin beside the harness's

- **WHEN** a consumer's `enabledPlugins` also sets `some-tool@acme` to
  `true` or `false`
- **THEN** its check reports nothing about `enabledPlugins`

#### Scenario: The harness's own plugins

- **WHEN** this repository's `.claude/settings.json` is read
- **THEN** both plugins are enabled in it

### Requirement: The ponytail marketplace is pinned by tag

The tracked `.claude/settings.json` SHALL set
`extraKnownMarketplaces.ponytail` to exactly the harness's entry: the GitHub
source `DietrichGebert/ponytail` at the harness's tag, with `autoUpdate`
`false`. A consumer's check SHALL fail when the entry differs in any field.
Other marketplaces are the consumer's own. The note beside the value SHALL
say what moves the pin. The harness's own settings file SHALL carry the same
entry, pinned by a test.

#### Scenario: A marketplace entry that follows the author's default branch

- **WHEN** a consumer's `ponytail` entry carries no `ref`, or another tag
- **THEN** its check names `extraKnownMarketplaces.ponytail`

#### Scenario: A marketplace entry that updates itself

- **WHEN** a consumer's `ponytail` entry sets `autoUpdate` to `true`, or
  omits it
- **THEN** its check names `extraKnownMarketplaces.ponytail`: an update
  would carry the author's next commit past the pin, and an omitted value
  leaves the pin resting on a default Claude Code can change

#### Scenario: A consumer's own marketplace beside the harness's

- **WHEN** a consumer's `extraKnownMarketplaces` also registers `acme-tools`
- **THEN** its check reports nothing about `extraKnownMarketplaces`

#### Scenario: The pin without its note

- **WHEN** the line before the tag in the harness's source names no tool
  that moves it and does not say that nothing does
- **THEN** the suite fails, naming the line

#### Scenario: The harness's own marketplace entry

- **WHEN** this repository's `.claude/settings.json` is read
- **THEN** its `extraKnownMarketplaces.ponytail` equals the entry the check
  compares
