# notion-status-gate

## Why

A card's `Status` moves on a session's word: the main session and its
sub-agents write it through the Notion connector under the user's name, and
nothing checks that a `proposed`, `applied` or `done` card is one, or that the
WIP limit (roadmap question 9: five cards between `approved` and `done`) has
room. Stage 2 of the roadmap puts that write behind harness code (*Потом* 6:
the status changes only on evidence and within the WIP limit), and the user
settled the two open choices on the card on 2026-10-27: the evidence is the
tree on `origin/main` (answer 1 в), and a hook refuses the connector's own
`Status` write in the harness's sessions (answer 2 а).

**Deviation from the stage's letter.** *Потом* 6 and the card's title say
"by goal-check's verdict". This change runs no goal check: `bun/goal-check.ts`
judges one checkout's `HEAD` from the ledger records of that checkout, and the
statuses that need evidence mean *merged*, which no worktree's `HEAD` answers.
The evidence is what `origin/main` holds after a fetch, read through
`bun/board-state.ts` and the task groups `bun/turn-gate.ts` counts — what
merged has already passed the required checks and the user (stage 2,
question 23). The card's answer 1 в chose this knowingly.

## What Changes

- `bun bun/work.ts status --card <id> --to <status>`, its arguments read by a
  strict `util.parseArgs`, writes the card's `Status` through the ask
  integration — the one path a session moves a card by in the harness. `--to`
  is one of the eight statuses a session sets, `exploring` to `done`.
- It refuses, changing nothing and writing one ledger record each:
  - `idea`, `approved` or `discarded` as the target, and any move out of
    `discarded` — the user's alone (task-board);
  - an entry into `exploring` … `archiving` from outside them, unless
    `origin/main` proves it, while the card's own board already holds
    `HARNESS_WIP_LIMIT` cards there (unset: 5; not a whole number: refused);
  - `proposed`, `applied` or `done` without evidence on `origin/main`, fetched
    first and never the local tree: `proposed` when the tree derives
    `proposed` or `done` for the card's change, `done` when it derives `done`,
    `applied` when it derives `done`, or `proposed` with every task group of
    `tasks.md` ticked. The change is the one the card's `Pointer` names, wholly
    `openspec/changes/<slug>/` or `openspec/changes/archive/<date>-<slug>/`,
    or either behind this repository's own name, and present on
    `origin/main`;
  - any read that fails — the fetch, the tree, the card, the board's query.
- A `PreToolUse` hook on the connector's `notion-update-page` refuses any call
  whose `properties` carry `Status`, naming the command. It is registered in
  the harness's own `.claude/settings.json` alone, never in the set
  `sync-settings` writes into a consumer (stage 2, question 28 a″), as
  `work-finish`'s ready guard is.
- `core/feature-workflow.md` names the command where it says the eight
  statuses are moved by hand, and the README says the ask integration needs
  *Update content*.

Not in this change, each by roadmap clarification 11 (protection only where a
failure showed the threat): the order of the statuses — `approved` to
`archiving` passes when the WIP limit has room, and a scenario pins it; the
card's board against the board the tree decides — a card on another board
whose `Pointer` names a slug this tree also holds is proven by it, as a wrong
`--card` is in `work-finish`; the connector's other writes (`notion-create-pages`
with a `Status`, `Assign`, the body), and a write handed to another tool. Also
not here: the card text validator (card `3f639875c31b812fa7e6e5358fe596bb`), a
later change of its own; moving `Assign` into the bot; the VPS bot's settings
(roadmap stage 5, question 20); the board loop's pick write, which stage 7
removes.

Order: this change applies after `work-finish` group 2, which adds `finish`
to the same `bun/work.ts` dispatcher and the first harness-only hook
registration to `.claude/settings.json`; it is kept in this prose rather than
`after:`, since `work-finish` is not archived.

## Capabilities

### New Capabilities

- `work-status`: the command a session moves a card's status with, the
  evidence and the WIP limit it checks, and the hook that keeps the
  connector's `Status` write its own in the harness.

### Modified Capabilities

- `gate-ledger`: *Every gate refusal is recorded* names `work.ts status` and
  the status guard beside the gates `work-finish` adds.

task-board is not modified: its eight hand-moved statuses stay moved by
whoever does the work, and the command is the hand.

## Impact

- New: `bun/work-status.ts`, `bun/status-guard.ts`, and their tests.
- Changed: `bun/work.ts` (the `status` subcommand and its usage line),
  `bun/work-take.ts` and `bun/board-state.ts` (the `Pointer` and archive
  patterns exported, not copied), `.claude/settings.json` (the harness-only
  registration), `bun/self-pin.test.ts`, `core/feature-workflow.md`,
  `README.md`.
- Notion: the ask integration (khepri-local) needs *Update content*, which the
  user grants (card assumption 7); one page read, at most one data source
  query and one page write per call.
- Git: one `git fetch origin main` and one `git archive` of
  `openspec/changes` per call that needs evidence.
