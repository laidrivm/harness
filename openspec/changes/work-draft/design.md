# work-draft — design

## Context

`bun/work.ts` dispatches `take`, `finish`, `status` and `resolve`, reading
each one's options with a strict `parseArgs`, one module per subcommand.
`bun/pull-requests.ts`'s `readPullRequest(n)` reads one pull request of
`origin`'s repository over REST and returns its state and base; `work.ts
status` is its one caller. `bun/ci-run-draft.ts`'s `ready(repo, n, "--undo")`
is the CI flow's `gh pr ready --undo`, killed at `pull-requests.ts`'s limit.
The ready guard lets `gh pr ready --undo` pass and refuses it without
`--undo`.

Follow-up on an open pull request is handed over by the dispatching session —
the laptop's or the VPS's main session — to one fresh worktree subagent per
pull request (`orchestrator/runner/session-rules.md`, rule 3). That session
is the only one that knows the work has started before the subagent does
anything.

## Goals / Non-Goals

**Goals:** one command the dispatching session runs at the hand-over that
leaves the pull request a draft, whether it was ready or already a draft,
and names its head; a rule every session reads at that moment.

**Non-Goals:** an automatic trigger; changing `finish`'s or the pre-push
hook's refusal text; a branch-based form; anything for a cloud session,
where `gh pr` fails.

## Decisions

### A command the dispatcher runs, not a trigger

The points the harness can observe all miss the start. A hook on the Agent
or SendMessage tool sees a brief, not a pull request (the card rules it
out). A commit or push hook fires as the work ends, and the push is already
refused. `take` is a read, and a CI fix or a merge of `main` is handed over
without one. The `/coderabbit` skill is read-only against GitHub by its own
rules, and covers review rounds alone. A command plus a rule at the moment of
hand-over is what reaches every kind of follow-up, on the laptop and the VPS
alike.

### `--pr <n>`, not the branch

The dispatcher's checkout is not on the pull request's branch — the
follow-up runs in a worktree of its own — so `draft` takes the number, as
`gh pr ready <n> --undo` does today. A fork's pull request is drafted the
same way; nothing here pushes into it.

### Reuse the reads and the call that exist

`readPullRequest` also returns `draft` and `head` — the REST answer already
carries `draft` and `head.sha` — and `draft` refuses an answer whose head is
not 40 hex digits as an unread one. The undo is `ready(full, n, "--undo")`
from `bun/ci-run-draft.ts`. No read-back after the undo: `finish` trusts
`ready()`'s exit status the same way.

### The head on every outcome line

The full head is the `--head` `work.ts resolve` takes, and the commit the
subagent's fixes build on, so the dispatcher copies it into the brief from
the one call.

### Where the rule sits

`core/rules.md` is the only file every session reads, and the hand-over is
when the rule applies, so it gets one Process rule — 19 rules there, under
the ~20 trigger. It sits in the sublist, not in the delegation line of the
preamble, so `delegation`'s requirement is left as it stands.
`core/git-and-prs.md`'s draft rule, which said the agent drafts by hand as
it starts, names the command and the dispatcher instead.

## Risks / Trade-offs

- The rule can still be forgotten → the pre-push hook and `finish` keep
  refusing a push into a ready pull request, so a forgotten draft costs a
  window of ready-under-rework, never a push into it.
- A cloud session cannot run it (`gh pr ready` uses GraphQL, which the
  proxy closes) → `draft` exits 1 there with `gh`'s failure, as `resolve`
  does, and the README's cloud note says so.
