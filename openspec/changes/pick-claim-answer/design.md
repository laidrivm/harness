# pick-claim-answer — design

## Context

The motivation is in proposal.md, *Why*. The requirements are in
`specs/board-loop/spec.md` and `specs/task-board/spec.md`.

Here is a pass as `board-loop` built it, with the places this change touches
marked `*`:

```
runner (no Notion)                       pick session (claude -p, auto)
  takeable list   consider()   *answer candidates (step 2)
  idle if empty               *idle only if both are empty
  pickPrompt ------------------>  read Board view
                                *read applied, answered cards first (step 2)
                                *move the picked card to applying (step 1)
                <-----------------  PICK: <slug>
  accept from own lists       *or from the candidates (step 2)
  stage session: launch form  *answer form for a candidate (step 2)
  goal-check apply <slug> <n>     unchanged
```

These were measured on the live pass of `board-loop` task 2.4 (2026-10-14),
from the session transcripts and the gate ledger:

- The pick session ran from 18:05:08 to 18:05:45. The stage session started
  at 18:05:46 and set `Status` to `applying` at 18:10:40, with
  `update_properties` under `--permission-mode auto --permission-prompts none`.
- The first commit came at 18:12:46 and #126 opened at 18:21:03.
- The pick session read `Board view` in that same mode. Its tools are not
  restricted (`bun/board-loop-session.ts`). Only the prose of its prompt
  keeps it from writing.

Whether that mode lets a session call `notion-get-comments` has not been
measured. `card-questions` task 1.1 was refused it, but in another mode.

## Goals / Non-Goals

**Goals:**

- The board shows a card as taken within a second of the pick.
- A change whose card holds an unread answer is carried before anything else.
- Neither adds a session to the pass, a Notion token to the runner, or a
  ledger field.

**Non-Goals:** the proposal's *Non-goals*.

## Decisions

### The pick session moves the card, at once

The pick session has just read the card and named it, so it is the earliest
writer there is. When the card it names stands at `proposed`, it sets
`applying` and fetches the card again, as `core/feature-workflow.md` requires
of every status write. The card must be one it names in its `PICK:` line and
whose change is in the list it was given. A card already at `applying` is left
alone. That card is a later step of a change already under way.

The prompt line "change nothing anywhere" becomes "change nothing but that
card's `Status`". The stage session's launch form is unchanged. The Process
rule in `core/rules.md` still has the stage session move the card before its
first `/opsx:` command. After a successful claim that move writes what the
card already says, and after a failed one it is the fallback.

This replaces the decision *The card is the stage session's to move* in
`board-loop`'s design.

- *Alternative: the stage session moves it as its first act.* It already
  does so by rule, and that took 4 min 54 s on the measured pass. Making it
  sooner would need a line in its prompt, and its prompt is the goal's
  condition (`board-loop` design, *The card is the stage session's to move*).
  Loading and reading the artefacts also comes before its first tool call.
- *Alternative: a third session that claims the card once the runner has
  accepted the pick.* The order is stricter, but it costs about 40 s and a
  session on every pass, for a case the next pass heals anyway.
- *Alternative: the runner writes the board through Notion's REST API.* That
  needs a token with write access in the user's environment, and a database id
  that the public repository may not hold. It also reverses `board-loop`'s
  non-goal of reading or writing the board from the script. If a hard check
  is ever wanted, that choice is the user's.

### The runner does not check the move

The runner cannot read the board. A line from the pick session saying it
moved the card would be the session's word, not a verdict like
`goal-check`'s, so the runner does not gate on it. A failed move does not
stop the pass. The claim is a signal to people and to sessions that read the
board, not a lock. It is also no lock against another runner, because the
pick prefers `applying` cards itself.

### A pass that fails after the claim leaves the card where it is

The card stays in `applying` in three cases: the stage session dies before
its first commit, it times out, or the runner refuses the pick after the move
(for example, a malformed `PICK:` line). Nothing is rolled back and the ledger
gains nothing new. The pass's own `timeout`, `refused` or `open` record is the
trace.

The next pass then continues that card:

- untracked files do not stop the runner;
- a branch with no commits of its own sits inside `origin/main`, so the runner
  switches to `main`;
- the change is still takeable;
- the pick takes the `applying` column first.

- *Alternative: roll the status back.* That needs a session, and the runner
  does not know whether the failed session pushed. Rolling back would also
  remove the signal that makes the next pass continue the card.
- *Alternative: name the reason in the `loop` record.* The ledger forbids a
  slug or prose in a record (`gate-ledger`, *A record holds no command text*).

### An answered change is found by the pick session, from a candidate list the runner builds

`consider()` turns away an all-ticked change before any session reads the
board. So the runner keeps such a change, if it passes every other test, as
an answer candidate for step N+1 on `feat/<slug>-<N+1>`, under the same
`gh pr list` check. An open pull request there blocks a second take of the
same answer.

The pick session gets the candidates as a second list, with the condition
from `task-board`. The card's `Assign` holds the user. Its page-level
discussion, read with `include_resolved`, holds a comment from the same
account that does not open with `harness-question`, after the last one that
does. The mark is the only thing that tells them apart: on `scan-lift` the
question and the answer carry the same author.

A false pick costs one stage session, which finds no answer and ends with
`BLOCKED —`. The claim has then moved the card to `applying`, and it stays
there with nothing to continue. The user moves it back. The session's
`BLOCKED —` line and the pass's `open` record name it.

- *Alternative: the runner reads the comments.* It holds no Notion token.
- *Alternative: take any comment newer than the last question.* The agent
  writes from the same account, so its own comment would pass as the answer.

### Answered cards come first, from `applied` as well

Leaving an answered change for last would let it reach the archive with its
answer unread. Every change whose `after:` names it would also wait on that
archive. The step is small by construction, and the user has already decided.
So answered cards go before the `applying` column, in `Board view` order among
themselves.

Such a card stands in `applied`, or it lags in `applying` as `scan-lift`'s
did. The pick today reads only `applying` and `proposed`, so it reads
`applied` too. The claim covers the move from `applied` back to `applying`.

### The answer becomes a new step, written by the step's own session

The stage session reads the question and the answer as data. It writes group
N+1 into `tasks.md`, and extends `design.md` or the delta where the answer
widens the design, as #127 did by hand for `scan-lift`. It checks that the
step fits `change-slicing`, then carries the group with `/opsx:apply`. All of
this happens in one pull request.

The answer variant of the launch form changes only its first line. That line
names the answer and the group to write. The unattended line and the
condition stay `stage-goal`'s, so the verdict is `goal-check apply <slug>
<N+1>`. `goal-check` reads `tasks.md` at the session's `HEAD`, so it judges a
group the session wrote without any change to it.

Writing artefacts after the build has finished departs from Stage 2's "don't
rewrite the proposal mid-build". An answer arrives once every group is ticked,
and #127 is the precedent. This is the user's to confirm, and it is listed
under the pull request's *Check by hand*.

An answer may choose a separate change, or its work may not fit one step. Then
the session files an `idea` card, which is the route the `scan-lift` question
itself offered. It adds no group, and the pass records `open` with
`tasks.md has no group N+1`. Shortcut: no outcome of its own for an answer
that needs no code. Add one if such answers become common.

- *Alternative: a propose step that writes the group, then an apply step.*
  That means two pull requests and two merges for one decision, and
  `change-slicing` does not require the split.
- *Alternative: a new card by default.* That runs a full explore and propose
  for a few lines, when the user said "fix it right there".
- *Alternative: amend the open pull request.* That is the later slice
  *Pull requests and CI on each pass*.

### The answer counts as applied when its pull request opens

`task-board` already clears `Assign` in the turn an answer is applied. For an
answer the loop carries, that turn is the one the step's pull request opens,
or the one the card is filed. It is never earlier. A session that dies
before its pull request leaves `Assign` set, so the next pass takes the
answer again. Once the pull request is open, `feat/<slug>-<N+1>` has a pull
request, and that alone stops a second take.

Resolving the discussion is neither a signal nor a mark. The answer is read
from a resolved discussion too, and the user can withdraw a question without
answering it by clearing `Assign`.

- *Alternative: a reply in the thread as the mark.* The question gate refuses
  `reply` (`bun/question-gate.ts`), and widening it would let the agent speak
  for the user beyond the one exception.
- *Alternative: a ledger record as the mark.* The ledger is local to a clone,
  and a record names no change (`bun/goal-check.ts`).

### Reading the comments under `claude -p`

Step 2's first task measures whether the pick session, in auto mode with
`--permission-prompts none`, can call `notion-get-comments`. If it cannot, the
runner passes `--allowedTools` for that tool to the pick session and to an
answer step's stage session, under both server names `card-questions` found
(`claude_ai_Notion` and `notion`). `card-questions`' design already proposed
this. A tracked allow rule would name one machine's server.

## Risks / Trade-offs

- [The pick session moves a card and then the runner refuses its line] → The
  card waits in `applying`. The next pass takes it first and carries it.
- [Every applied change that is not yet archived is a candidate, so the pick
  reads its comments on every pass] → The list holds only changes that are
  `proposed` in the tree with no open pull request. These are few between
  archives, and one read per card is cheap next to a stage session.
- [The pick takes a candidate with no answer] → One stage session ends with
  `BLOCKED —`, and the card is left in `applying` for the user to move back.
- [`notion-get-comments` is refused in auto mode] → The fallback in
  *Reading the comments under `claude -p`*. Until then no answer candidate is
  ever picked, and the pass behaves as it does today.
- [A local `feat/<slug>-N` branch left by a dead session makes the next
  `git switch -c` fail] → This is not measured. The stage session follows
  `git-and-prs.md` for an existing branch. Step 1's live pass looks for it.

## Migration Plan

This applies after `board-loop` archives (#125), in two steps:

1. `feat/pick-claim-answer-1`: the claim.
2. `feat/pick-claim-answer-2`: the answered question.

Nothing is registered. Rolling back means reverting the prompt and
`consider()`. A card left in `applying` by the claim is the user's to move.
