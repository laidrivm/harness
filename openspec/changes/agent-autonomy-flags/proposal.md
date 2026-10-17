# agent-autonomy-flags

## Why

Eight skills under `core/skills/` carry `disable-model-invocation: true`:
`checklist`, `code-review`, `coderabbit`, `first-five`, `pr-brief`,
`review-order`, `session-wrapup` and `ship`. That flag makes the Skill tool
refuse a model's call, keeps the skill out of a sub-agent's listing, and stops
a scheduled task from running it. Only a `/name` the user types still runs it.
On 2026-10-18 an orchestrator session could not run `/coderabbit 147` on a
review that had already landed, and the user had to type it. An unattended
session cannot process the bot's review at all, so no step after the pull
request opens can run without someone present.

`agent-autonomy` (#63, #87) gave every critical-path step a class and named
this follow-up in its non-goals. The flags were never classified. The one
flag whose reason is written down guards against the wrong thing:
`core/review-toolkit.md` reserves `/coderabbit` because waiting for the bot
burns a session. That cost comes from the wait, not from reading the review,
and the same paragraph's "the user is present by definition" stops being
true once a runner starts the skill.

## What Changes

- The flag comes off the four skills that only read, report, or apply the
  fixes the review policy already lets the agent apply: `coderabbit`,
  `first-five`, `pr-brief` and `review-order`. An unattended or
  orchestrator-driven session can then run them through the Skill tool, and
  `ship`'s own calls to `coderabbit` and `pr-brief` stop being refused.
- The flag stays on the four whose run does more: `ship` merges and sleeps
  while it waits for the bot, `code-review` hands the diff to another
  vendor's agent CLI, `session-wrapup` writes the board and `docs/context/`
  at a moment the user picks, and `checklist` writes a plan file from
  whatever is in context. `core/autonomy.md` says that a skill carrying the
  flag is a `user` step for an unattended session, which reports `BLOCKED`
  naming it and never repeats its steps by other means.
- `/coderabbit` gets a guard against the risk the flag stood for. It reads
  the pull request once. If the bot has posted no review, it ends on an
  `OPEN` gate line that says so. It never sleeps, polls or reads again to
  wait for one. Its approval steps carry `card` markers, and
  `core/review-toolkit.md` gives the real reason fixes need no approval in
  place of "the user is present by definition".
- `ship`'s merge step is marked `user`.
- `first-five` loses `Bash(find:*)` from `allowed-tools`. Once the model can
  start the skill, that entry would let a `find -delete` or `-exec` run
  without a prompt. Glob does the same lookups.
- A test reads the frontmatter of the four skills an agent may run, so a
  flag added back fails `bun test`.

### Non-goals

- Steps off the critical path (`core/verification.md`, `core/testing.md`,
  `feature-generator`, `spec-generator`, a consumer's `CLAUDE.md` and
  `openspec/config.yaml`). Each one that waits or asks keeps the default
  `card`, and none of them should be read any other way.
- The prose of the four skills that keep the flag, except `ship`'s merge.
  An unattended session reaches them only when a runner types `/name`, and
  their unmarked asks already read as `card`.
- Starting `/coderabbit` when the review lands. That event belongs to the
  orchestrator and the board loop.
- `code-review`'s name, which it shares with Claude Code's bundled
  `/code-review`, and the fact that no checkout links `code-review`,
  `pr-brief` or `ship`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: *Who may invoke a skill is enforced, not narrated*
  says which skills may carry the flag and replaces its `/coderabbit`
  scenario.
- `agent-autonomy`: two new requirements, *A skill only the user may start is
  a `user` step* and *The bot's review is worked once it has landed, never
  waited for*.

## Impact

- `core/skills/{coderabbit,first-five,pr-brief,review-order}/SKILL.md`:
  the flag goes. `coderabbit` gains its read-once guard and two markers.
  `first-five` changes its `allowed-tools` and two lines of prose.
- `core/skills/ship/SKILL.md`: one marker.
- `core/autonomy.md`, `core/review-toolkit.md`: prose.
- `bun/skill-flags.test.ts`: new.
- Consumers get the change with their next pin bump. Their `.claude/skills/`
  links already reach `coderabbit`, `first-five` and `review-order`, so those
  three show up in the agent's skill listing.
