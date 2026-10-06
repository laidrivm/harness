# pre-pr-sequence-gate

## Why

`docs/review-toolkit.md` says completing a task group starts the pre-PR
sequence in the same turn, and never to ask whether to run it. On 2026-08-19
that turn ended with "Want me to run it?" — in a session that had read the
file whole, hours earlier, while sweeping it for a different change. So the
failure was not an absent rule or an unloaded one: the text was in context and
the turn ended anyway. That is the failure `commit-gates` was created for,
stated in its own purpose — a prohibition the agent can restate and still walk
past.

## What Changes

- A `Stop` hook refuses to end a turn that made commits, while a task group in
  an active change is fully ticked, unless the turn's final message carries
  the sequence's gate line or `BLOCKED` with what only the user can settle.
  The report is the only thing that discharges it; pushing the branch is not,
  since a turn that commits and pushes is what the sequence exists to precede.
- A `UserPromptSubmit` hook records `HEAD` when control arrives, so "this turn
  committed" is answerable at the end of it. Without that mark the hook would
  have to fire on every turn, including the ones that only answer a question.
- `docs/review-toolkit.md`'s "never ask whether to run it" shortens to what
  the hook cannot see, per *A mechanised prohibition leaves its prose home*.

## Non-goals

- Judging whether the sequence was run *well*. The hook reads for a gate line;
  a gate line the agent wrote without running the gate is a lie the hook
  cannot catch, and pretending otherwise would make the check's guarantee read
  stronger than it is.
- Reaching turns that commit without an OpenSpec change in play. The sequence
  applies to every pull request that changes code, and the hook covers the
  trigger the rule states — a completed task group — not the whole rule.
- State that outlives the session. The mark is one turn's `HEAD`, rewritten on
  the next prompt; nothing accumulates and nothing needs pruning.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: gains a requirement that a turn which commits may not end
  silently while a task group stands complete.

### Unmodified, but adjacent

- `agent-permissions` states how the `PreToolUse` guard is registered and
  pinned. Its test flattens `settings.hooks.PreToolUse` before asserting a
  length of one (`agent-permissions.test.ts:50-64`), so two registrations on
  other events do not break it, and no requirement of that capability changes.
- `local-review-loop` owns what `/coderabbit-local` does inside the sequence.
  This change gates when the sequence must have run, not what it does.

## Impact

- `.claude/settings.json`: two new hook registrations, on events the tracked
  settings do not use today.
- A new script holding both halves, and its tests.
- `docs/review-toolkit.md`: one sentence shortened.
- Every turn now pays one hook launch at its end, on top of the per-Bash-call
  guard. The cost is a measurement this change owes, not an estimate.
- No dependency, no CI change, no client code.
