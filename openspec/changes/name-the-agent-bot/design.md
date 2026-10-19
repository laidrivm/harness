# name-the-agent-bot — design

## Context

See proposal.md, *Why*. Three things already in the tree shape the edits.

- `github-app-identity` (design.md, *Identity before the sessions, token
  after*) has the runner read the App's slug from `GET /app` and the bot's id
  from `GET /users/<slug>[bot]`. It sets the sessions' author and committer
  to `<slug>[bot]` and `<id>+<slug>[bot]@users.noreply.github.com`, and mints
  the token only after the session ends. That change's step 2, which holds
  the App's code, is not yet applied.
- `core/git-and-prs.md`'s bullet *Send, reply, comment or review under the
  user's name only through a call the user approved at its prompt* is the
  rule to extend. The tracked `deny` entries and `bun/command-guard-gh.ts`
  enforce its `gh` half.
- The deleted `ship` skill read: "Cap the loop at **three** round trips. If
  CodeRabbit still has findings on the fourth push, stop and report —
  repeated churn on the same PR is a signal to talk, not to keep pushing."
  It listed "round-trip cap hit" among its `BLOCKED` causes
  (`git show 4215039^:core/skills/ship/SKILL.md`). `remove-ship`'s Non-goals
  sent the cap to this card.

The user's decisions on the card, fixed here and not reopened:

1. (2026-10-18) A Major or Critical dismissal made without the user is only a
   question on the card, never a comment from the bot in the pull request.
2. (2026-10-18) The three-round cap from `ship` moves to this card.
3. The `/coderabbit` line about being started by the `Review completed`
   status waits for the orchestrator's next slice.

## Goals / Non-Goals

**Goals:** both bullets say what the proposal says, and a test reads them
back.

**Non-Goals:** the proposal's.

## Decisions

### D1. The doc names the App and its login, not its id or email

The bullet names `laidrivm-harness-agent` and `laidrivm-harness-agent[bot]`.
A reader matches that login against a commit, a pull request or a comment.
The numeric id and the noreply address are not in the bullet. Both are
public, but the runner already reads them from GitHub. The repo's
public-tree check also asks for account identifiers to be flagged, and a
second copy of a value that the runner reads is a copy that can drift.

The other option was to give all four facts, so a reader can recognise an
author line by its email. It was rejected because the login already sits
inside that email.

### D2. The name lives in prose only, and a test keeps it there

The runner reads the slug from `GET /app`, so a renamed App goes on working
in code. Only the bullet goes stale, and only the bullet has to be edited.
`bun/review-docs.test.ts` reads the slug out of the bullet, from the
backticked `…[bot]` login. It then fails if any tracked file under `bun/`
holds that slug. The test never spells the name itself, so it needs no
exemption for its own file.

The alternative was a constant in `bun/` that both the doc test and the
runner import. That would hard-code what `github-app-identity` chose to ask
GitHub for.

### D3. The cap lives in `review-toolkit.md`, not in the `coderabbit` skill

The skill's step 5 says "The project overrides this": a run follows the
repo's own review policy over the skill's defaults. The `/coderabbit` bullet
in `review-toolkit.md` is that policy for this harness and its consumers.
`ship` held the cap because `ship` was the loop. Without `ship`, each
`/coderabbit` run is one round, and the policy over rounds belongs where the
policy over fixes already is.

Adding a step to the skill was the other option. Rejected: the skill also
serves projects with other policies, and the card asked for the cap in the
review docs.

### D4. A round is a reviewed commit, counted from the pull request

Under the orchestrator each `/coderabbit` run is a fresh session, so the
count cannot come from memory. The run counts the distinct `commit_id`s of
CodeRabbit's reviews on the pull request (a login starting with
`coderabbitai`, never the App's `laidrivm-harness-agent[bot]`, which this
change names too). Its step 1 already reads that list.
`ship` counted pushes. A push the bot reviewed is a reviewed commit, and a
clean review leaves no review object, so it ends the loop and is never
counted.

Commits the user pushed count as well, because the bot reviewed them and
each one is churn on the pull request.

The alternative was to count the branch's fix commits. Rejected: a fix
commit carries no mark that tells it apart from the user's own.

### D5. At the cap the run applies nothing, and the gate reads `BLOCKED`

`ship`'s wording was "stop and report — repeated churn on the same PR is a
signal to talk". So at the cap the run verifies and lists the findings, and
applies none of them. The gate line reads `BLOCKED`, not `OPEN`:
`review-toolkit.md` allows `OPEN` only for a proposed Major dismissal and for
a head commit the bot has not reviewed yet. `ship` itself filed the cap
under `BLOCKED`.

- **Attended:** the run reports each finding left (its severity, file, line,
  and what it says) and stops. Whether to fix, dismiss or merge is the
  user's call.
- **Unattended:** class `card`. The run hands the findings on as one question
  on the card and posts nothing in the pull request (decision 1). The
  question waits as `task-board` sets out, including when the card already
  holds an open question.

The other unattended class is `agent`: list the findings in the pull
request's body. Rejected, for two reasons. The pull request is already open,
so its body has already been written, and under the board loop no step
rewrites it: the runner writes the body once, when it opens the pull
request. And churn past the cap is a signal to talk, so it needs an answer
from the user, which only a question on the card waits for.

## Risks / Trade-offs

- [The App is renamed and the bullet still names the old login] → the
  runner keeps working, since it asks `GET /app`. A reader then matches a
  stale login. The rename is a user act, and the bullet is the one tracked
  place to edit.
- [A session never reads `review-toolkit.md` before running `/coderabbit`]
  → the skill's step 5 sends it to the project's review policy. The rulebook
  indexes the doc, and that index is how every other override of the skill
  reaches a run.
- [CodeRabbit posts one review that covers several pushes] → those pushes
  count as one round. The cap then bites later, never earlier.
- [A clean review leaves no review object] → see D4. The separate card on
  treating `Review completed` as a review covers how such a run ends.
