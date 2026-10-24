# delegation — delta

## Purpose

How a session hands a task to a subagent: a fresh one with a self-contained
brief, and a fork only when the task needs the session's history. It exists
because a fork copies the whole conversation, which made each fork of one
long session start at about 885k tokens, while a fresh subagent starts from
the brief and the files every session loads.

## ADDED Requirements

### Requirement: A session delegates to a fresh subagent with a brief

A session that hands a task to a subagent SHALL start a fresh one and give it
a self-contained brief, and SHALL fork itself only when the task needs the
session's history — a judgement reached in the conversation that the brief
cannot carry in a few lines. `core/delegation.md` SHALL hold the rule and
what a brief carries, and `core/rules.md` SHALL link that doc from its
`### Rules` preamble in a line that states the rule, so a session meets it
without reading the doc. The line SHALL sit outside the Code, Process and
Safety sublists, whose counts it leaves as they are.

#### Scenario: The rulebook states the rule where every session reads it

- **WHEN** a session starts in a project whose `CLAUDE.md` imports
  `core/rules.md` or its copy
- **THEN** the rulebook's `### Rules` preamble names a fresh subagent, a
  brief and the fork's exception, and links `delegation.md`

### Requirement: A brief carries only what a fresh subagent cannot read itself

A brief SHALL carry the task, the acts it allows, the user's standing
instructions that no tracked file holds, and the facts of the session — the
clone to work in, host addresses, user ids, scratchpad paths. It SHALL NOT
restate a rule of `core/rules.md`, which a fresh subagent loads on its own,
since a second copy drifts from the first. `core/delegation.md`, being
tracked and copied to every consumer, SHALL hold the shape of a brief and
none of a session's facts.

#### Scenario: The doc copies no rule of the rulebook

- **WHEN** a bullet of a sublist of `core/rules.md`'s `### Rules`, whitespace
  normalised, appears whole in `core/delegation.md`, whitespace normalised
- **THEN** the check fails, naming the bullet's opening words

#### Scenario: The doc holds none of a session's facts

- **WHEN** `core/delegation.md` holds an IPv4 address, a UUID, or an absolute
  path under a home or temporary directory
- **THEN** the check fails, naming what it found
