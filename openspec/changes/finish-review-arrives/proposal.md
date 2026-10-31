# finish-review-arrives

## Why

`work.ts finish` pushes into the draft and marks it ready 0–3 s later, and
CodeRabbit sometimes never reviews the head it was marked ready at: of ten
such switches on #332, #338, #342 and #344, four were reviewed, three were
left on the push's `Review skipped` check run with no run of their own for
the ready, and three hit the bot's rate limit, which it does not retry. Each
time the agent waited on a review that would not come until the user asked
for it by hand with `@coderabbitai review` (card *Notice when CodeRabbit
skips the head a PR was marked ready at, and get the review asked for*,
explored 2026-10-29). The likeliest cause is a race of the push's event and
the ready event on one commit — a hypothesis from timings, which nothing in
CodeRabbit's documentation confirms or rules out.

The user settled the explore's question on 2026-10-31: `finish` separates
the ready switch from the push and says afterwards whether the review is
coming (answer 1 a); on a skipped head it posts `@coderabbitai review` under
whatever GitHub identity it runs with (answer 2), with standing permission to
post exactly that line under the user's own account on the laptop (answer
4 b); on a rate limit, a local session reports and stops, and a session on
the host has Windmill post the request once the window opens (answer 3).

## What Changes

- One module, `bun/coderabbit-run.ts`, reads CodeRabbit's check runs on a
  commit and names its state: `reviewing`, `reviewed`, `rate limited`,
  `skipped`, another conclusion by name, or no run.
- `finish`, where the checkout tracks `.coderabbit.yaml`, waits after the
  push up to about 60 s for a CodeRabbit run on `HEAD` before the question
  read and the ready switch, so the push's event is handled before the
  ready one.
- After the ready switch `finish` reads `HEAD`'s runs for up to about 90 s
  and ends on one line saying `ready #N` and CodeRabbit's state of `HEAD`.
- On a head still only skipped, `finish` posts `@coderabbitai review` on the
  pull request, once per head: not when such a comment was already posted
  after the head's first CodeRabbit run, and never more than one per call.
- On `rate limited`, `finish` asks for nothing; the agent reports the pull
  request and stops. A session on the host does the same until Windmill can
  post the request when the window opens, which a follow-up card holds.
- `core/review-toolkit.md` names `finish`'s line as where a skipped or
  rate-limited head is first seen; the `README.md` row for `finish` says it.

Not in this change: the Windmill job for a rate limit (roadmap stage 6), the
board loop's and `ci-run`'s own ready switches on the host, which mark a pull
request ready without `finish`, and the `coderabbit` skill's step 1 reading
the check run through the same module (card
`40539875c31b8168a338eb254c353d08`). `.coderabbit.yaml` is untouched and
CodeRabbit's draft reviews stay off.

## Capabilities

### New Capabilities

None. The check-run reading is `work-finish`'s until card
`40539875c31b8168a338eb254c353d08` gives the skill the same reading.

### Modified Capabilities

- `work-finish`: `finish` waits for CodeRabbit's draft run before the ready
  switch, reports CodeRabbit's state of the head after it, and asks once for
  the review of a head CodeRabbit skipped.

## Impact

- New: `bun/coderabbit-run.ts` and its test, `bun/work-finish-review.test.ts`.
- Changed: `bun/work-finish.ts`, `bun/work-finish.fixture.ts` (the `gh`
  stub answers the check-run and comment reads and logs the comment),
  `core/review-toolkit.md`, `README.md`.
- Every `finish` in a repository that tracks `.coderabbit.yaml` takes longer:
  about 7 s before the ready switch and 25–35 s after it when the review
  starts, up to 60 s and 90 s when it does not.
- On the laptop `finish` posts under the user's GitHub account, on exactly
  the terms answer 4 b grants; under a GitHub App's token it posts as the
  App's bot.
