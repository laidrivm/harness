# wrapup-before-window-ends

## Why

`/session-wrapup` starts only from the `next:` line `bun bun/work.ts status
--to done` prints (`work-status`, *A written done names the wrap-up next*) or
when the user types it. Long work that never reaches `done` runs into Claude
Code's auto-compaction instead: no debrief, no pipeline-yield entry, and a
summary in place of what the session knew. On the laptop a main session lost
track of a running subagent after a compaction, and no yield entry was
written. On the VPS one persistent session runs, and only the user can
`/clear` it (card *Run session-wrapup before the context window runs out*,
40c39875c31b8105837eed7d739a8086; explore of 05.11, the user's answer to
question 1: «б»).

No hook receives the context size, and the model does not see the status
line. The transcript does carry it: every assistant reply's `message.usage`,
whose `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
is the figure the status line's `used_percentage` is computed from.

## What Changes

- The turn gate's `Stop` half, after its own decision lets the turn end,
  reads the last assistant reply's context size from the tail of the event's
  `transcript_path`. At or above 800 000 tokens — a 1M window less a reserve
  of 200 000, against the 18k–37k a wrap-up was measured to cost — it refuses
  the stop once, with: finish the step in hand, run `/session-wrapup` unless it
  is already running, then tell the user «можно /clear». An unattended
  session ends on the final message it meant to end on instead.
- "Once" is per context: a mark beside the turn gate's mark, set by the
  refusal and dropped by the first stop that measures below the threshold, so
  a compaction or a `/clear` re-arms it, and a resumed session above the
  threshold is not asked again.
- Each refusal is recorded in the gate ledger, so the wrap-up's `gates` line
  counts it.
- Compaction is left alone. Known limit, stated in `design.md` and
  `README.md`: where `/autocompact` sits below 800 000, compaction comes
  first and nothing is asked; a model with a smaller window never reaches
  the threshold.
- No new hook registration: the turn gate's `Stop` command already runs in
  every consumer, so the pin bump carries it and `sync.ts` writes nothing new.

Not in this change: `PreCompact` (it can block a compaction but tells the
model nothing — answer 1 «а» declined), a status-line rule (the model cannot
see it — «в»), subagents (`SubagentStop`, `design.md`), a threshold per
model or per machine.

## Capabilities

### New Capabilities

- `context-window`: what the harness does as a session's context window fills
  — when the session is asked to wrap up, how often, and what it reads to know.

### Modified Capabilities

None. The turn gate's refusal (`commit-gates`) and the round ceiling
(`stage-goal`) keep their requirements; how the new refusal orders against
them is set out in `context-window`.

## Impact

- New: `bun/context-window.ts` and its tests. Changed: `bun/turn-gate.ts`
  (its stop half calls the new check, and its header names it),
  `README.md`'s hook table row for the turn gate and a line on the
  `/autocompact` limit.
- Settings: none, in the harness or in consumers.
- Reach: the harness's own sessions run the hook from `node_modules/harness`,
  so it takes effect in the harness, on the laptop and on the VPS, with the
  self-pin bump after merge; consumers with their next bump.
