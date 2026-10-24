## Context

`end()` in `bun/board-loop.ts` maps `met` and `idle` to exit 0 and every other
outcome to 1. `pass.sh` pauses on any non-zero status: it writes
`<clone>.stop` and every later tick exits 3 until the user removes the file.
A stage session that needs the user writes a `QUESTION:` line; the runner
posts it with `post()` in `bun/notion-bot.ts`, which prints one line:
`question: posted on <card>, Assign set`, `… Assign not set — …`, `… and
answered from …`, or `question: not posted — <why>`, one of whose reasons is
`a question already waits on <card>`. The pass then runs the goal check,
which reads `goal open` while the group holds the task the question is about.

## Goals / Non-Goals

**Goals:** a pass that ends waiting on the user exits 0 and leaves no stop
file; the next tick skips the waiting card instead of re-running its stage;
real failures still pause.

**Non-Goals:** the WIP limit and the other stages (card *Let the board loop
carry every status's next stage*); a resume timer for an exhausted
subscription; questions posted by anything but the runner.

## Decisions

### A `waiting` outcome, exit 0

The pass records `waiting` when the goal check reads `goal open` and
the question line `post()` printed starts with `question: posted on`, or
names `a question already waits on` the card. It prints
`board-loop: waiting — <change> step <n>: question on <card>` and exits 0.

Exit 0 rather than a new status: `pass.sh` then needs no change, and its rule
stays one line (any non-zero pauses). The cost is that Windmill shows the job
green. The card's `Assign` is what tells the user, not the job's colour.

`question: not posted` for any other reason is no `waiting`: the user has not
been asked, so the pass stays `open` and pauses, as today. A question the
triage answered (`… and answered from …`) is `waiting` too: nothing failed,
and the next pass carries the answer.

The runner reads the two prefixes from constants `bun/notion-bot.ts` exports
and `post()` uses, never from a copy of the strings.

### The pick passes over a waiting card

Without this, the next tick picks the same takeable change, its stage session
re-reads the unanswered question, asks again, `post()` refuses with `a
question already waits`, and the pass ends `waiting`: no harm, but one stage
session an hour per waiting card. The pick prompt gains one rule: pass over a
takeable change whose card's page-level discussion holds a comment opening
with `harness-question` and, after the last one, neither a comment by the
user opening with neither mark nor a `harness-answer` by the integration's id
— the same test `waits()` makes.

The pick is a session, so this is a prompt rule, not a check the runner makes.
The runner's `post()` refusal stays the backstop.

### Settled with the user (2026-10-24, on the card)

Every item went as recommended: a waiting pass exits 0 (1); a question posted
with `Assign not set` still waits, with no pause (2); the `waiting` outcome,
an unposted question staying `open`, a triaged question counting as waiting
and the pick passing over a waiting card stand (3–6); `post()`'s refusal of a
second question stays the backstop for a pick that takes a waiting card
anyway, rather than a runner-side check before the sessions (7, 10); only the
runner posts questions on the host, and the WIP limit and the resume timer
belong to the card for the loop taking every status (8, 9).

`waiting` needs the verdict to read `goal open`: a push origin refused, or any
other failure after the question, stays `open` and pauses.

## Risks / Trade-offs

- [A green job hides a waiting card from someone who reads only Windmill] →
  `Assign` is set on the card; the pass's line names the card.
- [A question posted with `Assign not set` waits unseen] → it is still
  `waiting`; the line says `Assign not set`, and the board shows the question.
- [The pick misreads the discussion and takes a waiting card] → the stage
  session asks again, `post()` refuses, the pass ends `waiting`: one wasted
  session, no pause.
