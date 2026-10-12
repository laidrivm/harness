# loop-guard

## Why

An agent can go round in circles: it runs the same call, gets the same error,
and runs it again. In an interactive session the user notices. In an
unattended one (an orchestrator's sub-agents overnight, a scheduled run) nobody
does, and the loop spends the plan's limit until something else ends the
session. Nothing in the harness counts repeats today: its hooks are the command
guard (`PreToolUse`) and the turn gate (`UserPromptSubmit` and `Stop`), and
neither sees a tool's result.

Claude Code now reports each tool call that fails after it started executing
to a `PostToolUseFailure` hook, with the call's input and the error text. A
call rejected before it runs is not reported (see *Non-goals*). Claude Code
also lets a hook end the session with a reason (`continue: false` with
`stopReason`). That is enough to notice a loop and stop it, without a process
watching from outside.

The closest existing artefacts are the turn gate (`commit-gates`' *A turn that
commits reports its gates before it ends*), which is the harness's other
in-session stop, and `openspec/changes/gate-decision-ledger/`, whose ledger
this change records into.

## What Changes

- A new hook on `PostToolUseFailure` counts failed calls per session and per
  sub-agent. Two failures are one repeat only when the tool and its input are
  the same, and the error text is the same once digits and whitespace are
  normalised. A different input or a different error is a change of approach,
  and starts its own count.
- On the third identical failure the hook returns a warning to the agent beside
  the error: change approach, or end the turn with `BLOCKED` naming what only
  the user can settle. On the fourth it ends the session with a reason that
  starts `loop-guard:`, so whatever launched the session can tell this stop
  from any other.
- Each warning and stop is one record in the gate ledger, through its writer,
  under the ledger's rules for what a record may hold. No second log is kept.
- The hook fails open, as the turn gate does: an event or a count it cannot
  read decides nothing.
- `bun/bootstrap.ts` lists the hook beside the others, so `sync.ts` writes it
  into each consumer's `.claude/settings.json` and `check.ts` fails a consumer
  that lacks it.

## Non-goals

- **Hanging.** A hook runs only on an event, and an agent that has stopped
  calling tools emits none, so silence cannot be caught here. Claude Code
  already bounds each call in an unattended session (design.md, *No timers*).
  A wall-clock or idle timer belongs to whatever launches the session.
- **Asking the user.** This change stops the session with a reason. Turning
  that reason into a question on the task's card is the card *Ask every
  question the orchestrator cannot settle as a comment on its card, assigned to
  me, with a cap on open questions*.
- **A round cap for long goal-driven runs.** That belongs with the goal
  runner, not with the repeat count.
- **Loops whose input changes each time**, such as the same edit retried with a
  different anchor, or a test suite failing differently after each fix. Those
  are the agent trying something new, and counting them would stop ordinary
  test-driven work (design.md, *Measurements*).
- **Calls rejected before they run.** These are an unknown tool, input that
  fails validation, a permission denial, or a `PreToolUse` hook's refusal,
  including the command guard's. Claude Code reports none of them to
  `PostToolUseFailure`, so the guard never sees them.
- **A mod.** The card *Ship the harness's in-session behaviour as a mod plugin*
  may later move this count into a mod. The harness ships no plugin today, and
  whether mods load in `claude -p` is unverified.

## Capabilities

### New Capabilities

- `loop-guard`: what counts as a repeated failing call, when the agent is
  warned and when the session is stopped, what a stop says, and what the guard
  records.

### Modified Capabilities

None. The gate ledger's requirements are not yet on `main`, so this change
cites them rather than modifying them. The turn gate and the command guard
decide as before.

## Impact

- New `bun/loop-guard.ts` with tests. It is registered on `PostToolUseFailure`
  in the harness's own `.claude/settings.json` and in `bun/bootstrap.ts`'s
  `HOOKS`.
- Depends on `bun/gate-ledger.ts`, which `gate-decision-ledger` step 1 adds.
  The step that records into it applies after that step merges.
- Consumers: on their next pin bump, `sync.ts` adds one hook. A failed call
  costs one bun start of about 20 ms. A successful call costs nothing.
- README *Consuming* names the hook beside the others.
