## MODIFIED Requirements

### Requirement: A session delegates to a fresh subagent with a brief of the task

A session that hands a task to a subagent SHALL start a fresh one, and SHALL
fork itself only when the task needs the session's history. It SHALL write
the subagent's brief into the launch prompt and into no tracked file. The
brief SHALL carry the task, the clone and branch, the acts allowed, the
user's words that apply and the report's form, and SHALL NOT copy anything
the harness already loads for a fresh subagent. For a subagent that works on
a change or a card, the session SHALL open the call's `description` with the
slug of the change, or of the card where there is none, and SHALL name the
agent's ID, where the call returns one, beside the change's card, or beside
that card when there is no change, in each report. `core/rules.md` SHALL
state this in one line of its
`### Rules` preamble, outside the Code, Process and Safety sublists, whose
counts it leaves as they are.

#### Scenario: The rulebook states the rule where every session reads it

- **WHEN** a session starts in a project whose `CLAUDE.md` imports
  `core/rules.md` or its copy
- **THEN** the rulebook's `### Rules` preamble names a fresh subagent, the
  fork's exception, a brief kept out of git, that the brief copies nothing
  the harness already loads, a `description` opened with the slug of the
  change or card, and the agent's ID named beside its card in each report
