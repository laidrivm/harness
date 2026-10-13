# agent-permissions — delta spec

## ADDED Requirements

### Requirement: Sending as the user through an MCP tool prompts

`permissions.ask` in the tracked `.claude/settings.json` SHALL carry, with
the server segment a wildcard, an entry for each MCP tool that sends or posts
text under the user's name: `send_message`, `reply`, `forward` and
`notion-create-comment`. That enumeration is the policy; a tool absent from
it does not prompt by this rule. A consumer's check SHALL fail when its
`mcp__` ask entries are not exactly that list, or when any `mcp__` rule
carries parentheses.

#### Scenario: The agent tries to send mail

- **WHEN** the agent calls `mcp__claude_ai_Gmail__send_message`
- **THEN** Claude Code prompts the user, and the mail is sent only if they
  approve that call

#### Scenario: The same tool under another server name

- **WHEN** a machine registers the mail server as `gmail` rather than
  through a claude.ai connector, so the tool is `mcp__gmail__send_message`
- **THEN** the same ask entry prompts for it, because the server segment is a
  wildcard matched against the full tool name

#### Scenario: A user-level allow names an asked tool

- **WHEN** the user's own settings allow `mcp__claude_ai_Gmail__reply`
- **THEN** the call still prompts, because an ask rule is evaluated before
  every allow rule, from any settings source

#### Scenario: A project denies one of the tools outright

- **WHEN** a project's settings also deny `mcp__claude_ai_Gmail__forward`
- **THEN** the call is refused without a prompt and the tool is removed from
  the session's context, because deny is evaluated before ask; the consumer
  check does not object, since it compares the ask entries only

#### Scenario: A mode that never prompts

- **WHEN** the session runs in `dontAsk` mode
- **THEN** a call to one of the four is refused, because that mode denies
  every call that would otherwise prompt

#### Scenario: A mode that skips other prompts

- **WHEN** the session runs in `auto` or `bypassPermissions` mode
- **THEN** a call to one of the four still prompts, because a tool matched by
  an explicit ask rule is among the actions no mode auto-approves

#### Scenario: A board write still works

- **WHEN** the agent updates a card through `notion-update-page`
- **THEN** no entry of this requirement prompts for it, because a page write
  is not speech under the user's name and the task-board workflow requires it

#### Scenario: A draft still works

- **WHEN** the agent calls a mail connector's `create_draft`
- **THEN** no entry of this requirement prompts for it, because a draft sends
  nothing until the user sends it

#### Scenario: An entry is dropped

- **WHEN** `mcp__*__forward` is deleted from a consumer's ask list
- **THEN** the consumer's check fails, naming the list it expected

#### Scenario: An entry is written with parentheses

- **WHEN** an ask entry reads `mcp__*__reply(*)`
- **THEN** the consumer's check fails, because Claude Code skips an `mcp__`
  rule with parentheses when it loads settings, so the entry would prompt for
  nothing while reading as a boundary
