# loop-guard

## Why

An agent can go round in circles: it runs the same call, gets the same error,
and runs it again. In an interactive session the user notices. In an
unattended one (an orchestrator's sub-agents overnight, a scheduled run) nobody
does, and the loop spends the plan's limit until something else ends the
session. Nothing in the harness counts repeats today: its hooks are the command
guard (`PreToolUse`) and the turn gate (`UserPromptSubmit` and `Stop`), and
neither sees a tool's result.

Claude Code reports each tool call that fails after it started executing to a
`PostToolUseFailure` hook, with the call's input and the error text. A call
rejected before it runs is not reported (see *Non-goals*). A `PreToolUse` hook
can refuse a call before it runs, which is how the command guard refuses Bash
calls. Counting in the first hook and refusing in the
second is enough to stop the repeat itself.

The first draft of this change ended the session instead, with
`continue: false` from `PostToolUseFailure`. A probe on 2026-10-13 refuted that
under `claude -p` (design.md, *Measurements*). The session went on, and its
reason never reached the output.

The closest existing artefacts are the command guard (`agent-permissions`' *The
git prohibitions are enforced by a hook*), whose `PreToolUse` refusal this
change reuses, and `openspec/changes/gate-decision-ledger/`, whose ledger this
change records into.

## What Changes

- A new hook on `PostToolUseFailure` counts failed calls per session and per
  sub-agent. Two failures are one repeat only when the tool and its input are
  the same, and the error text is the same once digits and whitespace are
  normalised. A different input or a different error is a change of approach,
  and starts its own count.
- On the third identical failure the hook adds a warning to the agent's
  context beside the error. The warning says the next identical call will be
  refused: change approach, or end the turn with `BLOCKED` naming what only the
  user can settle.
- From then on, until the next prompt, a new hook on `PreToolUse` refuses that
  identical call before it runs. The reason it gives starts `loop-guard:`, so
  an agent, a person or a launcher can tell this refusal from any other. A new
  prompt, such as a person's reply or a launcher resuming the session, gives
  the call one more try.
- Each warning and each refusal is one record in the gate ledger, through its
  writer, under the ledger's rules for what a record may hold. No second log
  is kept.
- Both hooks fail open, as the turn gate does: an event or a count they cannot
  read decides nothing.
- `bun/bootstrap.ts` lists both hooks beside the others, so `sync.ts` writes
  them into each consumer's `.claude/settings.json`, and `check.ts` fails a
  consumer that lacks them.

## Non-goals

- **Ending the session.** The probe showed that `continue: false` from
  `PostToolUseFailure` does not end a `claude -p` run. The guard stops the
  repeated call, not the agent. Ending a run that keeps getting refused is the
  launcher's job, using the ledger or the `loop-guard:` refusal in the output.
  `PostToolBatch` is documented to stop the agentic loop, and is left to a
  later change if a probe confirms it (design.md, *The guard refuses the call,
  it does not end the session*).
- **Hanging.** A hook runs only on an event, and an agent that has stopped
  calling tools emits none, so silence cannot be caught here. Claude Code
  already bounds each call in an unattended session (design.md, *No timers*).
  A wall-clock or idle timer belongs to whatever launches the session.
- **Asking the user.** Turning a refusal into a question on the task's card is
  the card *Ask every question the orchestrator cannot settle as a comment on
  its card, assigned to me, with a cap on open questions*.
- **A round cap for long goal-driven runs.** That belongs with the goal
  runner, not with the repeat count.
- **Loops whose input changes each time**, such as the same edit retried with a
  different anchor, or a test suite failing differently after each fix. Those
  are the agent trying something new, and counting them would stop ordinary
  test-driven work (design.md, *Measurements*).
- **Calls rejected before they run.** These are an unknown tool, input that
  fails validation, a permission denial, or a `PreToolUse` hook's refusal,
  including the command guard's and this guard's own. Claude Code reports none
  of them to `PostToolUseFailure`, so they are never counted.
- **A mod.** The card *Ship the harness's in-session behaviour as a mod plugin*
  may later move this count into a mod. The harness ships no plugin today, and
  whether mods load in `claude -p` is unverified.

## Capabilities

### New Capabilities

- `loop-guard`: what counts as a repeated failing call, when the agent is
  warned, when the identical call is refused and for how long, what a refusal
  says, and what the guard records.

### Modified Capabilities

None. The gate ledger's requirements are not yet archived into
`openspec/specs/`, so this change cites them rather than modifying them. The
turn gate and the command guard decide as before.

## Impact

- New `bun/loop-guard.ts` with tests. It is registered on `PostToolUseFailure`
  and on `PreToolUse` (every tool) in the harness's own
  `.claude/settings.json`, and in `bun/bootstrap.ts`'s `HOOKS`.
- Records through `bun/gate-ledger.ts`, which `gate-decision-ledger` has
  already put on `main`.
- Consumers: on their next pin bump, `sync.ts` adds two hooks. Every tool call
  costs one more bun start, measured at 16 to 22 ms for the command guard. A
  failed call costs a second one.
- README *Consuming* names the hooks beside the others.
