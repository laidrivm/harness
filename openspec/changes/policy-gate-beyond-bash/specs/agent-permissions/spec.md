# agent-permissions — delta spec

## ADDED Requirements

### Requirement: Sending as the user through an MCP tool is denied

`permissions.deny` in the tracked `.claude/settings.json` SHALL carry, with
the server segment a wildcard, an entry for each MCP tool that sends or posts
text under the user's name: `send_message`, `reply`, `forward` and
`notion-create-comment`. That enumeration is the policy; a tool absent from
it is not denied. A consumer's check SHALL fail when its `mcp__` deny entries
are not exactly that list, or when any `mcp__` rule carries parentheses.

#### Scenario: The agent tries to send mail

- **WHEN** a session holds `mcp__claude_ai_Gmail__send_message`
- **THEN** Claude Code refuses the call, and the tool is absent from the
  session's context, because a bare-name deny rule removes the tool it matches

#### Scenario: The same tool under another server name

- **WHEN** a machine registers the mail server as `gmail` rather than
  through a claude.ai connector, so the tool is `mcp__gmail__send_message`
- **THEN** the same deny entry refuses it, because the server segment is a
  wildcard

#### Scenario: A board write still works

- **WHEN** the agent updates a card through `notion-update-page`
- **THEN** no entry of this requirement refuses it, because a page write is
  not speech under the user's name and the task-board workflow requires it

#### Scenario: A draft still works

- **WHEN** the agent calls a mail connector's `create_draft`
- **THEN** no entry of this requirement refuses it, because a draft sends
  nothing until the user sends it

#### Scenario: A user-level allow names a denied tool

- **WHEN** the user's own settings allow `mcp__claude_ai_Gmail__reply`
- **THEN** the call is still refused, because a deny rule in any source is
  evaluated before every allow rule

#### Scenario: An entry is dropped

- **WHEN** `mcp__*__forward` is deleted from a consumer's deny list
- **THEN** the consumer's check fails, naming the list it expected

#### Scenario: An entry is written with parentheses

- **WHEN** a deny entry reads `mcp__*__reply(*)`
- **THEN** the consumer's check fails, because Claude Code skips an `mcp__`
  rule with parentheses when it loads settings, so the entry would deny
  nothing while reading as a boundary
