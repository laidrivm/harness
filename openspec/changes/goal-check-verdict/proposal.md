# goal-check-verdict

## Why

`board-loop`'s first live pass (2026-10-14) recorded four verdicts at one
commit: the stage session's `goal-check apply` read `met`, then `open`, then
`met`, and the runner's copy of the same pinned file read `open` and recorded
the pass `loop open`. The session took the step as done and the runner did
not. A verdict that flips at one commit cannot end a pass.

Everything the check reads but one is fixed by the commit: the tree at
`HEAD`, whether the tracked files match it, and the `pre-pr` record for
the pair of that commit and its checkout. The odd one out is the pull request,
read through `gh pr list --head <branch> --state open`. It flips in two ways:

- **A failed read.** In the session's transcript `gh` failed on a TLS
  handshake timeout, and that same call printed `goal open: … — the pull
  request's state could not be read`. The repeat eight seconds later read
  `met`. The runner's `open` thirty seconds after that is put down to the same
  failure. The runner prints its reason only to the terminal, so this one
  is inferred: every other input was ruled out.
- **A merge.** The condition asks for an *open* pull request, so the moment
  the user merges one, the same commit reads `open` for good. The live run
  reproduces it: the step's pull request has merged, and the check now reads
  `no open pull request for feat/drop-mutation-exemptions-1`.

## What Changes

- The pull request condition holds when a pull request on the branch has
  `HEAD` as its head and is open **or merged**. The check reads every
  state (`--state all`) and the state of each pull request. A pull request
  closed without a merge still leaves the stage `open`.
- A failed read of the pull request is tried again a bounded number of times,
  with a pause between tries, before the check reports that the state could
  not be read. An unknown state is still never `met`.
- The open line's wording follows: `no open or merged pull request for
  <branch>`, and `the pull request's head is <short>, not <short>`.
- After this, the verdict for one stage, change, step and commit rests on the
  tree at `HEAD`, a clean checkout, the `pre-pr` record, and whether GitHub
  holds a pull request of this branch at `HEAD` that is open or merged. The
  one input left that can still vary is `gh` staying unreachable through
  every try, and the line names it.

### Non-goals

- **A third outcome, `unknown`.** A new exit status for an unreadable state
  would make the runner's count cleaner. It also changes the 0/1/2 exit
  contract, the turn gate's reading and two specs. It waits until the retry
  proves not to be enough.
- **Caching a verdict per commit.** A ledger record names no change or step,
  and `stage-goal`'s *Two targets at one commit* forbids deciding from one.
  A cache would also let a session judge itself, which the runner's pinned
  copy exists to prevent.
- Retrying in the runner alone, trusting the session's `met`, reading CI or
  CodeRabbit, or dropping the pull request from `apply`. Each was weighed in
  the card's exploration and rejected. The flip happened inside the session
  too, a second reader would add new inputs that vary, and the pull request is
  part of what a step delivers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stage-goal`: *A stage is done when the check says so* accepts a merged
  pull request at `HEAD` as well as an open one, adds a scenario for each of
  a merged one and a closed one, and states the retry in *The pull request
  cannot be read*.

## Impact

- `bun/goal-check.ts`: `pullRequest()` changes its query, its condition
  and its wording, and gains the retry.
- `bun/goal-check.fixture.ts`: the stub `gh` answers the new query, can
  fail a set number of times before it answers, and the check runs with no
  pause between tries.
- `bun/goal-check-io.test.ts`: the case titled *no open pull request, a
  closed or merged one at `HEAD`, is open* stops holding, since a merged one
  is now `met`. It is split into a merged case and a closed one, and new cases
  cover the retry.
- `openspec/specs/stage-goal/spec.md`: one requirement modified.
- `board-loop` needs no edit. Its runner reruns the pinned check, and a
  consumer receives the fix with its next pin bump.
