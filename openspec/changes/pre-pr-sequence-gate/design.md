# pre-pr-sequence-gate — design

## Context

The rule this gate mechanises is one sentence in `docs/review-toolkit.md`:
completing a task group starts the pre-PR sequence in the same turn, and the
agent never asks whether to run it. The session that broke it had read the
file in full earlier the same day. That rules out the two remedies reached for
first — restating the rule more forcefully, or loading it earlier — and points
at the moment of the failure instead, which is the end of a turn.

What the documentation confirms about that moment, read rather than recalled:

- A `Stop` hook fires when the model finishes responding, and exit **2**
  prevents stopping and continues the conversation, with stderr as the
  blocking message.
- `last_assistant_message` carries the final assistant text of the turn, and
  the documentation recommends it over reading the transcript, which "is
  written asynchronously and may lag the in-memory conversation".
- Stderr from a hook that exits 0 "goes to the debug log only, never the
  transcript, and Claude never sees it". So a non-blocking reminder cannot
  reach the model at all; blocking is the only channel that does.

What it does **not** confirm, and what this design therefore refuses to rest
on: a `stop_hook_active` field. An earlier reading of the same page reported
one; reading the page again for it found nothing. It is treated here as
non-existent, and loop safety is obtained by construction instead.

## Goals / Non-Goals

**Goals:**

- Refuse the turn that would end the way 2026-08-19's ended, at that moment.
- Fire on turns that committed and on no others, so an answer to an unrelated
  question is never held up.
- Be impossible to deadlock, without depending on a field the documentation
  does not describe.

**Non-Goals:**

- Verifying the sequence rather than its report. The hook reads for a gate
  line; it cannot know whether the gate ran.
- Persisting anything past the session, or across branches.
- Covering the sequence's other trigger — any pull request that changes code —
  which has no event this cheap to hang off.

## Decisions

### The trigger is a turn that committed, not a turn

A completed task group stays completed until the change is archived, so a
condition reading only the task file would fire on every turn afterwards,
including turns that answer a question. Keying on "this turn produced commits"
matches what the rule is actually about: work landing on the branch without
the sequence having reported.

That question needs a mark taken when control arrives, which is
`UserPromptSubmit`. It records `HEAD`; `Stop` compares. The pair is the whole
state: one ref, rewritten on the next prompt, scoped to the session's
directory. Nothing accumulates, so nothing needs pruning or reconciling — the
failure mode of a durable ledger is that it disagrees with the repository, and
a mark this short-lived cannot.

*Alternative considered*: a ledger keyed by change and branch, recording that
the sequence had reported. It is precise across sessions, and it is a second
source of truth about work whose first source is the repository — the shape
this project has twice been bitten by.

*Alternative considered, drafted in, and removed by review*: firing only while
the branch has unpushed commits. On its own it holds the obligation open
across every later turn, which is what the trigger above rejects. As an
additional condition it looked free — the push is the point past which the
sequence can no longer run first, so let the push discharge it. That reasoning
inverts in the one case that matters: a turn that commits *and pushes* before
it ends satisfies "pushed" and walks out silently, which is not the obligation
being discharged but the sequence being skipped. The condition would have
built the bypass into the gate. The report discharges it, and nothing else.

### Loop safety is structural, not a flag

A blocked turn must be endable by something the very next message can carry.
Both escapes are text: the sequence's gate line, or `BLOCKED` naming what only
the user can settle — the second of which `docs/review-toolkit.md` already
admits as a legitimate ending. So no repository state has to change for the
turn to end, and there is no configuration in which the hook can refuse
forever.

This matters more than it would elsewhere, because the field that would
otherwise carry loop protection is disputed. One reading of the documentation
reported a `stop_hook_active`; a second reading for it found nothing; the
review bot asserts it exists. Three summaries, no source — so this design
neither uses it nor denies it, and task 1.3 records what an actual event
payload carries.

What replaces it costs nothing extra, because the mark is already there. A
refused turn is *continued*, not restarted, so it submits no new prompt and
writes no new mark; refusing at most once per mark therefore bounds a
condition the model cannot satisfy to a single turn. Structural safety says a
loop cannot form; the once-per-mark rule says that even a mistaken condition
costs one turn rather than a conversation.

### The hook reads the task files, not the change's status

`openspec status` would answer "is a task group complete" authoritatively, and
it is a process launch on every turn end plus a dependency on the CLI being
resolvable. The task files are markdown with a fixed checkbox syntax that the
apply flow already parses, and reading them costs a glob. Changes under
`openspec/changes/archive/` are excluded by the glob, which is also what stops
an archived change from holding the gate open forever.

### What the hook does not claim

It reads `last_assistant_message` for a gate line. An agent that writes
`TRIAGE gate: PASS` without running `/triage` passes it. That is not a hole to
be closed here — closing it means running the gates from the hook, which is
the sequence itself — and the specification says so rather than implying a
guarantee the check does not have.

## Risks / Trade-offs

- **A second hook event, and a per-turn cost** → every turn end now launches a
  process, as every Bash call already does. The budget is **100 ms per event**,
  for each of the two hooks: a turn end happens once per turn where the Bash
  guard happens dozens of times, so the guard's 16–22 ms is the wrong bar, and
  100 ms is where a delay in an interactive tool stops being invisible. Over
  budget, the trigger narrows to repositories holding an `openspec/changes/`
  directory, which is the cheapest condition that removes the cost from every
  other repository the agent works in. The number is a judgement; the
  measurement that tests it is task 1.2.
- **The mark is written by one hook and read by another** → if
  `UserPromptSubmit` does not fire, `Stop` finds no mark. A missing mark SHALL
  be read as "unknown whether this turn committed" and, unlike the guard's
  convention, SHALL allow the turn to end: a hook that blocks whenever its
  partner is absent turns a partial installation into an unusable session.
  This is the one place this change chooses fail-open, and it is stated in the
  spec as a choice.
- **The project's tracked settings register `PreToolUse` only** → the ponytail
  plugin supplies its own `SessionStart` and `UserPromptSubmit` hooks, which
  fire in this session, so the events are live but the composition of a
  project-level entry with a plugin's is a claim this design does not make.
  Task 1.1 measures it before anything depends on it.

## Open Questions

None outstanding. The latch was settled with the user: the trigger is a turn
in which commits were made, checked before control returns.
