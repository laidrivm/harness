# notion-status-gate — design

## Context

See proposal.md, *Why*. The parts exist on `main`: `bun/work.ts`, a strict
dispatcher with `take` (`work-finish` group 2 adds `finish`); `integration()`
in `bun/notion-ask.ts`, the ask settings and a REST client; `boardState(tree)`
in `bun/board-state.ts`, which derives `proposing`, `proposed` and `done`
from a directory; `groups()` and `complete()` in `bun/turn-gate.ts`, which
count a task list's boxes per `## ` group; `record()` in `bun/gate-ledger.ts`;
the property `PATCH` of `assign()` in `bun/notion-bot.ts`; and the `select`
value `bun/notion-pause.ts` creates a card with. The allow
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

`status` runs `git fetch -q origin +refs/heads/main:refs/remotes/origin/main`
in the checkout's top level — the refspec named, as `bun/ci-run-clone.ts`
names its own, so a single-branch clone or a narrowed `remote.origin.fetch`
still moves `origin/main` — then
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
`bun/board-state.ts`, exported. An active pointer's slug must have an entry
in the derived status map, active or archived, since the archive moves the
directory a card may still point at; an archived pointer's directory must
exist in the extracted tree as named. Either path behind `<name>: `, where
`<name>` is the checkout's `package.json` `name`, is read the same — the
cross-repository form of task-board's *A card for another repository's
change points across*, which a `D2ASS` card on a harness change carries;
any other repository's refuses, since this tree decides only its own
changes. The card's board is not compared with the board `harness.board`
names (proposal, non-goal).

shortcut: a slug both archived and active again derives `done` in
`boardState()` — the archive is its later fact — so an active pointer at a
reopened change is proven `done`; read the active directory alone when a
reopened change first reaches a card.

### The WIP count

The page read gives the card's current `Status` and `parent.data_source_id`.
Only a move from outside the seven range statuses into one of the five that
need no evidence counts: a proven `proposed` or `applied` is work already
done, and refusing it would leave a card behind its floor that task-board's
reconciliation must correct, with the connector's write refused too. The
count is `POST /v1/data_sources/{id}/query` with an `or` filter of `Status`
equal to each of the seven and `page_size: 100`; `has_more` refuses at any
limit, so there is no pagination. `HARNESS_WIP_LIMIT` is read only then, and
must match `^\d+$` whole. The card itself is outside the range at that
moment, so it is never in its own count.

A card at `idea` enters like one at `approved`. `core/feature-workflow.md`
lets a session the user directs at an `idea` card move it to `exploring`,
the instruction being the approval, and the command cannot tell a directed
session from an unattended one, whose taking no work from `idea` stays that
file's rule (card question 9).

### The order of checks and the write

1. The arguments (exit 2).
2. `--to` `idea`, `approved` or `discarded`: refused, no call.
3. The ask settings, then the page read: no settings, a failed read, or a
   parent that is no data source refuses. A `discarded` card refuses.
4. The evidence, when `--to` is `proposed`, `applied` or `done`.
5. The WIP count, when the move enters the range unproven.
6. `PATCH /v1/pages/{card}` with `{ properties: { Status: { select: { name } } } }`,
   a sibling of `assign()` in `bun/notion-bot.ts`, sent through the ask
   integration's `call`. Notion answers with the page;
   `status` prints `status: <card> <from> → <to>` from that answer, the
   read-back `core/feature-workflow.md` asks for.

The evidence comes before the count, since a proven move is not counted, and
the user's statuses need neither. Output is one line; a refusal reads `status: refused —
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
  the live probe in 2.4 records the first real move the command makes.
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
a change. Shared capability: `gate-ledger`. `work-finish` modifies *Every
gate refusal is recorded* to name its three gates, and this change modifies
the same requirement to add its two; its delta is `work-finish`'s copy plus
those, so the two agree, and the order is prose — re-copy from the live spec
before this change archives (`core/feature-workflow.md`, *Copy a `MODIFIED`
requirement whole*). `judgement-step-record` modifies another gate-ledger
requirement, the record's fields, which this change does not touch. The
other seams are files: `bun/work.ts` and `.claude/settings.json` with
`work-finish` group 2, and harness-updates' harness-only rule from
`judgement-step-record`, which this hook follows and does not restate. No
contradiction; order via prose.

## Migration Plan

After group 1 merges, the main session moves cards with `bun bun/work.ts
status`; the user grants the ask integration *Update content* before it.
After group 2 merges and the pin moves, the connector's `Status` write is
refused in the harness. Rollback: revert the registration group in
`.claude/settings.json`; the command stays usable without it.
