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

**Goals:** one command a session runs as follow-up starts — at the
hand-over, or before its own first edit — that leaves the pull request a
draft, whether it was ready or already a draft, and names its head; a rule
every session reads.

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
same way, though the head printed for it is no `--head` `resolve` can use,
since `resolve` reads the branch's own-repository pull requests alone.

### Reuse the reads and the call that exist

`draft` reads `originRepository()` first, as `finish` does, so an `origin`
naming no owner and repository is refused as that rather than as a failed
read, then `readPullRequest(n, repo)`. `readPullRequest` also returns
`draft` and `headRefOid`, the names `Pull` already gives them — the REST
answer carries `draft` and `head.sha` — and `draft` refuses an answer whose
head is not 40 hex digits as an unread one. The undo is `ready(full, n,
"--undo")` from `bun/ci-run-draft.ts`, which spawns `gh pr ready <n> -R
<repo> --undo` and answers only whether it exited 0, so a failure line
names the call that failed and claims no state: a pull request merged
between the read and the undo, and a cloud session's closed GraphQL, fail
the same way. No read-back after the undo: `finish` trusts `ready()`'s exit
status the same way.

### The head on the lines that leave a draft

The full head is the `--head` `work.ts resolve` takes, and the commit the
follow-up builds on, so the dispatcher copies it into the brief from the one
call. It is read before the undo and not again: while the pull request is
ready, the pre-push hook and `finish` refuse every push into it, so only a
push the hooks do not see — one bypassing them, one into a fork, or a cloud
session's, where `.githooks` is off — moves it in that window, and
`resolve` refuses a head that moved anyway.

### Where the rule sits

`core/rules.md` is the only file every session reads, and the start of the
follow-up is when the rule applies, so it gets one Process rule — 19 rules
there, under the ~20 trigger. It covers a session that carries the
follow-up itself — an attended single session, a subagent that picks up a CI
fix — as well as one that hands it over, so the case `git-and-prs.md` covers
today is not dropped. It names the consumer's
`bun node_modules/harness/bun/work.ts` with the harness's `bun bun/work.ts`
in brackets, as `core/feature-workflow.md` names `take`, since a consumer
imports the same file. It sits in the sublist, not in the delegation line of
the preamble, so `delegation`'s requirement is left as it stands.
`core/git-and-prs.md`'s draft rule, which said the agent drafts by hand as
it starts, names the command instead.

## Risks / Trade-offs

- The rule can still be forgotten → the pre-push hook and `finish` keep
  refusing a push into a ready pull request, so a forgotten draft costs a
  window of ready-under-rework, never a push into it.
- A cloud session cannot run it (`gh pr ready` uses GraphQL, which the
  proxy closes) → `draft` exits 1 there, as `resolve` does, the README's
  cloud note says so, and the rule says a failed `draft` is reported and
  does not stop the follow-up.
- `bun bun/work.ts *`'s allow entry now grants a switch to draft that a
  hand-run `gh pr ready --undo` is asked about → the Safety rule naming the
  scripts that carry a granted `gh` write names `draft`, so the grant is
  stated where `finish`'s and `resolve`'s are; merging this proposal is the
  user's approval of it.
- Drafting right after `finish` readied a head can leave CodeRabbit's run on
  that head skipped → that head is the one the follow-up replaces, and
  `finish` asks once for a review of a pushed head CodeRabbit skipped.
