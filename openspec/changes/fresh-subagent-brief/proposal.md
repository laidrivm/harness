# fresh-subagent-brief

## Why

A session that hands work to a fork pays for its whole conversation again:
in the session of 2026-10-22…24 each fork started at about 885k tokens, a
one-line card edit included, and cached reads count against the subscription
limit too. The user decided (2026-10-24) that an orchestrating session
delegates to a fresh subagent with a brief instead, and (2026-10-25) that the
brief is the task and the context that goes with it, nothing more: a fresh
subagent runs on the same harness, so nothing the harness already gives it is
copied in. Nothing in the tree says either today.

## What Changes

- `core/rules.md` gains one line in its `### Rules` preamble, beside the ones
  to `verification.md` and `autonomy.md`, stating the rule: delegate to a
  fresh subagent, forking only when the task needs the session's history, and
  write its brief into the launch prompt, never into git — the task, the clone
  and branch, the acts allowed, the user's words that apply and the report's
  form, and nothing the harness already loads. Every session — the board
  loop's on the VPS and a cloud one included — reads it. No sublist grows.
- A test, `bun/delegation.test.ts`, pins that line.

No new doc: the line is the whole rule, so a doc behind it would hold nothing
the line does not (design, *One line, no doc*).

Not in this change: the board loop's stage prompt (user decision 1), the
approval model before a pull request, which its own card writes into the
harness, conventions of this repository that no file writes down yet (the
300-line cap, the `flock` cases that skip on macOS), and any check of a brief
itself, which lives only in a launch prompt.

## Capabilities

### New Capabilities

- `delegation`: how a session hands a task to a subagent — a fresh one with a
  brief, a fork only for history — and what the brief holds.

### Modified Capabilities

None.

## Impact

- `core/rules.md` (one line), `bun/delegation.test.ts` (new).
- Consumers receive the line through `bun/sync.ts`, which already copies
  `core/rules.md`; nothing to change there.
