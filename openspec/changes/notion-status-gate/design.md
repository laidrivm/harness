# notion-status-gate — design

## Context

See proposal.md, *Why*. Reused from `main`: the `bun/work.ts` dispatcher,
`integration()` (`bun/notion-ask.ts`), `boardState()` (`bun/board-state.ts`),
`groups()`/`complete()` (`bun/turn-gate.ts`), `record()`/`blocker()`
(`bun/gate-ledger.ts`), and the property `PATCH` of `assign()`
(`bun/notion-bot.ts`); the allow entry `Bash(bun bun/work.ts *)` is there.

The card's six risks of reusing `board-state.ts` and `complete()`, each with
a failing case first in `tasks.md`:

| Risk | Where it is held |
| --- | --- |
| `boardState` reads the directory it is given, and a checkout lagged 222 commits on 2026-10-27 | *Merged statuses are proven on origin/main*; *The tree is origin/main's* below; cases *a checkout behind* and *ahead* |
| `boardState`'s `proposing` means an incomplete directory, not the board's status | *Each merged status has its own evidence*: a derived `proposing` proves nothing |
| `complete()` answers the groups that are done, not whether all are; `Dropped` boxes are ticked | the same requirement: every group, and a ticked `Dropped …` counts |
| `Pointer` is free text, and a wrong or archived one proves another change | *The card's Pointer names the change proven* |
| moves without evidence check only WIP, so `approved` to `archiving` passes | *The other statuses need no evidence and no order*, a non-goal pinned by a scenario |
| a live refusal for each kind of check | `tasks.md` 1.6 and 3.1 |

## Goals / Non-Goals

**Goals:** the spec's refusals, with the connector's `Status` write refused
in the harness so the command is not optional. **Non-Goals:** beyond the
proposal's list, a lock on the last WIP place (one main session, roadmap
clarification 2) and retries (the session runs the command again).

## Decisions

### The evidence is origin/main's tree, not goal-check's verdict

`bun/goal-check.ts` matches the pre-PR record by commit and checkout and the
pull request by `HEAD`'s branch, so from the main checkout it answers `goal
open`; the three statuses mean merged, and the main session moves them after
the merge. Rejected (card question 1): the goal check in the stage's worktree
after the merge, which must outlive it; the goal check after `work.ts
finish`, which redefines the statuses as "pull request ready".

### The tree is origin/main's

`status` runs `git fetch -q origin +refs/heads/main:refs/remotes/origin/main`
in the checkout's top level — the refspec named, as `bun/ci-run-clone.ts`
names its own, so a single-branch clone or a narrowed `remote.origin.fetch`
still moves `origin/main` — then
`git archive origin/main openspec/changes` into a fresh temporary directory
(extracted with `tar`, removed afterwards), and calls `boardState()` on it
unchanged; `tasks.md` is read from there too. Rejected: `boardState(top)`,
which answers for the checkout; `git ls-tree`/`git show`, which would restate
`boardState`'s derivation beside it (`core/rules.md`, Code); a `git
worktree`, which writes into the shared repository's files. `boardState()`
throws on a defect anywhere in the tree, and `status` refuses with its
message: `bun/board-state-hygiene.test.ts` keeps `main` free of those.

### What each merged status needs

task-board's floors: `proposed` ⇐ derived `proposed` or `done`; `done` ⇐
derived `done`; `applied` ⇐ derived `done`, or derived `proposed` with
`groups(tasks).size > 0` and `complete(tasks).length === groups(tasks).size`
— a group with no box is not complete, and a `## ` heading written twice
refuses, since `groups()` keys by heading and the later would hide the
earlier. A `Dropped: …` task is written ticked
(`work-finish` 1.1) and counts as ticked on purpose.

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
file's rule (card question 9, answered а on 2026-10-28).

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

Each refusal is `record("status", "block", id, { cwd: top }, commit)`, `top`
the checkout's top level, so the record names its project where
`CLAUDE_PROJECT_DIR` is unset, and `commit` the `origin/main` SHA read. Ids: `user-only`, `wip-full`,
`wip-limit` (the variable is not a number), `no-pointer`, `no-evidence`,
`unread` (any failed read: settings, page, query, fetch, archive). A failed
write is no refusal and records nothing, as in `work-finish`. These records
are what stage 2's refusal counter (*Потом* 8) counts by rule.

### The hook, harness-only

`bun/status-guard.ts`, `PreToolUse` under `NOTION_MATCHER` in a group of its
own in the harness's `.claude/settings.json`,
`g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/status-guard.ts"; if [ -f
"$g" ]; then bun "$g"; fi`, unmarked and in no `HOOKS` entry — the form of
the ready guard and the skill hook (harness-updates, *A hook the harness keeps
to itself reaches no consumer*, from `judgement-step-record`). `sync-settings`
keeps an unmarked group whole, and the Notion update guard is not `sole`.

It calls `blocker("status-guard", event)("mcp-status", reason)` when
`tool_input.properties` is an object with its own key `Status`, under any
command. An unreadable event passes, as the Notion update guard's does: it
holds a forgotten path, not an intent (stage 2, question 23). Rejected:
extending `bun/notion-guard.ts`, which every consumer runs; prose (card
question 2 б), which leaves the gate optional.

## Risks / Trade-offs

- [*Update content* and a data source query from the ask integration are
  unmeasured; `bun/work-take.fixture.ts` types `Status` as `status`] → this
  fixture uses `select`; 3.1 records the first real moves.
- [No reachable `origin`, no merged move] → fail closed (stage 2).
- [The hook runs from the pin] → its probe follows the pin bump.
- [The board loop's pick sets `applying` through the connector] → its prompt
  treats a failed write as nothing, and stage 7 removes the pick.

## Conflict check

`openspec show <slug> --json --deltas-only` on 2026-10-28 for every open
change on `origin/main` — `work-finish`, `judgement-step-record`,
`host-deploy`, `code-review-replaces-cli` — and the open pull requests: #332
(`work-finish` group 2) leaves its gate-ledger delta as copied here, and #329
(`first-review-yield`) touches `agent-rulebook` alone. Since then #332 has
merged and `work-finish` has archived, so of these only the gate-ledger
overlap below still stands. Shared capability:
`gate-ledger`. `work-finish` modifies *Every
gate refusal is recorded* to name its three gates, and this change modifies
the same requirement to add its two; its delta, re-copied from the live spec
once `work-finish` archived (2026-10-28), is that text plus those, so the two
agree, and the order is prose — re-copy from the live spec again
before this change archives (`core/feature-workflow.md`, *Copy a `MODIFIED`
requirement whole*). `judgement-step-record` modifies another gate-ledger
requirement, the record's fields, which this change does not touch. The
other seams are files: `bun/work.ts` and `.claude/settings.json` with
`work-finish` group 2, and harness-updates' harness-only rule from
`judgement-step-record`, which this hook follows and does not restate. No
contradiction; order via prose.

## Migration Plan

Group 1 ships the command, which holds alone; group 2 the hook and the prose
— the hook first would leave no way to move a status but the Notion
interface. The user grants *Update content* before group 1's probe. Rollback:
revert the registration group; the command stays usable without it.
