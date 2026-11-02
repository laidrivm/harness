# turn-gate-keeps-mid-turn-mark — design

## Context

`bun/turn-gate.ts` has two halves. `mark` (`UserPromptSubmit`) writes `HEAD` to
`$TMPDIR/turn-gate/<session>` unconditionally and resets `<session>.rounds`.
`decide` (`Stop`) reads the turn's work as `HEAD` against that mark, and a
` refused` suffix on the mark bounds it to one refusal per mark. Nothing tells
`mark` whether a turn is running, so any prompt moves the mark.

Evidence (probe 02.11, user; Claude Code 2.1.316, session `6efb2193…`, a
worktree since removed):

- Case A, the control: commit `bdaab1f9` completed a group without `pre-pr`,
  then `ping -c 10`. The Stop hook refused in the chat; the ledger holds
  `turn-gate refused` (15:19:06) and `released` (15:19:09).
- Case B: commit `9f5dac9d` the same way, then `ping -c 60`; while it ran the
  user queued «Продолжай» (`queued_command` in the transcript). The agent
  answered it after the ping, in the same turn. The turn ended with no refusal
  in the chat and no new `turn-gate` record in the ledger.
- The mark file's content was not captured (the probe's command lines could
  not run in zsh), so the ledger and the chat are the evidence, not the mark.

Claude Code's documentation says `Stop` "does not run if the stoppage occurred
due to a user interrupt", and is silent on `UserPromptSubmit` for a queued
message; case B settles the second, the first follows from the docs.

## Goals / Non-Goals

**Goals:** a prompt that arrives while a turn runs, or after a turn that ended
without `Stop`, leaves the mark — and its refusal — where it was.

**Non-Goals:**

- The `commit` and checkout project on the turn gate's records (#355, Minors 1
  and 2). The card's explore put them beside this fix; they change what a
  record says, not what the gate decides, and stay on the card for a change of
  their own.
- Any change to the round ceiling (decision 5).

## Decisions

### 1. The `Stop` half marks the turn boundary in `<mark>.stopped`

`mark` needs one fact it cannot read from the event: did the last turn end.
Only the `Stop` half knows, so it leaves a file beside the mark, as the round
count already lives in `<mark>.rounds`; the mark's own format is untouched and
`decide`'s parse stays as it is.

Alternatives:

- **Keep only the ` refused` flag across prompts** (the card's other
  direction). Case B never reached a refusal: the queued message moved the mark
  before the first `Stop`, so there was no flag to keep.
- **Keep the mark when `HEAD` moved since it.** A turn that committed and was
  released also leaves `HEAD` past the mark, and the next turn would be judged
  on both.
- **Read a field of the prompt event.** The `UserPromptSubmit` event carries no
  field telling a queued message from a new turn, and the docs name none.
- **A state word inside the mark** (`<sha> stopped`). It works, but every reader
  of the mark then parses a third form; a separate file costs one `existsSync`.

### 2. Every stop the half does not refuse writes it

A pass, a release by the once-per-mark bound, a turn with nothing to judge, an
input the half cannot read once it has the mark's path, and the end at the
round ceiling all let the turn end, so all write `<mark>.stopped`. A refusal
does not: the turn continues. The ceiling is included because the session ends
there, and the prompt that resumes it must take a fresh mark (`stage-goal`'s
*Resuming after the ceiling*). Writing it is best-effort and silent, as the
rest of the half is.

### 3. `mark` rewrites only with no mark or a `.stopped`, and consumes it

The first prompt of a session finds no mark and writes one, as today; a new
session id after `/clear` is the same case. A resume finds the files of the
session it resumes: `.stopped` there means its last turn ended through `Stop`,
and the mark is retaken; no `.stopped` means it ended by an interrupt or a
failure, and the mark stays, so the next `Stop` judges the earlier turn's
commits with this one's.

Only `mark` removes `.stopped`, as it rewrites. A stale one — left by a `Stop`
whose turn another hook then continued — is consumed by the next prompt like
any other: that is the known limit below, not a state to clear. The `Stop`
half cannot clear it on a continued stop, because the prompt it would guard
against arrives before that stop.

### 4. A kept mark keeps its ` refused`

Stripping the flag on a kept mark would give a refused, continued turn one more
refusal per queued message — on the VPS, per Windmill event. Keeping it means
that after an interrupt of a turn already refused, the next turn ends
unrefused once. That turn's commits still meet `pre-push` and `finish`.

### 5. The round count is unchanged

`mark` still resets `<mark>.rounds` on every prompt. `stage-goal` defines the
count "since that session's last prompt", and in a goal run every continued
round was released by this half first, so `.stopped` is present on nearly
every prompt a goal run receives: tying the reset to the rewrite would change
that spec for no practical gain. The card's explore proposed tying them; this
design does not.

### 6. Crashes

- Between `Stop` and the next prompt: `.stopped` survives in `$TMPDIR`, and the
  resume's prompt consumes it — the turn did end.
- Mid-turn (killed, crashed): no `.stopped`, as after an interrupt.
- A reboot clears `$TMPDIR`: no mark, the first-prompt path.

## Risks / Trade-offs

- [A turn after one that ended without `Stop` — interrupt, `StopFailure`,
  crash — is judged from the older mark] → at most one extra refusal, by the
  once-per-mark bound, and the refusal names work that did go unchecked.
- [A `.stopped` that cannot be written] → the mark is then kept on every later
  prompt, and once refused the session's later turns end unrefused; a `$TMPDIR`
  that refuses writes already breaks the mark itself, and `pre-push` and
  `finish` remain.
- [Upgrade inside a live session: marks written before this change have no
  `.stopped`] → the first prompt after the upgrade keeps the old mark, so the
  previous turn's commits are judged once more; at most one refusal.

## Known limits

- **A turn another `Stop` hook continues.** When this half lets a turn end and
  a goal's hook continues it, `.stopped` is present during the continuation,
  and a message queued then moves the mark. The half cannot see that another
  hook will continue the turn.
- **Subagents.** `Stop` fires for the main session only; a subagent ends
  through `SubagentStop`, where the turn gate is not registered. A worktree
  agent's commits are therefore covered only by `pre-push` and `finish`, as
  today.

## Migration Plan

None beyond the upgrade note above. Rollback is a revert; leftover `.stopped`
files are ignored by the old code and cleared with `$TMPDIR`.
