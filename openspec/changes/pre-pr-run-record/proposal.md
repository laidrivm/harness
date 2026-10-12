# pre-pr-run-record

## Why

`bun/turn-gate.ts` refuses a turn that completes a task group and ends
without the pre-PR sequence's gate lines, and `core/review-toolkit.md` says
of it, "a gate line reports the sequence — it does not prove it ran". With
the user present, a reader catches a gate line that was written but not
earned. With nobody reading, as in an unattended run, the line is the whole
of the evidence, and it is text the agent writes. A gate decision only a
script can make has to leave a record the script writes, and the turn gate
has to read that record rather than the message.

The card behind this change asks for the whole pre-PR sequence to run as code
that calls an agent only where judgement is needed. This change is the first
step: the smallest runner that leaves a record, and a turn gate that reads it.
The steps that need judgement keep reporting through their gate lines until
the follow-ups listed under *Non-goals* move them.

## What Changes

- A runner, `bun/pre-pr.ts`, runs the sequence's deterministic step, the diff
  budget. It prints that step's own gate line and exits with that step's
  status. It writes one record of the run to the gate ledger that
  `gate-decision-ledger` adds, naming the commit the run read. It writes no
  record when tracked files differ from that commit, because the record would
  then name a tree the run did not see.
- The turn gate's condition gains a clause. A turn that completed a task group
  and ends with a gate line must also have a runner record for the commit its
  work is read from, written in this checkout. Another clone at that commit
  measured against its own base refs. Otherwise the gate refuses, and the
  refusal names the runner's path. A named `BLOCKED` ends the turn as it does
  today.
- The pre-push hook and CI keep calling `bun/diff-budget.sh` directly, never
  the runner. A push therefore writes no record and cannot discharge the
  sequence, which `commit-gates` already refuses to let a push do.
- `core/review-toolkit.md` names the runner as step 1, and as the last command
  after the sequence's final commit. Its line saying a gate line does not prove
  the sequence ran is narrowed: the record proves the deterministic step ran at
  that commit, and the judgement steps are still only reported.

## Non-goals

These are named follow-ups, each a card of its own:

- **The runner owns the branching.** That means choosing between the code path
  and the docs path, running `/warm` when a manifest changed, and running
  `bun test` when `openspec/changes/` gains or loses a directory. All of it is
  read from the diff, and the runner prints which judgement steps remain.
  `core/review-toolkit.md` then keeps only the reason for each step.
- **The runner runs the project's own checks** (tests, typecheck), taken from
  `"harness"` keys as `bumpTest` is. The same list then serves pre-push, CI
  and the runner.
- **The judgement steps record their own outcome.** Each skill's verdict
  reaches the runner as typed output, so the turn gate can stop reading gate
  lines.
- **Verdict before fix.** In `/coderabbit-local`, `/coderabbit` and
  `code-review`, an agent that will not fix the finding first decides whether
  it is real.
- **Ticks by result.** A task's `Verify:` line is run and the box is ticked
  from the result, or the turn gate checks the ticks against the record.
- **Swarm.** The runner runs as the unit of work an executor or orchestrator
  takes, both headless and interactive.

## Capabilities

### New Capabilities

- `pre-pr-runner`: what the runner runs, what it records and when, and what it
  leaves to the agent.

### Modified Capabilities

- `commit-gates`: *A turn that commits reports its gates before it ends* also
  requires a runner record for the turn's tip. Its paragraph refusing to claim
  that the sequence ran now claims the deterministic step and nothing more.
- `gate-ledger` (added by `gate-decision-ledger`): *A record holds no command
  text* admits one more field, the commit a decision read. It is set only by
  a gate that reads one.

## Impact

- New `bun/pre-pr.ts` with tests. `bun/turn-gate.ts` reads the ledger on the
  one path where a group completed and the message carries a gate line.
- `core/review-toolkit.md`, `README.md` (the *Consuming* line on the turn
  gate), and the header comment of `bun/turn-gate.ts`.
- Consumers: on their next pin bump, the turn gate asks for the runner at
  `node_modules/harness/bun/pre-pr.ts`. Nothing new is registered, and no
  script is added to their `package.json`.
- Order: this applies after `gate-decision-ledger` step 2 merges, because both
  edit `decide()` in `bun/turn-gate.ts` and this one needs the ledger's writer.
  It archives after `gate-decision-ledger`, whose `gate-ledger` requirement
  this change modifies.
- Closest existing artefacts: `gate-decision-ledger` (the journal this writes
  to, and the only one) and the archived `2026-10-08-pre-pr-sequence-gate`
  (the turn gate this narrows).
