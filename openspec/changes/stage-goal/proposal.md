# stage-goal

## Why

An unattended run carries one OpenSpec stage of one change: a proposal, a step
of an apply, an archive. Nothing makes the session stay until that stage is
done. It ends when the model judges the work finished, which can be halfway:
no pull request, or a pull request without the pre-PR sequence. Claude Code's
`/goal` keeps a session working until a condition holds, so the harness can
use it instead of building a goal mechanism of its own. That is what the user
chose on 2026-10-11.

Used as shipped, `/goal` leaves three gaps, each measured on Claude Code
2.1.296 on 2026-10-12 (design.md, *Context*):

- **Done is judged from prose.** The condition is judged by a small model
  that reads the conversation and cannot run a command or read a file. A
  stage's done has to be something the transcript shows verbatim, and the
  harness has no single line that says a stage is done.
- **There is no ceiling while the agent works.** The documented bound is a
  clause in the condition, such as "or stop after 20 turns". In the probe the
  evaluator ignored "or stop after 6 turns" for 21 rounds. Claude Code's own
  cap ends a run only after eight blocks with no tool call between them, so a
  run that keeps calling tools is never capped.
- **Nothing outside the session sees the outcome.** `claude -p` exited 0 with
  subtype `success` both for a goal that was met and for one that the block
  cap ended. The verdict exists only in the session's transcript, in an
  undocumented format.

## What Changes

- A new check, `bun/goal-check.ts <stage> <change> [<step>]`, decides whether
  a stage is done from the tree, the gate ledger and the pull request. It
  covers three stages. `propose` needs the change's proposal. `apply` needs
  the step's task group to be complete. `archive` needs the change moved
  under `archive/`. Every stage also needs a passing pre-PR run record for
  `HEAD` and an open pull request whose head is `HEAD`. The check's last line
  reads `goal met` or `goal open`, followed by what is missing, and it never
  takes the form of a gate line.
- Each run of the check writes one record to the gate ledger:
  gate `goal`, the stage as the rule, `met` or `open`, and the commit it
  read. A stage that ended without a `met` record for its commit did not
  finish. Nothing new reads the ledger: the wrap-up's gates line already
  counts every gate.
- `core/feature-workflow.md` gains the launch form for an unattended stage.
  It is one `/goal` per stage, whose condition is that the check's last line
  reads `goal met`, or that the final message opens with a named `BLOCKED`.
  Explore and conversational sessions set no goal.
- The turn gate's `Stop` half gains a round ceiling. It counts the stops that
  arrive with `stop_hook_active` true since the session's last prompt. At the
  ceiling it ends the session with a reason that starts `goal-ceiling:`, and
  it records a `ceiling` in the ledger. The goal stays set, so a resume
  carries on with the count reset. No hook is newly registered, here or in a
  consumer.

## Non-goals

- **Choosing and launching the next stage.** That is the card *Run the board
  loop: take the next unblocked card, carry its stage, move it, repeat*. The
  loop calls this check after a session ends and moves the card. This change
  gives it the verdict and the launch form, and leaves the loop to that card.
- **Repeated failing calls and hangs.** `loop-guard`, proposed on the card
  that carries it, owns repeats. The launcher owns time. The ceiling here
  counts goal rounds, and a single turn that never stops is not one.
- **Asking the user when a stage is blocked.** That is
  `card-questions`: a `BLOCKED` ending is where its question starts.
- **Running the wrap-up at a met goal, and the handover note.** That is the
  card *Trigger session-wrapup at a finished task or near the end of the
  context window, and hand over to a fresh session*.
- **A goal inside an Agent-tool sub-agent.** The docs do not say whether
  `/goal` runs there. An orchestrator's own session can set one over its
  sub-agents, because evaluation waits while a sub-agent runs.

## Capabilities

### New Capabilities

- `stage-goal`: what makes an OpenSpec stage done as far as a goal is
  concerned, how the check reports and records it, how an unattended stage is
  launched, and the round ceiling that ends a goal run.

### Modified Capabilities

None. `commit-gates`' *A turn that commits reports its gates before it ends*
keeps every decision it fixes. The ceiling ends a session, which that
requirement never does. The ledger's record form is the one
`gate-decision-ledger` fixes, plus the `commit` field that `pre-pr-run-record`
adds, so the `goal` gate needs no change to it.

## Impact

- New `bun/goal-check.ts` with tests. `bun/turn-gate.ts`'s `stop` half reads
  a round count kept beside its mark.
- `core/feature-workflow.md` gains the launch form. `README.md`'s *Consuming*
  turn-gate line names the ceiling.
- Consumers gain the check and the ceiling on their next pin bump. Nothing is
  newly registered. Their `Stop` registration runs only the turn gate
  (measured, design.md).
- Ordering: this applies after `gate-decision-ledger`, whose writer it
  records through, and after `pre-pr-run-record`, whose record the check
  reads. Only `gate-decision-ledger` is in `after:`. `pre-pr-run-record` is
  not on `main` yet, and `board-state` refuses an `after:` entry with no
  directory, so task 1.0 adds it once it lands.
- Closest existing artefacts: the turn gate (the archived
  `2026-10-08-pre-pr-sequence-gate`), which is the harness's other `Stop`
  hook, and `pre-pr-run-record`, whose record is what most of the check
  reads.
