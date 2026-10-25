# ci-flow-draft

## Why

On 2026-10-25 the user set the rule #273 merged (`core/rules.md`, Process;
`core/git-and-prs.md`): an agent that works on an existing pull request marks
it draft as it starts, pushes while it is still draft, and marks it ready
immediately after the push succeeds, or as soon as it knows no push will
come; a question to the user on the card keeps it draft. CodeRabbit skips a
head pushed to a draft and reviews on the switch to ready, so ready before
the push reviews the old head and then the new one. The same day the user
asked for the host to follow it too ("Да, заводи отдельную карточку под vps и
делай").

On the host the only path that pushes into an existing pull request is the CI
flow, `bun/ci-run.ts`: it pushes the session's fix with no draft toggle, and
`core/git-and-prs.md` names it as the exception. The board loop skips a step
whose pull request is open, and the `pr-sweep` only runs GitHub's own
update-branch and skips drafts.

## What Changes

- On the pull request route, the CI flow marks the pull request draft
  (`gh pr ready <n> --undo`, as the runner, with the App's token) before the
  clone is brought to the branch and the session resumes.
- Once its work ends it marks it ready (`gh pr ready <n>`): right after a
  successful push, or, with no push coming, as soon as it knows — every other
  outcome, failures included.
- A session that answers `blocked` has put its question on the card, so the
  pull request stays draft.
- A ready that `gh` refuses fails the flow, naming the pull request; a draft
  that `gh` refuses does not stop the session.
- `core/git-and-prs.md` drops "The runner does not follow this".

Not in this change: the flaky and scheduled routes, which change nothing on
the branch; who marks a `blocked` draft ready once the user answers, which
`draft-until-answered` gives the board loop (design, *After a question*).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator`: the CI flow keeps the pull request draft while it works on
  it, and marks it ready once that work ends with no question on the card.

## Impact

- `bun/ci-run-draft.ts` (new, `draftWhile()`), `bun/ci-run.ts` (`resume()`
  says whether the session asked), `bun/ci-run.test.ts`.
- `core/git-and-prs.md`'s PR bullet.
