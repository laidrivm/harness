# wrapup-before-window-ends — design

## Context

The harness registers one `Stop` hook, the turn gate's stop half
(`bun/turn-gate.ts stop`, registered as `TURN_STOP` in `bun/bootstrap.ts`'s
`HOOKS`, which `settings.ts` asserts and `sync.ts` writes into every
consumer). Its main block, in order: counts a continued stop against the
round ceiling (`goal-rounds.ts`) and ends the session at the ceiling; else
calls `decide()`, which refuses a turn that completed a task group without a
passing pre-PR run, at most once per mark; and, for every stop not refused,
writes `<mark>.stopped`, which tells the next prompt's `mark` half that the
turn ended and the mark may move. A refused turn is continued, so it leaves no
`.stopped`, and a prompt queued into it keeps the mark. The marks live in
`$TMPDIR/turn-gate/<session_id>`. `turn-gate.ts` is at 303 lines against the
300-line cap for `.ts` (`file-size.ts`).

A `Stop` event carries `session_id`, `transcript_path`, `cwd` and
`stop_hook_active`, and no context size. The transcript is JSONL; each
assistant reply is a line with `type: "assistant"`, `isSidechain`, and
`message.usage`. Measured on the laptop's transcripts: the largest is 128 MB;
the longest single line 3.7 MB; at a stop the last reply is followed by a
handful of small `system`, `queue-operation` and `last-prompt` lines.

Claude Code compacts a 1M-window session at about 967k by default; the
laptop's transcripts show compactions from 300k to 983k, set by
`/autocompact`. A wrap-up was measured at 18k–37k tokens (10.10, 11.10).

`orchestrator/runner/session.sh` restarts claude on the VPS with `claude
--continue`. None of the 200 most recent transcripts of the laptop's harness
project holds two session ids, so a resume appends under the same id rather
than copying the conversation under a new one.

## Goals / Non-Goals

**Goals:** one request per context to wrap up, made while at least 200k of a
1M window is left; no new registration anywhere; the turn gate's existing
decisions unchanged.

**Non-Goals:**

- Holding off compaction (`PreCompact`), answer 1 «а», declined.
- A window size per model or per machine: no hook field and no transcript line
  names the window.
- Subagents (decision 8).
- Telling a `claude -p` session apart from an interactive one in code
  (decision 7).

## Decisions

### 1. Inside the turn gate's stop half, in a module of its own

`bun/context-window.ts` holds the threshold, the tail read and the
once-per-context mark, and exports one function the turn gate's `decide()`
calls after `judge()` returns no refusal:
`reason = judge(...) ?? wrapup(event, file)`. `decide()`'s existing
`if (!reason) stopped(file)` then leaves no `.stopped` after a refusal for
size, so the continued wrap-up is still a turn of the same mark, and a
message queued into it does not move the mark. `turn-gate.ts` gains the
import, the one call and a header paragraph, which moves no code out of it.

Alternative: a second `Stop` entry in `HOOKS`. Claude Code runs an event's
hooks in parallel, so the two could not be ordered: both refusals would reach
the model at one stop, and the turn gate would write `.stopped` for a turn the
other hook continued. It would also be a new line in every consumer's
settings, which `sync.ts` must write and `settings.ts` assert. Rejected.

### 2. The threshold is a constant: 800 000

`THRESHOLD = 800_000`, exported for the tests, with no environment override:
nobody has asked to tune it, and the harness's sessions, laptop and VPS, run
Opus 5.5 with its 1M window. A model with a 200k window never reaches it and is never asked;
its own compaction comes first (Risks).

Alternatives: the window from the model's name — the transcript names the
model (`claude-opus-5-5`), not the `[1m]` variant or the window; a fraction of
the window — needs the window. Rejected for now.

### 3. The size is the last real reply's, read from a 4 MiB tail

The hook opens `transcript_path`, reads its last 4 MiB (`Bun.file().slice()`),
drops the first, possibly cut, line, and walks the rest from the end. The first
line that parses as JSON with `type === "assistant"`, `isSidechain !== true`
and a `usage` whose three input fields sum above zero gives the size. 4 MiB
holds the longest line seen, and reading it costs a few milliseconds whatever
the file's size.

Passed over: a sidechain's reply, which describes another window; a synthetic
reply (an API error shown as a message), whose usage is all zeros. Anything
else unreadable — no path, no file, a tail with no such line, a line longer
than the tail — reads as no size and asks nothing, fail-open as the turn gate
is.

A reply may not yet be flushed when `Stop` fires; the hook then reads the
reply before it, a few thousand tokens behind, which the 200k reserve covers.

### 4. "Once" is a mark per session, re-armed by a smaller context

A refusal writes `<mark>.wrapup` (`$TMPDIR/turn-gate/<session_id>.wrapup`,
beside the turn gate's mark, reusing its safe-id check). A stop at or above
the threshold with that file present asks nothing. A stop below the threshold
removes it. An event with no safe session id asks nothing, so a refusal can
never repeat for want of a place to record it.

- **`/clear`** starts a new session id, so a new mark path: armed.
- **Compaction** keeps the id; the next stop measures the compacted context,
  below the threshold, and removes the mark: armed for the next crossing.
- **`--continue` on the VPS** keeps the id and `$TMPDIR`; the mark stands,
  and a session that already wrapped up is not asked again. A container
  restart empties `$TMPDIR`, so a resumed session past the threshold is asked
  once more (Risks).

Alternative from the brief: a `SessionStart` hook removing the mark on
`source` `clear` or `compact`. `/clear` already changes the id, and the
measurement already sees a compaction, so it would be a new registration in
every consumer for nothing the size does not say. Rejected.

### 5. Order: ceiling, turn gate, size

The round ceiling ends the session before `decide()` runs, so a stop at the
ceiling is never refused for size. The turn gate's refusal comes before the
size, because a missing pre-PR run is the gate's whole purpose and its
refusal is bounded to one stop; the next stop of that turn is released by the
gate and may then be refused for size. One refusal reaches the model per
stop.

A refusal for size makes the next stop arrive with `stop_hook_active` true,
which the ceiling counts as one round: one of 20, once per context. Accepted.

### 6. `stop_hook_active` is not read

The bound is the mark, as the turn gate's own once-per-mark bound reads no
event field. Skipping a stop with `stop_hook_active` true would never ask a
`/goal` run, whose every stop after the first is continued — the longest
runs, the ones most likely to fill the window.

### 7. A session already wrapping up, and an unattended one, are told in words

The reason, exact text (`<n>` the size read):

> The context holds `<n>` tokens, at or past the 800000 at which the harness
> asks for a wrap-up while enough of the window is left for one. Finish the
> step in hand, run /session-wrapup unless it is already running, then tell
> the user «можно /clear». A session that runs unattended ends instead on the
> whole final message it meant to end on, unchanged: a launcher reads that
> message's lines. This is asked once in this context.

"Unless it is already running" is the `next:` line's own phrase
(`work-status`). A session mid-wrap-up answers it in one short continuation,
and the mark passes its next stop. Alternative: find a `Skill` call naming
`session-wrapup` in the tail; a parser for a case one sentence covers, once
per context. Rejected.

An unattended board-loop stage reads `PR-TITLE:` and `PR-BODY:` from the
final message, the body running to its end, so a «можно /clear» appended
there would land in the pull request. No event field tells a `claude -p`
session from an interactive one; the session itself knows from its prompt's
`This session runs unattended.` line (`core/autonomy.md`). The turn gate's
refusal settles the same problem with the same instruction.

### 8. Subagents: `SubagentStop` is not covered

`Stop` does not fire for a subagent; `SubagentStop` does, and the harness
registers nothing on it. A subagent's window is its own, its transcript a
separate file, and its work returns as a report to the session that keeps the
cards and the yield ledger. A subagent near its window ends its task or
compacts on its own; a wrap-up there would be a second, partial debrief of the
same session.

### 9. Each refusal for size is recorded

Run as the hook, a refusal for size appends `context-window refused wrapup`
to the gate ledger through `record()`, so the wrap-up's `gates` line counts
how often it fires — the evidence the stage's metric needs. `decide()` gains a
second logging callback for it; called from a test it records nothing, as
today.

## Risks / Trade-offs

- [`/autocompact` set below 800 000] → compaction comes first and nothing is
  asked. `README.md` states it beside the turn gate's row: leave
  `/autocompact` at its default, or above 800 000, where the wrap-up should
  come first.
- [A model with a smaller window] → never reaches the threshold; nothing is
  asked, and nothing breaks.
- [A container restart on the VPS empties `$TMPDIR`] → a resumed session past
  the threshold is asked a second time; one extra wrap-up, 18k–37k tokens.
- [A reply not flushed when `Stop` fires] → the size read is one reply old;
  covered by the reserve.
- [A refusal adds a round to a `/goal` run] → one of 20, once per context.

## Migration Plan

Nothing to migrate: no settings change in the harness or in consumers. The
harness's own sessions run the hook from `node_modules/harness`, so it takes
effect with the self-pin bump after merge; consumers with their next bump.
Rollback is a revert and a bump; a stale `.wrapup` file in `$TMPDIR` is read
by nothing after it.
