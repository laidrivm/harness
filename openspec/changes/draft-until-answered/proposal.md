# draft-until-answered

## Why

On 2026-10-25 the user set a new process: an agent always opens its pull
request with the work, and keeps it a draft while a question to the user
stays open, so that no review fires before the answer — "always" meaning both
local sessions and the host. CodeRabbit skips drafts (`.coderabbit.yaml` sets
no `drafts` override), so a pull request marked ready is one whose review
starts. The board loop does the opposite today: `publish()` in
`bun/board-loop-push.ts` opens every step's pull request ready, the one whose
session has just put a question on the card included, so CodeRabbit reviews
work the answer may still change. CodeRabbit flagged the docs' side of this
as a Major on #255 (`core/git-and-prs.md:72-77`); #255 rewrites those docs
for local sessions, and this change makes the runner keep the same rule.

## What Changes

- The runner opens a step's pull request as a draft (`gh pr create --draft`)
  when the session's question reached the card: posted by the runner,
  answered by the triage but not yet carried, or already waiting there.
  A step with no question opens ready, as today.
- Where the session posts its own question (the ask command, or the
  connector on a machine with neither integration), its launch form has it
  repeat the question under a `QUESTION:` line too, so the runner sees it.
- A change whose step's branch has an open draft pull request is an answer
  candidate for that same step on that same branch, where today it is passed
  over as "pull request is open". The answer pass continues the branch,
  writes the answer into the step's work, and the runner pushes it.
- When that pass ends with no new question on the card, the runner marks the
  pull request ready (`gh pr ready`) and, with the integration, removes the
  user from the card's `Assign`. A pass that asks again leaves it a draft.

Not in this change: the docs for local sessions (#255 carries them, and this
change lands after it); the loop's propose stage, which `loop-every-stage`
adds and which should open its draft pull request through this rule instead
of pushing with none (design, *Overlaps*); a draft the user or another agent
made, which the runner never marks ready unless it carried that branch's
answer; clearing `Assign` on a machine with no integration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board-loop`: the runner opens a step's pull request as a draft while its
  question waits on the card, carries the answer on that branch, and marks
  it ready once no question is left.

## Impact

- `bun/board-loop-push.ts` (`publish()` takes the draft flag),
  `bun/board-loop.ts` (the candidate, the draft decision, `gh pr ready`),
  `bun/board-loop-prompt.ts` (the continuation's work and the repeated
  `QUESTION:` line), `bun/pull-requests.ts` (a pull request's `draft`),
  `bun/notion-bot.ts` (removing the user from `Assign`); their tests.
- `core/feature-workflow.md` (the launch form, kept in step with the prompt
  by `bun/board-loop-question.test.ts`) and `README.md`'s board-loop
  paragraph, once #255 has merged.
- Lands after #255, which edits `core/git-and-prs.md` and
  `core/feature-workflow.md` for local sessions.
