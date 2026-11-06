# work-draft

## Why

A ready pull request under rework invites a merge of the head the rework is
replacing. On 2026-11-05 the user saw #426 still ready while an agent was
fixing its CodeRabbit round 1 and asked why it was not a draft. No harness
code drafts a pull request when follow-up on it starts: `bun bun/work.ts
finish` refuses to push into a ready one and readies it after the push, the
pre-push hook refuses the same push, and `bun/ci-run-draft.ts` drafts only
for the CI flow. Between the hand-over and the push the pull request stays
ready unless the dispatching session remembers `gh pr ready <n> --undo`. The
laptop session holds that as a memory rule since 2026-11-05 and ran it about
20 times on 2026-11-06; the VPS session has no such memory, and
`core/git-and-prs.md` states it only on demand, as a hand step of the agent.

## What Changes

- New subcommand `bun bun/work.ts draft --pr <n>`: reads pull request `<n>`
  of `origin`'s repository, marks it draft when it is open and ready, says
  so when it is already a draft, and refuses a merged or closed one or a read
  that fails. Both lines that leave it a draft name the pull request's head
  commit in full, the `--head` that `work.ts resolve` takes and a brief can
  carry.
- `core/rules.md` gains one Process rule, read by every session: before
  follow-up on an open pull request starts — a review round, a CI fix, a
  merge of `main`, handed to a subagent or carried by the session itself —
  run `work.ts draft --pr <n>`.
- `core/git-and-prs.md`'s draft rule names `work.ts draft --pr <n>` in place
  of the agent's hand-run `gh pr ready <n> --undo`, which still passes the
  ready guard.
- `README.md` gets a row for `draft` beside `take`, `resolve`, `finish` and
  `status`, and its *Cloud sessions* note names `draft` beside `resolve` as
  failing there, since `gh pr ready` goes through GraphQL.

Out of scope: an automatic trigger. A hook on the Agent or SendMessage tool
cannot tell which pull request a brief is about (the card rules it out), and
a commit or push hook fires when the work ends, not when it starts — the push
is already refused. `finish`'s and the pre-push hook's refusals keep naming
`gh pr ready <n> --undo`, which still works.

## Capabilities

### New Capabilities

- `work-draft`: the command a session runs when follow-up on an open pull
  request starts, marking it draft until `finish` readies it again.

### Modified Capabilities

None. `work-finish`'s *Opening and the ready switch are finish's own* lets
`gh pr ready --undo` pass, and `draft` runs that call through `gh` as the
CI flow does.

## Impact

- New: `bun/work-draft.ts`, `bun/work-draft.test.ts`.
- Changed: `bun/work.ts` (dispatch, `USAGE`, header comment),
  `bun/pull-requests.ts` (`readPullRequest` also returns `draft` and
  `headRefOid`, `Pull`'s names for them), `core/rules.md`, `core/git-and-prs.md`, `README.md`.
- No new dependency, permission or hook: `.claude/settings.json` already
  allows `bun bun/work.ts *`, and a consumer's `README` step 5 already allows
  `bun node_modules/harness/bun/work.ts *`.
- The laptop session's memory rule *Draft while fixing* becomes this
  command; retiring the memory is the user's.
- Closest existing artefact: `bun/ci-run-draft.ts`'s `draftWhile`, which
  drafts for the CI flow; `draft` reuses its `ready()` call.
