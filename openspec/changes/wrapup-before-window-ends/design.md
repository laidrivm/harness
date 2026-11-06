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
--continue`. Whether a resume keeps the session id is not verified: none of
the 200 most recent transcripts of the laptop's harness project holds two
session ids, which is also what it would show if none of them was resumed.
Decision 4 holds either way; only its cost differs.

## Goals / Non-Goals

**Goals:** one request per context to wrap up, made while at least 200k of a
1M window is left; no new registration anywhere; the turn gate's refusal and
the round ceiling decided as today, and the promise of the gate's refusal
kept (decision 5).

**Non-Goals:**

- Holding off compaction (`PreCompact`), answer 1 «а», declined.
- A window size per model or per machine: no hook field and no transcript line
  names the window.
- Subagents (decision 8).
- Unattended sessions, which are not asked (decision 7).

## Decisions

### 1. Inside the turn gate's stop half, in a module of its own

`bun/context-window.ts` holds the threshold, the tail read and the
once-per-context mark, and exports one function the turn gate's `decide()`
calls after `judge()`, at every stop, letting it refuse only where `judge()`
did not (decision 5 sets the order).
`decide()`'s existing `if (!reason) stopped(file)` then leaves no `.stopped`
after a refusal for size, so the continued wrap-up is still a turn of the
same mark, and a message queued into it does not move the mark.

`turn-gate.ts` is at 303 physical lines, over the 300-line cap `file-size.ts`
counts. The import, the call, the logging change and a header paragraph add
about ten, so `groups()` and `complete()` — the task-list reading, about 40
lines that `goal-check.ts`, `work-status.ts` and `board-loop-takeable.ts`
import from it — move to `bun/task-groups.ts`, and those importers and
`turn-gate.test.ts` import them from there (`core/rules.md`: split to the cap
that will apply).

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

The hook opens `transcript_path`, reads its last 4 MiB (`readSync` at that offset: `decide()` is synchronous),
drops the first line when the slice starts after byte 0 — only then can it be
cut — and walks the rest from the end, parsing each line once; the walk also
looks for a wrap-up call back to the last compaction (decision 7) and notes
that compaction's `uuid` (decision 4), so it may cover the whole tail, a few
milliseconds at 4 MiB. The first
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
beside the turn gate's mark, reusing its safe-id check), and so does a stop at
or above the threshold that asks nothing because a wrap-up already ran
(decision 7) or the session is unattended — so either is read once per
context, not at every stop. A stop at or above
the threshold with that file present asks nothing. Two things remove it, so
re-arm the ask: a stop under half the threshold, 400 000 (`REARM`), and a
stop whose tail's last `compact_boundary` line is not the one the mark
records. The mark holds that line's `uuid` as it was when the mark was
written, or nothing when the tail held none; a boundary that has since left
the tail reads as no change, since a new one is appended after the mark and
so lies in any tail that reaches past it. Both are read at every stop with a
size, before and whatever the turn gate decides (decision 5): a stop the
gate refuses still re-arms. An event with no safe session id asks nothing,
so a refusal can never repeat for want of a place to record it.

Either alone leaves a hole. Half the threshold alone: a wrap-up run before a
compaction writes the mark, and a first stop after it measuring 500 000 —
a long first turn over a large summary — keeps it, so the next crossing is
not asked. The boundary alone: one more than 4 MiB behind the stop is out of
the tail.

The gap between the two figures is deliberate: a context that shrinks a
little within one window — old tool results cleared, a `/rewind`, a read one
reply behind — would otherwise re-arm the ask and buy a second wrap-up in
the same context. Only a compaction or a cleared context falls under half.

- **`/clear`** starts a new session id, so a new mark path: armed.
- **Compaction** keeps the id; the next stop finds a boundary the mark does
  not record, and usually measures well under half too, and removes the
  mark: armed for the next crossing.
- **`--continue` on the VPS**: if the resume keeps the id, `$TMPDIR` still
  holds the mark and a session that already wrapped up is not asked again.
  If it gets a new id, or a container restart empties `$TMPDIR`, a resumed
  session past the threshold is asked once more (Risks). The tail check of
  decision 7 catches a wrap-up recent enough to be in the tail either way.

Alternative from the brief: a `SessionStart` hook removing the mark on
`source` `clear` or `compact`. `/clear` already changes the id, and the
measurement already sees a compaction, so it would be a new registration in
every consumer for nothing the size does not say. Rejected.

### 5. Order: ceiling, turn gate, size

The round ceiling ends the session before `decide()` runs, so a stop at the
ceiling is never refused for size. The turn gate's refusal comes before the
size, because a missing pre-PR run is the gate's whole purpose.

The gate's refusal text promises that "the next stop ends it", so no refusal
for size is made under a mark the gate flagged ` refused`: a turn the gate
refused is asked for the wrap-up at the first stop of the next turn. The size
is still read there, and at a stop the gate refuses, so the re-arm of
decision 4 is never skipped: a first stop after a compaction that the gate
refuses would otherwise leave the old context's mark in place. A refusal for size
does not flag the mark. The reason tells the model to finish the step in hand,
which in an apply session can mean ticking the last box and committing; the
gate must still judge that, and must not carry a flag it never set into the
next turn after an interrupted wrap-up.

So the same hook can refuse twice under one mark — once for size, once for a
missing run — each bounded by its own record. `commit-gates` says the hook
refuses at most once per mark; this change adds a `commit-gates` requirement
that the bound is the pre-PR refusal's own, rather than copying that 425-line
requirement into a MODIFIED delta, which alone would pass the diff budget.

Inside `decide()`: `reason = judge(...)`, then `wrapup(file, event, ask)`
with `ask` true only when `judge()` did not refuse and the mark file exists
unflagged; `wrapup()` re-arms whatever `ask` says and refuses only when it is
true. `judge()` logs its decision as today. With no mark file the `mark` half
never ran — a partial installation — and the stop ends, as `commit-gates`
requires of a stop with no mark.

An empty mark, written outside a repository, and a `HEAD` naming no branch
are another matter. `commit-gates` lets such a stop end, but for want of a
commit to judge, not of a partner hook: the window fills as fast outside a
repository, and a wrap-up there is as useful. So a stop under an empty mark,
or on a detached `HEAD`, may be refused for size, and the `commit-gates`
requirement this change adds says the fail-open cases are the pre-PR
refusal's own, as its once-per-mark bound is. Requiring a mark that names a
commit would keep the two rules from meeting, at the cost of never asking a
session that runs outside a repository. Rejected.

A refusal for size makes the next stop arrive with `stop_hook_active` true,
which the ceiling counts as one round: one of 20, once per context. Accepted.

### 6. `stop_hook_active` is not read

The bound is the mark, as the turn gate's own once-per-mark bound reads no
event field. Skipping a stop with `stop_hook_active` true would never ask a
`/goal` run, whose every stop after the first is continued — the longest
runs, the ones most likely to fill the window.

### 7. The reason, a session already wrapping up, and an unattended one

The reason, exact text (`<n>` the size read):

> The context holds `<n>` tokens, at or past the 800000 at which the harness
> asks for a wrap-up while enough of the window is left for one. Finish the
> step in hand, run /session-wrapup, then tell the user «можно /clear». If a
> subagent you started is still running, end this turn saying the wrap-up
> waits for its report instead, and run it once the report is in. This is
> asked once in this context.

A wrap-up already run: the `next:` line of `status --to done` starts one,
often in the same turn that then crosses the threshold, and a second run would
append a duplicate yield entry. The walk over the tail (decision 3) also looks
for a `session-wrapup` call: an assistant `tool_use` named `Skill` whose
`input.skill` is `session-wrapup` or ends in `:session-wrapup`, or a user
message holding `<command-name>/session-wrapup</command-name>`, the form a
typed command takes (both seen in the laptop's transcripts). One found asks
nothing and writes the mark. A wrap-up older than the tail is not seen, and
one more is asked for; the tail is several times a wrap-up's size.

Only a call of the current context counts. A compaction appends to the same
file, so a wrap-up run before it can still sit in the tail at the next
crossing. Walking from the end, the search for a call stops at the first
`type: "system"` line with `subtype: "compact_boundary"` (the marker Claude
Code writes at a compaction, seen in the laptop's transcripts); the search
for the size does not, since the last reply is always the current context's.
A `/clear` starts a new file, so needs no marker.

Running subagents: the main session here usually dispatches background
worktree agents and ends its turns while they run. It cannot wait inside the
continued turn, and the mark means it is not asked again, so the reason asks
it to end the turn naming the wait; the instruction stays in its context for
the turn the report arrives in. A wrap-up before the reports would reconcile
cards and write the yield entry early, and a `/clear` would lose them; the
200k reserve is far above what the reports add.

An unattended session is not asked at all. A board-loop stage reads
`PR-TITLE:` and `PR-BODY:` from the final message, the body running to its
end, so a continued turn risks the pull request's text and spends a goal
round for a wrap-up nobody reads, in a `claude -p` session that ends anyway.
`bun/question-gate.ts` already reads the unattended line from the
transcript's first user message (`unattended()`); that function moves to
`bun/unattended.ts`, which both callers import (`core/rules.md`: lift logic
into one module, never write it twice), unchanged. It reads the whole file,
so the size check calls it only for a stop that would otherwise be refused,
and writes the mark when it answers yes: once per context.

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
how often it fires — the evidence the stage's metric needs. The turn gate
records each stop it judges as today, so a turn refused for size over a
passing run records `turn-gate passed` at both of its stops, as a turn the
gate refuses records two decisions today. Postponing the gate's record to the
stop that ends the turn was tried in review and rejected: the continued turn
can move the tip, and the record would then name a decision about another
commit. `decide()`'s `log` callback receives the size refusal as its own
decision, and the hook maps it to the `context-window` gate; called from a
test it records nothing, as today.

`turn-gate.ts`'s `ponytail:` comment on what accumulates in `$TMPDIR/turn-gate`
names `.wrapup` beside the mark, `.rounds` and `.stopped`, and
`goal-rounds.ts`'s header, which says `goal-check.ts` imports `turn-gate.ts`,
is re-read once `groups()` moves (decision 1).

## Risks / Trade-offs

- [`/autocompact` set below 800 000] → compaction comes first and nothing is
  asked. `README.md` states it beside the turn gate's row: leave
  `/autocompact` at its default, or above 800 000, where the wrap-up should
  come first.
- [A model with a smaller window] → never reaches the threshold; nothing is
  asked, and nothing breaks.
- [A container restart on the VPS empties `$TMPDIR`, or a resume gets a new
  session id] → a resumed session past the threshold whose wrap-up is older
  than the tail is asked a second time; one extra wrap-up, 18k–37k tokens.
- [A reply not flushed when `Stop` fires] → the size read is one reply old;
  covered by the reserve.
- [A refusal adds a round to a `/goal` run] → one of 20, once per context.

## Migration Plan

Nothing to migrate: no settings change in the harness or in consumers. The
harness's own sessions run the hook from `node_modules/harness`, so it takes
effect with the self-pin bump after merge; consumers with their next bump.
Rollback is a revert and a bump; a stale `.wrapup` file in `$TMPDIR` is read
by nothing after it.
