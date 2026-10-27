# work-take

## Why

A session that takes a card reads its body, its comments and the change it
points at by hand, through the Notion connector and the tree, and the prose
holding that read (`core/feature-workflow.md`, the sub-agent brief) did not
hold it: a user's answer in a card's comments went unread before a step.
Stage 2 of the roadmap settles the cure (its question 25, variant а, revised
2026-10-26): the session takes a card with `work.ts take --card <id>`, which
prints the card's context and writes nothing — no ledger record and no
"fully initiated" gate. This change is that half of the stage's slice item 3;
`work.ts finish` is the other.

## What Changes

- `bun bun/work.ts take --card <id>`, its arguments read by a strict
  `util.parseArgs`, prints in order: the checkout's `HEAD`; the card's
  properties; its body as the markdown Notion renders; every page-level
  comment, oldest first, with its time and author, and a last line saying
  whether a question waits on the user; when `Pointer` is exactly
  `openspec/changes/<slug>/`, that change's proposal, design, tasks and delta
  specs from the tree with the names of the capabilities they touch; then
  `openspec list` as it prints.
- It writes nothing, in Notion, git or the ledger. A read that fails exits 1
  naming its step, never the token; a wrong argument prints the usage and
  exits 2 before any call.
- It reads Notion through the ask integration, as `work.ts finish` does. The
  user granted that integration *Read content* on 2026-10-26 (card comment,
  item 1, variant а), so the README and `bun/notion-ask.ts` stop calling it
  an integration with comment capabilities alone. The ask command itself
  still reads no page (`task-board`, *A session asks through the ask
  integration where one is configured*).

Not in this change: the `SessionStart` hook that loads the context no card
holds (stage 2, *Потом* 5); comments anchored on a block, which the page's
comment read does not return; a session or card state that take would
record.

Order against the neighbouring changes: whichever of this change and
`work-finish` is applied first creates `bun/work.ts`, lifts the ask
settings read out of `ask()` in `bun/notion-ask.ts`, and adds the allow
entry `Bash(bun bun/work.ts *)`; the other adds its subcommand to what is
there. `take` depends on neither and may go first. The sub-agent worktrees
(card `40539875c31b8147818fcdcc791611f2`) do not touch it: the main session
runs `take` in its own checkout.

## Capabilities

### New Capabilities

- `work-take`: the command a session takes a card with — what it prints,
  from where, in which order, and that it changes nothing.

### Modified Capabilities

None. The ask command's requirement keeps its wording: it is about the
command, which still reads no page.

## Impact

- New: `bun/work-take.ts` and `bun/work-take.test.ts`; `bun/work.ts` if
  `work-finish` has not created it.
- Changed: `bun/notion-bot.ts` (`discussion()` and `waits()` exported,
  `client()` takes the API version), `bun/notion-bot.fixture.ts` (the
  markdown route), `bun/notion-ask.ts` (the lifted settings export, if
  `work-finish` has not lifted it, and its header comment), `README.md`,
  `.claude/settings.json` and `bun/self-pin.test.ts` (the allow entry, if
  absent).
- Notion: one more call per take, `GET /v1/pages/{id}/markdown`, under API
  version `2026-03-11` for that call alone.
