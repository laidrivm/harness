# fresh-subagent-brief

## Why

A session that hands work to a fork pays for its whole conversation again:
in the session of 2026-10-22…24 each fork started at about 885k tokens, a
one-line card edit included, and cached reads count against the subscription
limit too. The user decided (2026-10-24) that an orchestrating session
delegates to a fresh subagent with a self-contained brief instead. Today that
brief lives in one session's scratchpad, so the next session starts without
it, and nothing in the tree says to prefer a fresh subagent at all.

## What Changes

- A new doc, `core/delegation.md`, holds the rule — delegate with a fresh
  subagent and a brief; fork only when the work needs this session's history
  — and what a brief carries: only what a fresh subagent cannot read itself.
  It restates no rule of `core/rules.md`, which a fresh subagent loads on its
  own, and holds no host address, user id or scratchpad path, which come from
  the session.
- `core/rules.md` gains one pointer line in its `### Rules` preamble, beside
  the ones to `verification.md` and `autonomy.md`, so every session — the
  board loop's on the VPS and a cloud one included — sees the rule without
  reading the doc. No sublist grows: Process stays at its count.
- `CLAUDE.md` lists the new doc among those the rulebook links.
- A test, `bun/delegation.test.ts`, pins the pointer, and fails when the doc
  copies a rule of `core/rules.md` word for word or holds an IPv4 address, a
  UUID or an absolute home or temp path.
- **User decision.** Whether the board loop's stage prompt
  (`bun/board-loop-prompt.ts`) gains a line of its own; proposed: no, since
  the pointer line already reaches loop sessions (design, *The stage prompt
  stays as it is*).

Not in this change: the approval model before a pull request, whose wording
a card of its own owns (the brief names that it carries one, not what it
says), the loop's other session feedback
(`loop-reads-feedback`), conventions of this repository that no file writes
down yet (the 300-line cap, the `flock` cases that skip on macOS), a skill
form of the brief, and any check that a session actually chose a fresh
subagent.

## Capabilities

### New Capabilities

- `delegation`: how a session hands a task to a subagent — a fresh one with
  a brief, a fork only for history — and what the brief may and may not hold.

### Modified Capabilities

None.

## Impact

- `core/delegation.md` (new), `core/rules.md` (one line), `CLAUDE.md` (one
  link), `bun/delegation.test.ts` (new).
- Consumers receive the doc through `bun/sync.ts`, which copies every
  Markdown file of `core/`; nothing to change there.
- `bun/board-loop-prompt.ts` only if the user decides so; then it collides
  with `loop-reads-feedback`, which edits the same stage prompt and its
  five-line test (design, *Collisions*).
