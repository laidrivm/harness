# ci-flow-draft — design

## Context

`ci-run-agent`'s design, *The session*, has the CI flow resume the step's
session on a failed run and push what it fixed, under the repository's lock.
The pull request's draft state is never touched. The rule #273 merged asks an
agent working on an existing pull request to hold it draft while it works,
and to mark it ready right after its push, or once no push will come, unless
a question to the user on the card is open. `bun/ci-run.ts` stood at 296 of
its 300 lines.

## Decisions

### `draftWhile()` wraps `resume()`

`bun/ci-run-draft.ts` holds `draftWhile(repo, n, work)`. It runs
`gh pr ready <n> -R <repo> --undo`, then `work`, then `gh pr ready <n> -R
<repo>` unless `work` says a question is open. `decide()` hands it
`resume()`, which answers its outcome and whether the session answered
`blocked`. The push is `resume()`'s last act, followed only by the clone's
cleanup, so ready comes right after it. The draft comes before the clone is
brought to the branch, so the whole of the runner's work on the branch is
inside it. `gh` runs as the runner with the App's token in `GH_TOKEN`, as
`gh run view` already does, and the token's `pull_requests: write` covers
both. Rejected: toggling inside `resume()`, which would push `bun/ci-run.ts`
past its cap and spread the toggle over its ten exits.

### What keeps the draft

Only an answer of `blocked`: both prompts ask a session that answers it to
put one question on the card, and the rule keeps a pull request draft while
that question is open. That holds when the session also left the tree
unclean. Every other end is one where no push will come, so the pull request
goes ready: `flaky`, `fixed` with no new commit, a
rewritten branch or a refused push, no answer that matches the schema, a
clone that could not be brought to the branch, an unreadable log, and a
`work` that throws. A `fixed` on the limit prompt pushes nothing and goes
ready too: the session asked nothing.

### A refused toggle

A draft that `gh` refuses does not stop the session: the attempt comment is
already posted, and the cost is one extra review. A ready that `gh` refuses
after the work is exit 1, its reason naming the pull request after what the
work said, since a draft left by mistake is skipped by CodeRabbit and the
`pr-sweep` alike and would wait unseen.

### After a question

A `blocked` pull request stays draft until someone acts on the answer.
`draft-until-answered` (proposed) makes an open draft on a step's branch an
answer candidate for the board loop, which carries the answer on that branch
and marks the pull request ready with no new question, so it covers the CI
flow's draft as well. Until it lands, the user marks it ready by hand, as for
any question the CI flow's session asks today.

### Not the flaky and scheduled routes

Neither works on the branch: the scheduled route has no pull request, and the
flaky one files a card and changes no file. Neither toggles.

## Risks / Trade-offs

- [The App's installation token is not probed against `gh pr ready` on the
  host.] → Its `pull_requests: write` is the permission GitHub names for the
  draft mutations; a refusal reads as exit 1 naming the pull request on the
  first fix.
- [A session that answers `blocked` without posting its question leaves a
  draft with nothing on the card.] → The same session already leaves the
  card silent today; the draft makes it visible on the pull request.
