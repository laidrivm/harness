## MODIFIED Requirements

### Requirement: The connector's Status write is refused in the harness

In the harness's own sessions a `PreToolUse` hook on the connector's
`notion-update-page` and `notion-create-pages`, under any server name, SHALL
refuse a `notion-update-page` call whose `properties` carry `Status`,
whatever its command, and a `notion-create-pages` call in which any page's
`properties` carry `Status` with a value other than `"idea"`, whatever its
parent, naming `bun bun/work.ts status`, and record it. A page with no
`Status` or a `null` one SHALL pass. Every other call, and an event it cannot
read, SHALL pass. It SHALL be registered in the harness's
`.claude/settings.json` alone.

#### Scenario: A status set through the connector

- **WHEN** a session calls `notion-update-page` with `update_properties` and
  `properties` holding `Status`
- **THEN** the call is refused, naming `bun bun/work.ts status`

#### Scenario: Assign alone

- **WHEN** the call's `properties` hold `Assign` and no `Status`
- **THEN** the hook lets it through

#### Scenario: A card created past idea

- **WHEN** a session calls `notion-create-pages` with two pages, the first at
  `Status` `idea` and the second at `approved`
- **THEN** the call is refused, naming the second page, `idea` and `bun
  bun/work.ts status`, and nothing is created

#### Scenario: A card created at idea or with no status

- **WHEN** a session calls `notion-create-pages` with pages whose `Status` is
  `idea`, `null` or absent, under a data source or a page parent
- **THEN** the hook lets it through

#### Scenario: An event it cannot read

- **WHEN** the event is not JSON
- **THEN** the hook lets the call through

#### Scenario: A consumer's settings

- **WHEN** `sync` writes a consumer's `.claude/settings.json`
- **THEN** the status hook is not among the hooks it writes, and a sync of
  the harness's own settings keeps it
