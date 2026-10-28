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

**Deviation from the stage's letter.** *Потом* 6, question 30's revision of
2026-10-26 and the card's title say "by goal-check's verdict". This change runs no goal check: `bun/goal-check.ts`
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
  - `proposed`, `applied` or `done` that `origin/main`, fetched first and
    never the local tree, does not prove for the change the card's `Pointer`
    names wholly — `applied` needing every task group of `tasks.md` ticked;
  - any read that fails — the fetch, the tree, the card, the board's query.
- A `PreToolUse` hook refuses a connector `notion-update-page` call whose
  `properties` carry `Status`, naming the command, registered in the
  harness's own settings alone (stage 2, question 28 a″), as `work-finish`'s
  ready guard is.
- `core/feature-workflow.md` and the README name the command, and the ask
  integration's *Update content*.

Not in this change, by roadmap clarification 11 (protection only where a
failure showed the threat): the order of the statuses, which a scenario pins
as unchecked; the card's board against the tree's, as a wrong `--card` in
`work-finish`; the connector's other writes (`notion-create-pages`,
`Assign`, the body). Also not here: the card text validator (card
`3f639875c31b812fa7e6e5358fe596bb`), a later change; `Assign` in the bot; the
VPS bot's settings (stage 5, question 20); the board loop's pick write, which
stage 7 removes.

Order: this change applies after `work-finish` group 2, which adds `finish`
to `bun/work.ts` and the first harness-only hook registration. The order is
met — group 2 merged (#332) and `work-finish` is archived — so it needs no
`after:`.

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
- Git: one `git fetch` of `origin`'s `main` and one `git archive` of
  `openspec/changes` per call that needs evidence.
