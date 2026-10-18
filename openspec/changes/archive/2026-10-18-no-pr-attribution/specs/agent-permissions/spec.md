# agent-permissions — delta spec

## ADDED Requirements

### Requirement: Claude Code adds no attribution to a pull request body

The tracked `.claude/settings.json` SHALL set `attribution` to exactly
`{"pr": "", "sessionUrl": false}`. The empty `pr` hides the line Claude Code
adds to a pull request description. `sessionUrl: false` drops the session
link a cloud or Remote Control session adds to a pull request and to a
commit. `commit` stays unset, so a commit keeps Claude Code's default
`Co-Authored-By` trailer. A consumer's check SHALL fail when `attribution` is
anything else. The harness's own settings file SHALL carry the same value,
pinned by a test, since no consumer check reads it.

#### Scenario: A consumer without the setting

- **WHEN** a consumer's settings carry no `attribution` key
- **THEN** its check names `attribution`

#### Scenario: A consumer that hides the commit trailer too

- **WHEN** a consumer's `attribution` also sets `commit` to the empty string,
  or `attribution` is `false`
- **THEN** its check names `attribution`, because the commit trailer is the
  one a commit must carry

#### Scenario: The same value with its keys in another order

- **WHEN** a consumer's `attribution` is `{"sessionUrl": false, "pr": ""}`
- **THEN** its check reports nothing about `attribution`

#### Scenario: The harness's own settings

- **WHEN** this repository's `.claude/settings.json` is read
- **THEN** its `attribution` equals the value the check compares
