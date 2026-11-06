# agent-description-slug

## Why

A subagent shows in the agent list and in notifications as its `description`
beside a type such as `general-purpose` and an internal ID, and nothing says
what that description holds. On 2026-11-05 and 2026-11-06 a session twice lost
which agent worked on which card after a compaction, and found the agent again
only through the worktree holding the card's branch. The user asked
(2026-11-06) that each subagent be named after the card it works on, as part
of the harness.

## What Changes

- `core/rules.md` gains one sentence, appended to the delegation paragraph of
  its `### Rules` preamble: a session opens the `Agent` call's `description`
  with the slug of the change the subagent carries, or of the card where there
  is none, and names the agent's ID beside the change's card, or beside that
  card when there is no change, in each report. No
  sublist grows.
- `bun/delegation.test.ts` pins the sentence beside the phrases it already
  pins.

No mechanism holds the convention: a `PreToolUse` hook on `Agent` would
refuse the service calls too, agent teams' `name` is experimental and does not
survive a restart, and a `card-worker` agent type changes only the label
(design, *Alternatives*).

Not in this change: the board loop's stage prompt, which launches no
subagent; any check of a call's `description`, which lives only in the call.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `delegation`: the requirement *A session delegates to a fresh subagent with
  a brief of the task* adds what the call's `description` opens with and that
  each report names the agent's ID beside its card.

## Impact

- `core/rules.md` (one sentence in an existing preamble line),
  `bun/delegation.test.ts` (two phrases).
- Consumers receive the sentence through `bun/sync.ts`, which already copies
  `core/rules.md`; nothing to change there.
