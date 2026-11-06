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

   What its terms mean, so two sessions write the same label:
   - *the slug of the change* is the change's directory name under
     `openspec/changes/`; *of the card* is a short kebab-case form of the
     card's title, for a card with no change yet;
   - *that card* is the card the slug names, and a change's card where the
     slug is a change's, since every change has one on the board;
   - *each report* is the session's report to the user or its caller that
     mentions the agent, not the agent's own;
   - *the agent's ID* is the one the call returns; the built-in Explore and
     Plan agents are one-shot and return none (*Resume subagents*), so a
     report names none for them, and work a session will want to continue
     goes to `general-purpose` or a custom type, which return one;
   - a call that works on neither a change nor a card — a lookup, a service
     call such as the reviewers `/code-review` starts — is outside the rule.

   The delegation entry stays one entry of the preamble, now two sentences;
   "one line" in the requirement means that entry, as it did in
   `fresh-subagent-brief`. The Process rule *Resume a subagent only for work
   on its own open pull request* says when to resume an agent, not how to
   find it, and stays as it is.
2. **No mechanism; the rule holds it.** User: yes. Why none fits is under
   *Alternatives*.
3. **The test pins two phrases.** User: ok. `bun/delegation.test.ts` adds
   "`description` with the slug" and "the agent's ID" to the phrases it
   already expects in the preamble, so dropping either half fails it. Since
   CodeRabbit's round 1 on the apply pull request, each is pinned within its
   whole clause — "Open the call's `description` with the slug of the change
   it carries, or of the card where there is none" and "name the agent's ID
   beside that card in each report" — so the slug's place at the opening and
   the ID's place beside the card fail it too.

## Alternatives

The rulebook's loop asks first whether a mechanism can hold a rule. None
would without blocking far more than the rule intends.

- **A `PreToolUse` hook on `Agent`.** A hook can match `Agent` and read
  `tool_input.description`, but it would refuse the service calls too: the
  reviewers `/code-review` starts, Explore, deep-research. Keying it on
  `isolation`, which the `Agent` schema lists, would spare most of those, but
  a card has no machine-checkable slug, so the hook could check only that a
  description opens with some kebab-case word, never that the word names the
  card, and a card's read-only agent started without `isolation` would pass
  unchecked. A gate that checks the form and not the fact holds no more than
  the rule.
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
- [That `SendMessage` reaches an agent by ID after a compaction is read from
  the docs, not exercised] → a list of agents can miss one started before a
  compaction while it still runs; an ID written into the report survives in
  the conversation either way, and is the first thing to try.
