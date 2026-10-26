# harness-updates — delta for judgement-step-record

## ADDED Requirements

### Requirement: A hook the harness keeps to itself reaches no consumer

A gate hook the harness registers for its own sessions only SHALL be
registered in its tracked `.claude/settings.json` and nowhere a sync writes
from, so that a consumer's sync never gains it and a sync of the harness's own
settings keeps it. It SHALL run the harness's pinned copy, as every other hook
there does. Consumers take such a hook only through a change that adds it to
what the sync writes.

#### Scenario: A consumer syncs

- **WHEN** a consumer runs the sync command of a harness version that records
  skill calls in its own sessions
- **THEN** the consumer's settings gain no hook for the `Skill` tool or for
  `UserPromptExpansion`

#### Scenario: The harness's own settings are synced

- **WHEN** the sync command runs over the harness's own tracked settings
- **THEN** the skill-call hook's registrations are still there, unchanged

#### Scenario: The skill-call hook's registration

- **WHEN** the harness's test run reads its tracked settings
- **THEN** it finds the skill-call hook under `PostToolUse` with the matcher
  `Skill` and under `UserPromptExpansion` with no matcher, each a command
  hook run in the foreground with no `if`, running the pinned copy
