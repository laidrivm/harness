# notion-status-gate — design

## Context

See proposal.md, *Why*. The parts exist on `main`: `bun/work.ts`, a strict
dispatcher with `take` (`work-finish` group 2 adds `finish`); `integration()`
in `bun/notion-ask.ts`, the ask settings and a REST client; `boardState(tree)`
in `bun/board-state.ts`, which derives `proposing`, `proposed` and `done`
from a directory; `groups()` and `complete()` in `bun/turn-gate.ts`, which
count a task list's boxes per `## ` group; `record()` in `bun/gate-ledger.ts`;
and the `PATCH` form of a `select` write in `bun/notion-pause.ts`. The allow
entry `Bash(bun bun/work.ts *)` is already in `.claude/settings.json`.
Nothing checks a `Status` write today: `bun/notion-guard.ts` refuses only
`properties` under another command.

The card's exploration listed six risks of reusing `board-state.ts` and
`complete()`. Each is a requirement of `specs/work-status/spec.md`, a
decision below, or a non-goal, and each has a failing case first in
`tasks.md`:

| Risk | Where it is held |
| --- | --- |
| `boardState` reads the directory it is given, and a checkout lagged 222 commits on 2026-10-27 | *Merged statuses are proven on origin/main*; *The tree is origin/main's* below; cases *a checkout behind* and *ahead* |
| `boardState`'s `proposing` means an incomplete directory, not the board's status | *Each merged status has its own evidence*: a derived `proposing` proves nothing |
| `complete()` answers the groups that are done, not whether all are; `Dropped` boxes are ticked | the same requirement: every group, and a ticked `Dropped …` counts |
| `Pointer` is free text, and a wrong or archived one proves another change | *The card's Pointer names the change proven* |
| moves without evidence check only WIP, so `approved` to `archiving` passes | *The other statuses need no evidence and no order*, a non-goal pinned by a scenario |
| a live refusal for each kind of check | `tasks.md` 1.6 and 2.4 |

## Goals / Non-Goals

**Goals:** one command moves a card's status in the harness, refusing the
user's statuses, an entry past the WIP limit, and a merged status that
`origin/main` does not prove; the connector's `Status` write is refused
there, so the command is not optional.

**Non-Goals:** beyond the proposal's list, a lock against two sessions taking
the last WIP place at once — one main session runs at a time (roadmap
clarification 2); retrying a Notion failure — the session runs the command
again.

## Decisions

### The evidence is origin/main's tree, not goal-check's verdict

The deviation the proposal names. `bun/goal-check.ts` answers for the
checkout it runs in: the pre-PR record is matched by commit and checkout,
the pull request by `HEAD`'s branch, so from the main checkout or another
worktree at the same commit it answers `goal open`. `proposed`, `applied` and
`done` mean merged (task-board), and the session that moves them is the main
session, after the merge, in no stage's worktree. Rejected (card question 1):
the goal check in the stage's worktree after the merge, which needs the
worktree to live until then; and the goal check right after `work.ts finish`,
which makes the three statuses mean "pull request ready" and changes
task-board's definitions.

### The tree is origin/main's

`status` runs `git fetch -q origin main` in the checkout's top level, then
`git archive origin/main openspec/changes` into a fresh temporary directory
(extracted with `tar`, removed afterwards), and calls `boardState()` on it
unchanged. `tasks.md` is read from the same directory. Nothing reads the
checkout's files, `HEAD` or `refs/heads/main`. `origin` and `main` are named
as `work-finish` names them. Rejected: `boardState(top)`, which answers for
whatever the checkout holds; reading paths with `git ls-tree` and
`git show`, which would restate `boardState`'s derivation beside it — two
copies kept in step by hand drift (`core/rules.md`, Code); a `git worktree`,
which writes into the shared repository's administrative files.

`boardState()` throws on any defect of the whole tree; `status` refuses with
its message. `bun/board-state-hygiene.test.ts` keeps `main`'s tree free of
those, so the refusal is for a broken `main`, which should stop a move.

### What each merged status needs

The floor reading task-board already defines: a derived status holds from
its stage on. `proposed` ⇐ derived `proposed` or `done`; `done` ⇐ derived
`done`; `applied` ⇐ derived `done`, or derived `proposed` with
`groups(tasks).size > 0` and `complete(tasks).length === groups(tasks).size`.
`complete()` already demands a ticked box and no open one per group, and a
group with no box is not complete, so a task list whose `## ` group lists no
task blocks `applied`. A `Dropped: …` task is written ticked by the
convention `work-finish`'s 1.1 shows; it counts as ticked on purpose and the
requirement says so.

### The Pointer

The slug comes from the `Pointer` matched whole against
`openspec/changes/<slug>/` — `POINTER` in `bun/work-take.ts`, exported — or
`openspec/changes/archive/<name>/`, its name matched by `ARCHIVED` in
`bun/board-state.ts`, exported. The slug must have an entry in the derived
status map: active or archived, either proves its slug's floor. A
cross-repository `Pointer` (`<repo>: openspec/changes/<slug>/`) refuses: this
tree decides only its own board. The card's board is not compared with the
board `harness.board` names (proposal, non-goal).

### The WIP count

The page read gives the card's current `Status` and `parent.data_source_id`.
Only a move from outside the seven range statuses into one of them counts:
`POST /v1/data_sources/{id}/query` with an `or` filter of `Status` equal to
each of the seven and `page_size: 100`, and the count is the results' length,
or 100 when `has_more` — any limit that high is reached either way, so there
is no pagination. `HARNESS_WIP_LIMIT` is read only then, and must match
`^\d+$` whole. The card itself is outside the range at that moment, so it is
never in its own count.

### The order of checks and the write

1. The arguments (exit 2).
2. `--to` `idea`, `approved` or `discarded`: refused, no call.
3. The ask settings, then the page read: no settings, a failed read, or a
   parent that is no data source refuses. A `discarded` card refuses.
4. The WIP count, when the move enters the range.
5. The evidence, when `--to` is `proposed`, `applied` or `done`.
6. `PATCH /v1/pages/{card}` with `{ properties: { Status: { select: { name } } } }`,
   the form `bun/notion-pause.ts` creates with. Notion answers with the page;
   `status` prints `status: <card> <from> → <to>` from that answer, the
   read-back `core/feature-workflow.md` asks for.

Notion is read before git, so a refusal of the user's or the WIP's never
waits on a fetch. Output is one line; a refusal reads `status: refused —
<why>`. Rejected: putting the command in `bun/notion-bot.ts` (279 of its 300
lines), as the card's title has it; `bun/work-status.ts` is the module, as
`take` and `finish` each have one.

### Records

Each refusal is `record("status", "block", id, null, commit)`, `commit` the
`origin/main` SHA where the tree was read. Ids: `user-only`, `wip-full`,
`wip-limit` (the variable is not a number), `no-pointer`, `no-evidence`,
`unread` (any failed read: settings, page, query, fetch, archive). A failed
write is no refusal and records nothing, as in `work-finish`. These records
are what stage 2's refusal counter (*Потом* 8) counts by rule.

### The hook, harness-only

`bun/status-guard.ts`, a `PreToolUse` hook under the matcher
`^mcp__.+__notion-update-page$` (`NOTION_MATCHER`), in a group of its own in
the harness's `.claude/settings.json`:
`g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/status-guard.ts"; if [ -f
"$g" ]; then bun "$g"; fi`, with no `# harness-managed` mark and no `HOOKS`
entry. That is the form `work-finish`'s ready guard and
`judgement-step-record`'s skill hook take; the latter's harness-updates
requirement *A hook the harness keeps to itself reaches no consumer* states
it generally, and `sync-settings` keeps an unmarked group whole. The Notion
update guard is not `sole`, so a second group under its matcher passes
`settings.ts`.

It refuses through `blocker("status-guard", event)("mcp-status", reason)`
when `tool_input.properties` is an object with its own key `Status`, under
any command; the reason names `bun bun/work.ts status --card <id> --to
<status>`. An unreadable event passes, as the Notion update guard's does: it
holds a forgotten path, not an intent to get round it (stage 2, question 23).
Rejected: extending `bun/notion-guard.ts`, which every consumer runs; leaving
the rule in prose (card question 2 б), which leaves the gate optional and the
stage's live probe nothing to probe.

### Two steps

Group 1 ships the command; it holds alone, the connector write still open.
Group 2 ships the hook, its registration and the prose. The hook cannot ship
first: until the command exists it would leave no way to move a status but
the Notion interface.

## Risks / Trade-offs

- [The ask integration's *Update content* and a data source query from it are
  unmeasured; `bun/work-take.fixture.ts` gives `Status` the `status` type
  where task-board fixes `select`] → the fixture for `status` uses `select`;
  the live probe in 1.6 moves a real card before group 2 merges.
- [A checkout whose `origin` is unreachable cannot move a merged status] →
  fail closed, as stage 2 asks; the session retries.
- [The hook runs from the pin, so it holds only once the pin passes group 2's
  merge] → its probe follows the pin bump, as the ready guard's does.
- [The board loop's pick session sets `applying` through the connector; under
  the harness's settings after the pin bump its write is refused] → its
  prompt already treats a failed write as changing nothing, and roadmap stage
  7 removes the pick.
- [A cold `git fetch` and an archive per merged move] → seconds, once per
  stage.

## Conflict check

`openspec show <slug> --json --deltas-only` on 2026-10-27 for every open
change on `origin/main` — `work-finish`, `judgement-step-record`,
`host-deploy`, `code-review-replaces-cli` — and no open pull request carrying
a change: this change touches `work-status` alone, which no other change
touches, so no capability is shared. The seams are files, not requirements:
`bun/work.ts` and `.claude/settings.json` with `work-finish` group 2 (order
in the proposal's prose), and harness-updates' harness-only rule from
`judgement-step-record`, which this hook follows and does not restate as a
delta. Not one changes another's requirement: no contradiction.

## Migration Plan

After group 1 merges, the main session moves cards with `bun bun/work.ts
status`; the user grants the ask integration *Update content* before it.
After group 2 merges and the pin moves, the connector's `Status` write is
refused in the harness. Rollback: revert the registration group in
`.claude/settings.json`; the command stays usable without it.
