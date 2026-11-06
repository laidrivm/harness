# agent-description-slug — design

## Context

The delegation rule is one line of `core/rules.md`'s `### Rules` preamble,
pinned by the requirement *A session delegates to a fresh subagent with a
brief of the task* and by `bun/delegation.test.ts`, which looks for phrases in
that preamble. `fresh-subagent-brief` (archived 2026-10-25) settled, in its
decisions 3 and 4, that the rule is one line there and that no separate doc
stands behind it.

What a session can set on an `Agent` call, per the Claude Code docs read on
2026-11-06 (`sub-agents`, `agent-teams`, `hooks`, `tools-reference`): the
`description`, which the agent list and notifications show (a notification
reads `Agent "host-deploy group 3: light rollback"`); a `name` only with agent
teams enabled; and nothing that changes the agent's type or ID. `SendMessage`
reaches an agent by its ID. A name given before the session's last compaction
does not survive a restart; the ID does (*Message a subagent by name after a
restart*).

## Goals / Non-Goals

**Goals:** a session, and a reader of the agent list, can tell from a
subagent's label which change or card it works on, and can still reach it
after a compaction.

**Non-Goals:** checking a call's `description`; renaming the agent's type.

## Decisions

Numbered as on the card's question of 2026-11-06, and the user's answers of
the same day: 1 — ok, 2 — yes, 3 — ok.

1. **One sentence appended to the delegation line.** User: ok. It stays the
   one line `fresh-subagent-brief` decided, in the preamble outside the Code,
   Process and Safety sublists, whose counts stay as they are. Wording:

   > Open the call's `description` with the slug of the change it carries, or
   > of the card where there is none, and name the agent's ID beside that card
   > in each report — the description is what the agent list and
   > notifications show, and the ID is what `SendMessage` still reaches after
   > a compaction.

2. **No mechanism; the rule holds it.** User: yes. Why none fits is under
   *Alternatives*.
3. **The test pins two phrases.** User: ok. `bun/delegation.test.ts` adds
   "`description` with the slug" and "the agent's ID" to the phrases it
   already expects in the preamble, so dropping either half fails it.

## Alternatives

The rulebook's loop asks first whether a mechanism can hold a rule. None
would without blocking far more than the rule intends.

- **A `PreToolUse` hook on `Agent`.** A hook can match `Agent` and read
  `tool_input.description`, but it would refuse the service calls too: the
  reviewers `/code-review` starts, Explore, deep-research. A card has no
  machine-checkable slug, so the hook could not tell a card's call from a
  service one, and `isolation`, which might have told them apart, is not a
  documented `tool_input` field.
- **Agent teams for `name`.** Experimental. A named call without `isolation`
  launches a teammate in the main session's directory that does not survive
  `/resume`, and a name given before a compaction stops working after a
  restart — the case the card is about.
- **A `card-worker` agent type in `.claude/agents/`.** It changes only the
  label from `general-purpose`, every card's agent would share it, and a
  shared brief in its body contradicts "write its brief into the launch
  prompt".

## Risks / Trade-offs

- [Nothing checks a `description`] → the sentence is the only guard, as for
  the brief itself; a missed slug costs a lookup by worktree, as today.
- [The display rests on one Claude Code version] → the docs' read date is
  above, so a reader can re-check it.
