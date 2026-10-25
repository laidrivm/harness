# delegation — delta

## Purpose

How a session hands a task to a subagent: a fresh one with a brief, and a
fork only when the task needs the session's history. It exists because a fork
copies the whole conversation, which made each fork of one long session start
at about 885k tokens, while a fresh subagent starts from the brief and the
files every session loads.

## ADDED Requirements

### Requirement: A session delegates to a fresh subagent with a brief of the task

A session that hands a task to a subagent SHALL start a fresh one, and SHALL
fork itself only when the task needs the session's history. It SHALL write
the subagent's brief into the launch prompt and into no tracked file. The
brief SHALL carry the task, the clone and branch, the acts allowed, the
user's words that apply and the report's form, and SHALL NOT copy anything
the harness already loads for a fresh subagent. `core/rules.md` SHALL state
this in one line of its `### Rules` preamble, outside the Code, Process and
Safety sublists, whose counts it leaves as they are.

#### Scenario: The rulebook states the rule where every session reads it

- **WHEN** a session starts in a project whose `CLAUDE.md` imports
  `core/rules.md` or its copy
- **THEN** the rulebook's `### Rules` preamble names a fresh subagent, the
  fork's exception, a brief kept out of git, and that the brief copies
  nothing the harness already loads
