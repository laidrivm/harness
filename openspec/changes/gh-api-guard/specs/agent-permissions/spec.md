# agent-permissions — delta spec

## MODIFIED Requirements

### Requirement: GitHub write commands are denied

`permissions.deny` in `.claude/settings.json` SHALL carry entries for the
GitHub CLI commands that publish text on the user's behalf: `gh pr comment`,
`gh issue comment` and `gh pr review`, each with a trailing-space wildcard.
`gh pr create` SHALL NOT be denied: opening the pull request is the last step
of the feature workflow, offered by the agent and taken only after the user
says go. The prose rule *Never post to a PR, issue, or any external service on
the user's behalf* SHALL be narrowed to name what it forbids — replying,
commenting and reviewing — so that it no longer reads as covering the PR the
user asked for.

A deny entry matches the command word literally, so `/opt/homebrew/bin/gh pr
comment` reaches none of them. The deny entries are therefore the cheap first
pass and not the boundary: the same three writes SHALL also be blocked by the
guard below, which resolves the command to its base name and so sees the
wrapped spellings. The two are not a rule stated twice — the guard is a
superset, and a deny entry can only ever be redundant, never wrong.

Those three are subcommand names, and `gh api` addresses the same endpoints
while naming no subcommand at all. The guard SHALL therefore also block a
`gh api` invocation that cannot be shown to be a read, and SHALL NOT block one
that can. A read is a call whose `--method` or `-X` names `GET` or `HEAD`,
whatever parameters it carries, or one naming no method and carrying no
parameter flag — `-f`, `-F`, `--field`, `--raw-field` or `--input` — since
`gh api` sends `GET` by default and switches to `POST` as soon as a parameter
is added. A `graphql` operand SHALL be blocked whichever operation it carries:
telling a query from a mutation means parsing an argument's contents, and the
guard resolves uncertainty towards blocking.

This SHALL NOT become a deny entry. A permission pattern matches a prefix, so
it can name `gh api` whole or nothing narrower, and naming it whole would take
the reads with it — the `coderabbit` skill reads a pull request's inline
comments, issue comments and reviews through exactly this command.

#### Scenario: The agent tries to reply to a review

- **WHEN** the agent attempts `gh pr comment 37 --body "fixed"`
- **THEN** Claude Code blocks the call without prompting

#### Scenario: A denied command hidden in a compound command

- **WHEN** the agent attempts `git push && gh pr review 37 --approve`
- **THEN** Claude Code blocks the call, because each subcommand is matched
  independently

#### Scenario: Opening a pull request still works

- **WHEN** the agent attempts `gh pr create --title … --body …`
- **THEN** the call is not blocked by these rules

#### Scenario: Reading a pull request still works

- **WHEN** the agent attempts `gh pr view 37 --json state`
- **THEN** the call is not blocked, because the deny list names write commands
  only

#### Scenario: A comment posted through the endpoint

- **WHEN** the agent attempts
  `gh api -X POST /repos/o/r/issues/37/comments -f body=hi`
- **THEN** the guard blocks the call, naming `gh api` and the method that made
  it a write

#### Scenario: A write with no method flag

- **WHEN** the agent attempts
  `gh api /repos/o/r/issues/37/comments -f body=hi`
- **THEN** the guard blocks the call, because a parameter flag with no method
  sends `POST`

#### Scenario: A GraphQL call

- **WHEN** the agent attempts `gh api graphql -f query=…`
- **THEN** the guard blocks the call, whether the operation is a query or a
  mutation

#### Scenario: Reading through the endpoint still works

- **WHEN** the agent attempts
  `gh api "repos/o/r/pulls/37/comments?per_page=100" --paginate`
- **THEN** the call is not blocked, because it names no method and carries no
  parameter flag

#### Scenario: A read that carries parameters

- **WHEN** the agent attempts `gh api -X GET /search/issues -f q=repo:o/r`
- **THEN** the call is not blocked, because an explicit `GET` sends the
  parameters as a query string
