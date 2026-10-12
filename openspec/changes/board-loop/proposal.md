# board-loop

## Why

The user wants to start the work once and have it run on its own, taking the
project's cards from left to right across the statuses and from top to bottom
by priority, and finishing what is already in progress first. Every stage
already exists as a command, and `core/feature-workflow.md` already states the
rule for choosing work: take the first card of its column that is not blocked,
in the order `Board view` returns. Only an interactive session carries that
rule out. Nothing takes the next card, runs its stage, checks the result and
moves on.

The changes proposed around this one each supply one piece of an unattended
stage. None of them launches one:

- `board-state-per-project` names the board a tree decides, as `harness.board`.
- `stage-goal` gives each stage its done-check, `bun/goal-check.ts`, and its
  launch form. It leaves "choosing and launching the next stage" to this card.
- `loop-guard` and `stage-goal`'s ceiling end a session that goes round in
  circles. Both leave wall-clock time to "whatever launches the session".
- `agent-autonomy` says a session is unattended only when its starting prompt
  says so.

This change is the launcher. Its first form is the smallest one that does a
whole pass for one card. It takes a card whose proposal has merged, carries
its next apply step in a fresh session under that step's goal until the pull
request is open, and records the verdict.

Claude Code's classifier refuses a session that launches `claude -p`
sessions. A script the user starts is not a session, so the loop is the
user's script. It runs in a clone of its own, which keeps it away from the
user's interactive checkout without needing worktrees.

## What Changes

- A new script, `bun/board-loop.ts`, run by the user from the root of a
  dedicated clone (`bun node_modules/harness/bun/board-loop.ts` in a
  consumer). Each run is one **pass**:
  1. It refuses to start inside a Claude Code session, on a tracked tree
     that differs from `HEAD`, or on a branch whose tip no remote holds.
     Otherwise it returns the clone to the default branch's fetched tip.
  2. It collects the **takeable** changes from `bun/board-state.ts`. A change
     is takeable when it is `proposed`, nothing it names in `after:` is still
     open, `tasks.md` still has an unticked group, and no open pull request
     sits on that group's branch. While a step's pull request waits for the
     user's merge, the pass takes another change.
  3. It picks one of them. In step 1 the user names the change. In step 2 a
     short pick session reads `Board view` and names the first takeable card
     in the board's own order. The runner accepts only a name from its own
     list.
  4. It launches the change's next apply step as a fresh `claude -p`
     session: unattended, in auto mode with nobody to answer prompts, set up
     with `stage-goal`'s launch form, and stopped at a wall-clock limit. The
     session follows the workflow as written: branch, apply, pre-PR sequence,
     push, pull request, card moved.
  5. It runs the step's goal check itself and reads the verdict from it,
     never from the session's exit status. It writes one gate-ledger record
     per pass, prints one line, and exits with the outcome.
- `README.md`'s *Consuming* section names the runner: who starts it, from
  where, and what one pass does.

## Non-goals

These are the next slices, each a card or a follow-up step of this one:

- **Repeating the pass.** The loop runs one pass and stops. Running pass after
  pass is the next slice. That slice also covers the reasons a loop waits or
  stops: no work left, every card blocked or waiting on a question, the plan's
  rate limit close (`rateLimits`), and a session that `loop-guard` or the
  ceiling ended.
- **Pull requests and CI on each pass.** A change whose pull request is open
  is skipped here, not worked. Ranking it first once a review arrives or CI
  finishes, and launching `/coderabbit` or a fix, is a later slice.
- **The explore, propose and archive stages.** This slice carries apply steps
  only. Explore and propose are where the loop asks the most questions, so
  they wait for `agent-autonomy` and `card-questions` to land. Archive waits
  for a change to reach `applied`.
- **Checking the card move.** The stage session moves its card, as
  `core/feature-workflow.md` requires of any session. The runner cannot read
  the board, because the script holds no token. A later pick session that
  reads the card back is the follow-up.
- **Dependencies between idea cards.** An idea card has no change directory,
  so it has no `after:`. That belongs to the card *Label board cards by kind
  and show them as a dependency tree*.
- **Phase B of the roadmap:** an orchestrator on a VPS, routines, GitHub
  events as triggers, worktrees and several cards at once (the card *Run
  several changes in parallel*), and approving or merging without the user.
  A pull request always waits for the user's merge.

## Ordering

`after:` names `gate-decision-ledger` and `board-state-per-project`, the two
changes this builds on whose directories are on `main`. The others are still
open pull requests, and `board-state` refuses an `after:` entry with no
directory:

- `stage-goal` (harness#65) provides the check and the launch form;
- `pre-pr-run-record` (harness#57) provides the record that check reads;
- `agent-autonomy` (harness#63) defines what "unattended" means in the stage
  prompt;
- `card-questions` (harness#56) gives a blocked session somewhere to leave its
  question;
- `loop-guard` (harness#66) ends a session that repeats a failing call, and
  leaves wall-clock time to this runner.

Task 1.0 adds each of these to `after:` once its directory lands on `main`.

## Capabilities

### New Capabilities

- `board-loop`: who starts the runner and from where, which changes a pass
  may take and in what order, how a pass launches a stage, and how it records
  the outcome.

### Modified Capabilities

None. `task-board`'s *A column is a queue the user orders* and *A card names
what blocks it, derived from the tree* already fix the rule this runner
applies. Its requirements cite them rather than modify them.

## Impact

- New `bun/board-loop.ts` with tests. It reuses `boardState()`, `turn-gate.ts`'s
  `complete()`, and the ledger writer from `gate-decision-ledger`.
- `README.md`: one *Consuming* line.
- Consumers gain the script on their next pin bump. Nothing is registered,
  and `check.ts` does not run it. This is no gate change, so no consumer tree
  is measured.
- Closest existing artefacts: `stage-goal`, whose launch form and check this
  runner calls, and the board-choice bullet in `core/feature-workflow.md`,
  whose rule it carries out.
