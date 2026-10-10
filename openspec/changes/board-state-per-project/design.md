# board-state-per-project — design

## Context

See proposal.md, *Why*. Three facts shape the approach.

- `boardState(tree)` takes the tree as a parameter. Only the command entry,
  `import.meta.main`, reads `root`, so the function can be pointed at any
  repository without change.
- `bun/config.ts` reads one key of the consumer's `"harness"` object and
  throws, naming the key, when it is absent. Every gate that carries a
  project's own value uses it.
- `bun/board-state-hygiene.test.ts` pins two things this change touches. The
  derived output names no board, and the module imports `node:fs`,
  `node:path` and `./root.ts` and nothing else. Both cases cite *A card on a
  board whose tree is elsewhere* and *The derivation reaches no network*, and
  the delta keeps both scenario headings, so the citations still resolve.

### Measured on every consumer

`core/feature-workflow.md` asks for a measurement against every consumer's
tree before a change to a shipped tool is proposed. Each tree was read on
2026-10-10 from the repository's default branch, through the GitHub API,
and passed to `boardState` from this branch's base:

| Repository | `harness` keys today | Slugs | Derived |
|---|---|---|---|
| harness | `diffBudgetExclude` | 10 | 5 `proposed`, 1 `proposing`, 4 `done` |
| dota2 | `diffBudgetExclude`, `mutationFloor`, `rootFiles`, `suppressions`, `uncitedFloor` | 47 | 13 `proposed`, 34 `done` |
| mellon | `diffBudgetExclude`, `rootFiles`, `suppressions`, `uncitedFloor` | 0 | — |

None of the three carries `board`, and none fails today. No consumer calls
`bun/board-state.ts` from a script or from `harness:check`. dota2's own
`scripts/` no longer holds a copy since the extraction. So adding the key
breaks nothing until a session runs the command, and that run fails naming
the key, which is the intent.

## Decisions

### The config holds a name, validated as a name

`harness.board` is a string naming a board as `task-board` names them.
`bun/board-state.ts` refuses a value carrying `://`, or a UUID in either
case and with or without hyphens. The refusal names the key and does not
echo the value: a refused value is exactly the one that must not travel
further, into CI logs for instance.

*Alternative: hold the data-source id and skip the name lookup.* Refused. The
id is an identifier for private content in a public repository, which
`task-board`'s *The boards are named where a session chooses its next task*
already forbids for `core/feature-workflow.md`, on the same grounds.

*Alternative: refuse every value outside `D2ASS`, `Harness`, `mellon`.*
Refused. That enumerates the boards in the gate, so a fourth project would
need a harness release to name its own board. The shape check is what
guards the public repository; the name itself is the project's business.

### The command prints the board; the function stays as it is

`boardState(tree)` keeps its signature and its output. The entry point
reads `harness.board` through `bun/config.ts`, validates it, and prints
`{ board, status, edges }`. Fabricated-tree cases therefore need no
`package.json`. The hygiene case *the output names no board* still holds for
`boardState`. A new case pins that the command names exactly its own board.
The import allow-list gains `./config.ts`, whose own imports are `node:fs`
and `node:path`, and the case that walks the one imported module's imports
walks this one too.

*Alternative: pass the board into `boardState`.* Refused. The function has no
use for it, and every fabricated case would have to invent one.

### The agent compares; the script derives

At the board read, the session already holds the cards from `Board view`.
It runs the command, and for each card whose `Pointer` is wholly
`openspec/changes/<slug>/` or `openspec/changes/archive/<date>-<slug>/`, it
compares the card's status with the floor printed for that slug. It sets a
card behind its floor with `update_properties`, re-reads it, and reports the
correction. That is the existing rule in `core/feature-workflow.md`, which
this change does not restate.

Three kinds of card are treated differently:
- A card whose pointer has the cross-repository form,
  `<repo>: openspec/changes/<slug>/` with nothing after the path, is skipped
  silently. Its tree is elsewhere, and the form says so.
- A card whose pointer is empty, or carries text around a path, is listed
  rather than compared.
- A card whose pointer names a slug the tree has no directory for is listed
  as missing from the tree. That is *A card and the tree disagreeing* read
  from the other side, and the session reports it rather than guessing a
  status.

### The same comparison runs at the wrap-up

`session-wrapup` step 3, *Workflow state*, already names the stage the
session's work reached. It now also runs the command and compares the cards
whose pointers name the change directories the session touched. It corrects
each card behind its floor with `update_properties`, re-reads it, and reports
the correction beside the stage. Step 3 is where the skill already reads
OpenSpec state. The sibling changes `gate-decision-ledger` and
`capture-as-mechanism` edit steps 2 and 5, so the three edits do not collide.
Whichever of them merges last keeps all three.

The skill's rule that everything other than the save point and the yield
ledger is a report gains one exception: the card corrections step 3 makes.
Without it, the skill's own rules would forbid the reconciliation.

*Alternative: reconcile the whole board at the wrap-up.* Refused. The board
read at the start of the next session already covers the whole board. What
the wrap-up adds is the session's own cards, caught before anyone else reads
them.

### Cross-repository pointers have one form

The form is the repository's name as its owner calls it (`harness`, not a
URL), then `: `, then the path. It is stated as the one exception to the
repository-relative path *A board records a task's status and nothing the
tree holds* fixes, rather than as a copy of that requirement in the delta,
which would put it past the diff budget for one sentence. The two consumer
cards for `ship-turn-gate-to-consumers` carry `— task 3.1` and `— task 3.2`
after the path. They are rewritten in group 2, with the task number moved
into the body. The writes use `update_properties` and are followed by a
re-read.

*Alternative: a `Repo` property beside `Pointer`.* Refused. Every board would
need a schema change, for two cards today, and one instruction would then
read two properties to find one path.

*Alternative: a script that takes the cards on stdin and prints the
corrections.* Refused for now (proposal, *Non-goals*). Board content would
enter a process the test suite exercises, to compare positions in a list of
nine.

### The post-condition hook belongs to the policy-gate change

The 2026-10-10 failure was a Notion update whose command was
`update_content`, carrying `properties` that the connector dropped without an
error. A `PreToolUse` hook on that tool, refusing `properties` beside any
command but `update_properties`, would have stopped it before the call. The
harness registers no matcher but `Bash`, and `bun/settings.ts` pins each
registration it does carry. The policy-gate change is the one that opens a
non-`Bash` matcher and decides how such registrations are pinned, so this
change leaves the check to it. The re-read after a write stays the prose
obligation, because no hook can read a board.

## Risks / Trade-offs

- [The comparison is still the agent's, so a session can skip it] → it runs
  in the turn the session already reads the board, and its report has a
  fixed shape: corrected, listed, missing. A skipped run shows as a missing
  report, not as a quiet board. The policy-gate and observability changes
  are where skipping would become visible to a mechanism.
- [A consumer leaves the key out] → the command fails naming it on the first
  run, and `harness:check` is deliberately not made to require it (proposal,
  open question 1).
- [`session-wrapup` runs only when the user invokes it] → a session nobody
  wraps up is not reconciled at its end. The next session's board read
  catches the card, one session late, which is the floor this change keeps
  from today.

## Migration Plan

Group 1 lands in the harness: the key here, the command, the tests and the
prose. Group 2 is one change in each consumer, made in the pull request that
bumps its pin past group 1: dota2 adds `"board": "D2ASS"`, mellon adds
`"board": "mellon"`. Nothing fails between the two groups, because nothing
runs the command unprompted. Rollback is reverting group 1. A consumer's key
is then unread, and no consumer check reads it.
