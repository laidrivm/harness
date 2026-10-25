# draft-until-answered — design

## Context

A pass (`pass()` in `bun/board-loop.ts`) runs the stage session, reads its
`QUESTION:` line with `asked()`, has `post()` in `bun/notion-bot.ts` post it
(printing a line that opens with `POSTED` or `ALREADY` when the question is
on the card), then calls `publish()` in `bun/board-loop-push.ts`, which
pushes and runs `gh pr create` with no `--draft`. `consider()` passes over a
change whose step's branch has any open pull request, so a question asked
beside a pull request is answered only once that pull request has merged:
every group ticked makes the change an answer candidate for step N+1 on a
new branch. A draft cannot be merged, so with drafts and nothing else the
change would wait for ever: unticked on the default branch, and a pull
request open on its branch.

`readPullRequests()` in `bun/pull-requests.ts` maps the REST list, which
carries `draft`, to `{ number, state, headRefOid }`. `pr-sweep` already skips
a draft agent pull request, so a draft is left alone there too.

## Goals / Non-Goals

**Goals:** the runner's pull request is a draft exactly while its question
waits on the card, the answer is carried on that pull request's branch, and
the pull request goes ready once nothing is left to ask.

**Non-Goals:** local sessions' docs (#255); the propose stage that
`loop-every-stage` adds, whose own group 5 takes this mechanism; marking
ready a draft the runner did not carry.

## Decisions

### The draft decision is the runner's own reading of its post

Draft when `asked()` returned a question and the post line opens with
`POSTED` or `ALREADY`, or, with no integration, when `asked()` returned a
question at all. The runner already has both; it reads no card for this.
Rejected: reading the card's comments after the post (one more Notion call,
and a card id the runner has only from the `QUESTION:` line anyway); drafting
on any `QUESTION:` line, which leaves a draft nobody is asked about when the
line was malformed or the post failed. A question that never reached the
card opens the pull request ready, as today, and the pass prints why the
question was not posted.

### A triage-answered question still drafts

The triage's `harness-answer` settles the question but nothing has carried
it: the pull request holds the work from before the answer. The pick takes
the card as answered, and the continuation marks it ready.

### Sessions that post their own question repeat it

On the laptop the session posts through the ask command or the connector,
so the runner sees nothing. Those two launch forms gain one sentence: repeat
the question under a `QUESTION: <card id>` line before any `PR-TITLE:`. With
no integration the runner already prints "not posted — no integration is
configured" for that line and posts nothing; that wording becomes "posted by
the session", so the log does not read as a lost question.

### The answer continues the draft's branch

`consider()` returns, for an open draft on the step's branch, the same step
and branch with `answer: true` and the draft's number. The branch is on
`origin`, so `left()` marks the step resumed and the launch form tells the
session to switch to it. Its work line: apply the card's answer to this
branch's step, its artefacts, code and tasks, then the pre-PR sequence.
Rejected: carrying the answer as step N+1 on a new branch, which needs the
draft merged first, the deadlock above; leaving the ready mark to the user,
which the user's process puts on the agent.

### `Assign` goes when the pass reads the answer, ready goes after the push

Settled by the user on `bot-notion-writes` on 2026-10-25 (its item 5), which
replaces this card's decision 5 for `Assign`: `Assign` is removed as soon as
the user's answer is read — the pass that picks up the answer clears it
before acting on it — and set back only when a new question comment is
posted. With question 1 here answered (а) on 2026-10-25, this change lands
first and owns the small `unassign()`, and `bot-notion-writes` reuses it.

With the integration, the pick session names the card of a draft-branch
candidate it takes in one `CARD: <id>` line beside its `PICK:` line, read as
`asked()` reads `QUESTION:`; the runner checks it with `carded()` and, before
the stage session starts, calls `unassign()` in `bun/notion-bot.ts`, beside
`post()`'s own `Assign` write: it reads the card's `Assign` and writes it
back without the user, leaving anyone else. A missing or refused `CARD:` line
writes nothing and is printed; the pass goes on. `bot-notion-writes` extends
the same line to every pick and adds the claim. Without the integration this
change writes no `Assign` (assumption 9); who clears it there is question 3
on the `bot-notion-writes` card, open on 2026-10-25.

After `publish()` returns no reason — the push went through, and
`gh pr create` failed because the pull request exists, which *The pull
request already exists* already allows — the runner runs
`gh pr ready <number>` with the same credentials, and writes no `Assign`. A
new question sets `Assign` again through `post()`, and the pull request
stays a draft. Clearing at the read rather than at ready is also what keeps
a draft that merges with every group ticked from being carried twice as an
answer candidate for step N+1: its card no longer holds the user.

Rejected: clearing at `gh pr ready` (this card's decision 5 as first
written), which the user's rule replaces; having the runner look the card up
by its `Pointer`, which needs the board's data source id the runner does not
hold (`harness.board` is a title).

### Spec shape: one requirement modified, two added

Only *The runner pushes the step and opens its pull request* is modified,
by one sentence and one scenario. The candidate rule is an added
requirement rather than an edit of *A pass takes only a takeable change*,
which `loop-every-stage` and `reopened-group-branch` both modify.

### Settled with the user (2026-10-25, on the card)

1 (а): this change lands before `bot-notion-writes`, with its own small
`unassign()` that the other reuses; by the user's rule from that card,
`Assign` is cleared when the pass reads the answer, not at ready (*`Assign`
goes when the pass reads the answer, ready goes after the push*). 2 (а): a
triage-answered question keeps the pull request a draft until the pass that
carries the answer. 3 (а): `loop-every-stage`'s group 5 is changed now so its
propose stage opens a draft pull request through this mechanism. 4, 6, 7, 8:
as decided above. 5: the answer is carried on the draft's own branch, and the
runner marks it ready with no new question; its `Assign` half is replaced by
the user's rule. 9: on a machine with no integration the session repeats its
question under a `QUESTION:` line, and this change clears no `Assign` there.
10: implementation after #255, which has merged.

### Taken while applying (2026-10-25)

- **The draft-while-working rule already covers the continuation.** Since
  the proposal, `rules.md` and `git-and-prs.md` (#271, #273) have an agent
  mark a pull request draft as it starts work on it and ready right after
  its final push. The runner's continuation needs no `gh pr ready --undo`:
  `consider()` takes the branch only while its pull request is a draft. It
  pushes while the draft stands and runs `gh pr ready` after the push, which
  is the rule's order, so no task was added for it.
- **`ready()` reused, `draftWhile()` not.** The runner calls `ready()` from
  `bun/ci-run-draft.ts` (#276), now exported. With an empty repository it
  passes no `-R`, so `gh` marks the pull request in the working directory's
  repository, the one whose `origin` `readPullRequests()` found the draft in.
  `draftWhile()` itself does not fit: it marks ready when its work throws,
  which here would start a review on an answer not yet carried, and it turns
  a refused ready into a failed outcome, where *Marking ready fails* keeps
  the check's.
- **Files split at the cap.** `consider()` sits in
  `bun/board-loop-takeable.ts`, where `reopened-group-branch` (#282) moved
  it; its `read()` answers a draft's number, and either branch it reads turns
  that into the draft's step. The cases of
  1.3 and 1.4 go in a new `bun/board-loop-draft.test.ts`, since
  `bun/board-loop-question.test.ts` stands at 262 lines; the triage-answered
  case is one assertion in `bun/notion-triage-pass.test.ts`, whose stand-in
  already answers it. The stand-in pass helper moves to
  `bun/notion-bot.fixture.ts` (`against()`), and the REST listing helper to
  `bun/board-loop.fixture.ts` (`listed()`), so both test files share one copy.
- **The no-integration line** reads `question: posted by the session — no
  integration is configured`: it keeps the words the scenario *A question
  with no integration* names, and a malformed line there still reads `not
  posted`.
- **The repeated `QUESTION:` sentence** sits in the two shared fourth lines,
  so a hand-launched session repeats its question too; nothing reads it there,
  and one line per form is kept rather than four.
- **`unassign()`** reads the page again after `carded()` for `Assign`, and
  writes the list back without the user whether or not the user was on it.

## Overlaps

- **#255** edits `core/git-and-prs.md` and `core/feature-workflow.md` for
  local sessions. This change edits `core/feature-workflow.md`'s launch form
  after #255 merges, so group 1 starts only then.
- **`loop-every-stage`** (unmerged): its propose stage pushes `spec/<slug>`
  with no pull request and treats "no pull request has used it" as the answer
  candidate. Under the user's rule it should open the proposal's draft pull
  request through the normal `PR-TITLE:` path, and its propose answer
  candidate is this change's draft-branch candidate. Its group 5 should drop
  `publish()`'s push-only mode, and its delta of *A pass takes only a
  takeable change* should be re-copied once this change is archived.
- **`bot-notion-writes`** (unmerged): settled on both cards on 2026-10-25
  (question 1 here, (а); item 5 there) — this change lands first, and
  `bot-notion-writes` clears `Assign` neither at `gh pr create` nor at ready
  but when the pass reads the answer, right after its claim, reusing this
  change's `CARD:` line and `unassign()`.
- **`answer-match`** (unmerged): its tag names "the next step" when a pull
  request is to open. With this change the answer is carried on the same
  step, so the tag is the carried step either way (decision 8). It clears
  `Assign` when the pass reads the answer too; whichever lands second keeps
  one clear per pass.
- **`loop-every-stage`** (unmerged): settled by question 3 here, (а) — its
  group 5 is changed now, on its own branch, so its propose stage opens a
  draft pull request through this mechanism.
- None of the three is on the default branch, so `.openspec.yaml` names no
  `after:`; the order is in the approval comment.

## Risks / Trade-offs

- [A draft made by hand on a loop branch] → `rules.md` has an agent mark a
  pull request draft while it pushes. The loop lists that change as an answer
  candidate, and the pick takes it only with an answered question on the
  card, so a draft with no question waits as before.
- [Ready fails] → the pull request stays a draft with `Assign` already
  empty; the runner prints the failure for the user to mark it ready.
- [The pass dies after the clear] → until `answer-match` lands, the pick
  takes a user's answer only while `Assign` holds the user, so the draft
  waits with its answer read and `Assign` empty; it shows as an open draft
  pull request, and `answer-match`'s tag pick removes the stall.
- [Laptop with no integration] → this change writes no `Assign` there, as
  today (assumption 9); question 3 on the `bot-notion-writes` card settles
  who does.
