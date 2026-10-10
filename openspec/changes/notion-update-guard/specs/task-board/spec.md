# task-board — delta spec

## ADDED Requirements

### Requirement: A card write that would lose its properties is refused

A `PreToolUse` hook SHALL refuse a call to the Notion page-update tool, under
any server name, that carries a non-empty `properties` with a command other
than `update_properties`. It SHALL exit 2 and name the split on stderr. It
SHALL let every other call through, and SHALL let a call through when it
cannot read the event. The tracked settings of the harness and of each
consumer SHALL carry its registration verbatim, and the check SHALL fail one
that does not.

#### Scenario: Properties beside a content edit

- **WHEN** a session calls the update tool with command `update_content` and
  `properties` setting `Status`
- **THEN** the call is refused with exit 2, and the reason says to send the
  properties in their own `update_properties` call

#### Scenario: Properties on their own

- **WHEN** a session calls the update tool with command `update_properties`
  and `properties`
- **THEN** the call goes through

#### Scenario: A content edit alone

- **WHEN** a session calls the update tool with command `update_content` and
  no `properties`, or an empty one
- **THEN** the call goes through

#### Scenario: Another server name

- **WHEN** the same tool reaches the session as `mcp__notion__notion-update-page`
  rather than `mcp__claude_ai_Notion__notion-update-page`
- **THEN** the hook runs for it and decides the same way

#### Scenario: An event the hook cannot read

- **WHEN** the event is not JSON, or carries no `tool_input`
- **THEN** the call goes through

#### Scenario: A consumer without the registration

- **WHEN** a consumer's tracked `.claude/settings.json` lacks the hook's
  registration, or carries it with a different command or matcher
- **THEN** `harness:check` fails, naming the registration
