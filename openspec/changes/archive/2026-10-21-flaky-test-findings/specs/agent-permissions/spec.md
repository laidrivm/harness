# agent-permissions — delta

## ADDED Requirements

### Requirement: Re-running, cancelling or deleting a CI run prompts

`permissions.ask` SHALL cover `gh run rerun`, `gh run cancel` and
`gh run delete`, each both with the subcommand straight after `gh run` and
with a flag between them, so a broad `Bash(gh run *)` allow entry in any
settings source does not let one through. A CI run re-run until it is green
hides a flaky test, and the user decides when that is worth doing. The reads
of `gh run` SHALL NOT prompt.

#### Scenario: Re-running a failed run

- **WHEN** the agent attempts `gh run rerun 123 --failed` with
  `Bash(gh run *)` under `permissions.allow`
- **THEN** Claude Code prompts, because `ask` is evaluated before `allow`

#### Scenario: A flag before the subcommand

- **WHEN** the agent attempts `gh run -R o/r rerun 123`
- **THEN** Claude Code prompts

#### Scenario: Cancelling or deleting a run

- **WHEN** the agent attempts `gh run cancel 123` or `gh run delete 123`
- **THEN** Claude Code prompts

#### Scenario: Reading a run

- **WHEN** the agent attempts `gh run view 123 --log-failed`, `gh run list`
  or `gh run watch 123`
- **THEN** Claude Code does not prompt

#### Scenario: A consumer adopts the entries through the sync

- **WHEN** a consumer whose `ask` list lacks the `gh run` entries runs the
  sync command
- **THEN** its `Bash(` ask entries are exactly the harness's, and the check
  finds no permission list wrong

#### Scenario: An entry is dropped

- **WHEN** `Bash(gh run * rerun *)` is deleted from `permissions.ask`
- **THEN** `bun test` fails
