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
`loop-every-stage` adds; `Assign` on a machine with no integration; marking
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

### Ready, then `Assign`

After `publish()` returns no reason — the push went through, and
`gh pr create` failed because the pull request exists, which *The pull
request already exists* already allows — the runner runs
`gh pr ready <number>` with the same credentials. Only when it succeeds does
it remove the user from `Assign`: it reads the card's `Assign` and writes it
back without the user, from the integration, in a small `unassign()` beside
`post()`'s own `Assign` write. Without it, a draft that merges with every
group ticked becomes an answer candidate for step N+1 whose answered
question and `Assign` would have the loop carry the same answer twice.

### Spec shape: one requirement modified, two added

Only *The runner pushes the step and opens its pull request* is modified,
by one sentence and one scenario. The candidate rule is an added
requirement rather than an edit of *A pass takes only a takeable change*,
which `loop-every-stage` and `reopened-group-branch` both modify.

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
- **`bot-notion-writes`** (unmerged): it removes the user from `Assign` once
  `gh pr create` succeeds. With a question just posted that clears the
  `Assign` the pick needs for the answer. It should key the removal on the
  pull request being ready (opened ready, or marked ready here) and call
  this change's `unassign()`, or this change calls its REST card write if it
  lands first.
- **`answer-match`** (unmerged): its tag names "the next step" when a pull
  request is to open. With this change the answer is carried on the same
  step, so the tag is the carried step either way. It also clears `Assign`
  when the session takes the answer; the runner's removal then finds no user
  and writes nothing.
- None of the three is on the default branch, so `.openspec.yaml` names no
  `after:`; the order is in the approval comment.

## Risks / Trade-offs

- [A draft made by hand on a loop branch] → `rules.md` has an agent mark a
  pull request draft while it pushes. The loop lists that change as an answer
  candidate, and the pick takes it only with an answered question on the
  card, so a draft with no question waits as before.
- [Ready fails] → the pull request stays a draft, `Assign` stays, and the
  next pass carries the answer again on the same branch; the session finds
  the answer already in and changes nothing.
- [Laptop with no integration] → `Assign` is not cleared there, as today;
  `bot-notion-writes` owns that write.
