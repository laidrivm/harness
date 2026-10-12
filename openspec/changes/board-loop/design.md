# board-loop — design

## Context

The motivation is in proposal.md, *Why*, and the requirements are in
`specs/board-loop/spec.md`.

What a pass is built from, and where each piece comes from:

```
user's terminal, dedicated clone (CLAUDECODE unset)
  bun bun/board-loop.ts
   |
   |-- refuse | fetch, switch to default, merge --ff-only        (git)
   |-- bun install --frozen-lockfile                            (self-pinned-gates, #64)
   |-- takeable list                       bun/board-state.ts  (main; `board` key: #53)
   |      + first unticked group                turn-gate.ts groups()
   |      + no open PR on its branch, none closed  gh pr list
   |-- pick: argument (step 1) | pick session (step 2)        claude -p, Board view
   |-- stage session: launch form, unattended  claude -p       (stage-goal, agent-autonomy)
   |      branch, /opsx:apply, pre-PR, push, PR, card moved    (the session, as written)
   |-- verdict: bun/goal-check.ts apply <slug> <n>             (stage-goal, #65)
   '-- one record: loop/<outcome>/apply                        (gate-decision-ledger)
```

Measured on Claude Code 2.1.296 (`claude --help`, 2026-10-12):
`--permission-mode` takes `auto`, `--permission-prompts none` denies anything
that would prompt and leaves the mode to decide the rest, and `CLAUDECODE=1`
is set in a session's Bash environment. The board can be read only through
the Notion connector, which a session has and a script does not.

## Goals / Non-Goals

**Goals:** one pass that is correct on every path, including refusal and
idleness, and that leaves a record a person or the next slice can read. Every
judgement the pass needs is taken from code: what is takeable, which step it
is, and whether the step is done. The only exception is the board's order,
which only a session can read.

**Non-Goals:** reading or writing the board from the script, a second
journal, and resuming a session. The proposal's *Non-goals* name the slices
that come next.

## Decisions

### The runner is the user's script, and refuses to be anything else

The classifier refuses a session that launches `claude -p`. Refusing
`CLAUDECODE` makes the boundary hold in the script itself: an agent that runs
the runner from its own Bash gets a refusal before any session starts,
instead of reaching the classifier, or not reaching it. The variable's
presence is the signal, whatever its value.

- *Alternative: rely on the classifier.* It judges the agent's command line,
  and `bun bun/board-loop.ts` names no `claude -p`.

### A dedicated clone, returned to the default branch by fast-forward only

The clone is where every pass works, so each pass starts by making it the
default branch's tip. It never discards anything to get there. A tracked
edit or an unpushed tip means the previous session left work, and that is the
user's to look at (`git-and-prs.md`: never move off unpushed work). A
fast-forward that fails means someone committed in the clone, which is
equally theirs.

- *Alternative: a worktree per pass.* That is phase B, and a worktree's
  absolute `GIT_DIR` already broke a push hook here once (`rules.md`, Safety).

### The runner installs, so no session has to

A consumer's hooks run from `node_modules/harness/`. Once
`self-pinned-gates` (harness#64) lands, the harness's own hooks do too, so
every clone needs `bun install` before a session's gates work. `bun install`
is a deliberate `ask` in the tracked policy, for supply-chain reasons, and
under `--permission-prompts none` an ask is a refusal. A session that had to
install would stall at its first command. The user agreed (2026-10-12) that
the runner, being their own script, runs the install in its clone. It does
so after every fast-forward and before any session, because a fast-forward
can bring a moved pin. It uses `bun install --frozen-lockfile`, so the install
takes exactly what `bun.lock` records and fails rather than resolving anew.
That is the form the bootstrap already lets through and that CI runs. A
failed install refuses the pass. On a tree with no dependencies and no
lockfile, which is the harness before #64, the frozen install exits 0
(measured with bun 1.4.2), so the runner runs it unconditionally.

- *Alternative: allow `bun install` for the runner's sessions with
  `--allowedTools`.* That hands the supply-chain decision to the session the
  `ask` exists to stop, and it would install from whatever the session had
  edited.
- *Alternative: install only when `bun.lock` changed in the fast-forward.*
  That saves a few seconds, but leaves a clone whose `node_modules` was
  removed or never made without its gates.

### Takeable is computed in code, from the tree and `gh`

Everything except the board's order can be read without a session:
`boardState()` gives `proposed` and `blocking`, the ticks give the step, and
`gh pr list --state all --head <branch>` gives the pull requests. The step is
counted as `stage-goal` counts it: the n-th `## ` group, with the first group
holding an unticked box as the next step. `turn-gate.ts` exports its group
parser, so the box test has one definition. A `gh` failure makes the change
untakeable, never "no PR": a missed open PR would launch a second session on
a branch that is under review.

- *Alternative: let the stage session decide whether its card is takeable.*
  Then a whole session is spent before finding that a pull request is waiting.

### The board's order comes from a pick session, checked against the list

The user's drag is the only ranking instrument (`task-board`), and only a
session can read it. In step 2 a short `claude -p` session, with no goal and
nothing to write, reads `Board view` for the board `harness.board` names. It
is handed the takeable list and returns one `PICK: <slug>` line. The runner
treats that line as untrusted input: one exact line, and a slug from its own
list. In step 1 the user names the change instead. That is the seam's working
stub (`change-slicing`, *A seam between steps carries a working stub*): it
honours the user's order because the user is the one choosing. Step 2 removes
the argument.

- *Alternative: take changes in alphabetical or `board-state` order.* That
  overrides the user's order, which `task-board` forbids.
- *Alternative: one session that picks and then carries the stage.* The goal
  has to name the change when the session starts, and the pick is what
  decides the change.

### The stage session: launch form, auto mode, no prompts, three hours

The runner composes no condition of its own. It uses `stage-goal`'s launch
form (`core/feature-workflow.md`, *Unattended stages*, once `stage-goal`
step 1 lands) with stage `apply`, the change and the step, prefixed by the
declaration `agent-autonomy` requires. The flags are `--permission-mode auto`
and `--permission-prompts none`, which is the mode the unattended run of
2026-10-12 worked in. A call that would prompt is refused, and the session
reports it as `BLOCKED`. Neither `bypassPermissions` nor
`--dangerously-skip-permissions` is ever passed.

The launcher owns time, as `stage-goal` and `loop-guard` both leave it. The
limit is three hours, and the spec fixes it. The 2026-10-12 overnight run's
propose and apply sub-agents finished well within that. A session past it is
not converging, and the ceiling cannot see a single turn that never stops.

- *Alternative: `--max-turns`.* It counts model calls, which are not a
  measure of time, and `stage-goal` leaves it optional for a launcher.

### The verdict is the check's, run by the runner

`claude -p` exits 0 whether or not a goal was met (`stage-goal`, measured).
So the runner runs `goal-check.ts apply <slug> <n>` itself after the session
ends, and takes the outcome from its last line. That run also writes the
check's own `goal` record with the commit, so the runner's `loop` record
carries no commit and holds only the outcome of the pass: `met`, `open`,
`timeout`, `idle` or `refused`. The ledger is the only journal
(`gate-decision-ledger`). The exit status is 0 for `met` and `idle`, and 1
otherwise, so a shell loop around the runner can stop on the first pass that
needs a person.

### The card is the stage session's to move

The script cannot write the board. The session already has to move the card
in the same turn as the stage (`core/feature-workflow.md`, *Move the card*),
and its prompt says so. Checking that move from outside the session is the
named follow-up.

## Risks / Trade-offs

- [The Notion connector may not load in `claude -p`, or auto mode may refuse
  its reads] → Task 1.6's live pass records whether the card moved. If the
  stage session cannot move it, the pull request still opens. Only the card
  lags, and the next interactive reconciliation reports it
  (`board-state-per-project`). Task 2.4 records whether the pick session can
  read `Board view`. If it cannot, it returns no single `PICK:` line, and the
  pass records `refused` and launches no stage session. Without the board
  there is no order to honour.
- [Three hours is a judgement] → The limit has one site. The `timeout` count
  in the ledger is what would move it.
- [A pick session that reads the board also reads text that a card's author
  wrote] → Only its `PICK:` line is used, and only when it names a slug the
  runner had already computed as takeable.
- [`goal-check.ts` is absent because `stage-goal` has not landed] → Group 1
  applies after it (task 1.0). Until then, the runner has no verdict to read.

## Migration Plan

Apply after `stage-goal` step 1, `pre-pr-run-record`, `agent-autonomy` and
the `board` key of `board-state-per-project` step 1 merge, in two steps.
Step 1 is the pass for a change the user names. Step 2 is the pass that picks
in the board's order. Nothing is registered, so rolling back means deleting
the script. The `loop` records left in the ledger stay behind, unread.
