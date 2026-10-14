# board-state-per-project

## Why

`task-board` confines derivation to `D2ASS`: *Three statuses are derived and
six are moved by hand* says it is "the only board whose tree is this
repository", so every card on `Harness` and `mellon` is hand-moved. That was
true when the harness lived inside d2ass. It has not been true since the
harness moved out: each consumer now runs `bun/board-state.ts` from its own
root, and the harness's own tree is the tree the `Harness` board's cards
point at.

The code already derives for any tree. Measured on 2026-10-10:

| Tree | Slugs derived | Board its cards sit on |
|---|---|---|
| harness, this branch's base | 10 (5 `proposed`, 1 `proposing`, 4 `done`) | `Harness` |
| dota2, default branch | 47 (13 `proposed`, 34 `done`) | `D2ASS` |
| mellon, default branch | 0 | `mellon` |

So what is missing is not a derivation. It is a project naming the board its
tree decides, and a moment at which the comparison actually runs. Without
those, the `Harness` card for `ship-turn-gate-to-consumers` read `proposed`
for two days after the change was archived, and nothing would have noticed:
the floor the tree derives for it is `done`.

## What Changes

- A `harness.board` key in each project's `package.json`, typed in
  `bun/config.ts`, holding the **name** of the board whose cards the
  project's tree decides: `Harness` here, `D2ASS` in dota2, `mellon` in
  mellon. A name and never an address. This repository is public and the
  boards are not, so a value carrying `://` or a UUID is refused.
- `bun/board-state.ts`, run as a command, prints that name beside the
  statuses and edges it derives, and fails naming the key when it is absent.
  `boardState(tree)` itself does not change.
- A reconciliation has two moments, and the session runs `bun/board-state.ts`
  at each of them:
  - at the `Board view` read, when the session chooses its work;
  - at `session-wrapup`'s *Workflow state* step, for the cards that the
    session's own changes point at. This catches, in the same session, a
    stage that moved without its card.

  Each moment corrects every card whose `Pointer` names a change directory of
  this tree and sits behind the derived floor, and reports each correction.
- A card for work whose change lives in another repository gets a pointer
  form of its own, `<repo>: openspec/changes/<slug>/`. That is the repository's
  name and the path, with nothing after it. A task number goes in the card's
  body. The reconciliation recognises this form and skips it silently: it is
  neither compared against the local tree nor listed as malformed. The cards
  that carry the old `harness: openspec/… — task 3.1` form are rewritten into
  it.
- `core/feature-workflow.md` stops saying derivation holds "only on `D2ASS`"
  and that every card on `Harness` or `mellon` is honoured rather than
  mechanised. Each board is derived from its own repository.
- dota2 and mellon each add the key, in the pull request that bumps their pin
  past this change.

## Non-goals

- **Mechanising the re-read after a card write.** No hook can re-read a card:
  a board is read through the connector, and a hook has none. What a hook
  *can* catch is the call that loses the write, which was the 2026-10-10
  failure: `properties` handed to a Notion update whose command is not
  `update_properties`. That check is the change `notion-update-guard`'s,
  whose hook sits on a `PreToolUse` matcher for the Notion update tool. The
  re-read stays the obligation `core/feature-workflow.md` states.
- **Comparing in code.** The agent compares the cards it read with the floors
  the script printed. Feeding a card list into a script would put a board's
  content into a process this repository's tests exercise, for a comparison
  of nine ordered names.
- **Reconciling a cross-repository card.** A dota2 card whose subject is a
  harness change is still reconciled from nowhere. The cross-repository form
  makes it recognisable, not derivable: dota2's tree lacks the directory, and
  the harness's reconciliation does not read `D2ASS`. Each project checks its
  own board first, and only its own.
- **Folding the cross-repository form into *A board records…*.** That
  requirement fixes the pointer as a repository-relative path. The added
  requirement here states the cross-repository form as the one exception to
  it, rather than copying the whole requirement into this delta. Rewording it
  belongs to the card the next non-goal names.
- **The rest of `task-board`'s d2ass-relative wording.** *A board records a
  task's status and nothing the tree holds* still exempts `Harness` and
  `mellon` cards from gaining a pointer "since their trees are not here".
  *A card names what blocks it* still speaks of "the repository `Harness` is
  leaving for". Both are now false read from the harness, and neither
  decides what this change builds. They go to a card of their own on
  `Harness`, *Task-board wording still reads from d2ass*, rather than
  doubling this delta.

## Open questions for the user

1. **Should `harness:check` require `harness.board`?** If yes, a consumer
   without the key fails its check on the pin bump. If no, only
   `bun/board-state.ts` fails, and only when it runs. This proposal takes no:
   a project that keeps no board still passes its check.

## Settled with the user

- **Where the guard on a lost card write lives:** in neither this change nor
  `policy-gate-beyond-bash`, whose non-goals exclude board writes. It is the
  change `notion-update-guard`.
- **When reconciliation runs:** at the board read and at `session-wrapup`,
  rather than at the board read alone. The wrap-up is where a session that
  moved a stage but not its card is caught, before the next session finds it.
- **Pointers that break the format:** rewrite them, rather than list them on
  every run. Cross-repository work gets the defined form above, and the
  existing cards are moved onto it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-board`:
  - *There are three boards and a card goes to one of them*: a repository
    names its own board, and "no tree here" is relative to that name.
  - *Three statuses are derived and six are moved by hand*: derivation
    applies to the board the running repository names, not to `D2ASS` alone.
  - Added: *A repository names the board its tree decides*.
  - Added: *A card for another repository's change points across*.

## Impact

- `bun/config.ts`, `bun/board-state.ts` and its hygiene test, which today
  asserts that the output names no board and that the module imports only
  `node:fs`, `node:path` and `./root.ts`.
- `package.json` here gains `"board": "Harness"`.
- `core/feature-workflow.md`: two passages of the board bullets.
- `core/skills/session-wrapup/SKILL.md`: step 3 runs the reconciliation. Its
  rule that everything else is a report gains the card corrections.
- dota2 and mellon: one key each, in their next pin bump. Their cards with
  old-format pointers are rewritten in the same group.
