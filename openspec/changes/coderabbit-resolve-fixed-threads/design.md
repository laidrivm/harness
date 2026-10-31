# coderabbit-resolve-fixed-threads — design

## Context

See `proposal.md` for why. What shapes the approach:

- The command guard lets `gh api graphql` through only as an inline
  `query` with no `mutation` token in it (`agent-permissions`, *GitHub write
  commands are denied*), and the permission classifier has already refused a
  raw `resolveReviewThread` call from a session. A guard reads the command a
  session hands the shell, never what a process it allowed spawns.
- `bun bun/work.ts` is a strict dispatcher, one module per subcommand, and
  `Bash(bun bun/work.ts *)` is in the tracked allow list; `finish` already
  pushes and calls `gh pr ready` from inside the process.
  `bun/pull-requests.ts` reads `origin`'s owner and name and the branch's pull
  requests.
- Read live on 31.10: #355's head `afccbcd` has no `CodeRabbit` commit status
  and one `CodeRabbit` check run, `completed`/`success`, whose summary's first
  line is `Result: Success - Review completed`. The read
  `gh api "repos/OWNER/REPO/commits/<head sha>/check-runs?check_name=CodeRabbit"
  --jq '.check_runs[] | [.status, .conclusion, (.output.summary // "" |
  split("\n")[0])]'` printed `["completed","success","Result: Success -
  Review completed"]`, and `bun/command-guard.ts` exits 0 on it.
- Read live on 31.10: #347's inline findings open
  `**<picture>…major-16.svg…</picture> Major** · **Stability & Availability**
  · **Quick win**` — severity, category, effort, in that order.

## The user's decisions

On the card's question comment (29.10), answered in chat on 31.10:

1. **а** — a subcommand, `bun bun/work.ts resolve --pr N --comment <id>…`.
   The process calls the `resolveReviewThread` mutation itself, as `finish`
   pushes, under whatever identity `gh` holds. It resolves only unresolved
   threads a `coderabbitai` login opened, on the pull request of the current
   branch, and skips resolved ones. `@coderabbitai resolve` and `approve` stay
   forbidden. The command guard is not changed.
2. **а** — resolve once the fix is on the pull request: the `coderabbit` skill
   names the ids of the findings it fixed, the session pushes with `finish`,
   then calls `resolve`.
3. **б** — one change and one pull request with the card *Make the coderabbit
   skill read the head's status before the reviews*
   (40539875c31b8168a338eb254c353d08), which the user discarded into this one.

Standing from the card:

4. OpenSpec, not a fix: the skill's contract ("Never post … no resolves"),
   `core/git-and-prs.md` and `work.ts`'s behaviour change.
5. The command resolves only threads of the current branch's pull request
   that `coderabbitai` opened, skips a resolved one, and checks nothing else.
6. The `coderabbit` skill is not vendored (`skills-lock.json`); it is edited
   here.
7. Assumption: the App, with `pull_requests: write`, can call
   `resolveReviewThread`. Not checked live; stage 2.5's probe, step 7, checks
   it.
8. Assumption: resolving the last thread brings the approval by itself — on
   #347 it came after the hand resolves, with no push. Checked in the same
   probe.

## Decisions

### `resolve` places every id before it changes anything

It reads the branch (`git symbolic-ref`), `origin`'s repository and the
branch's pull requests through `bun/pull-requests.ts`, and refuses unless
`--pr` is the open one. It then reads every review thread with one paginated
query — the skill's fourth call plus each thread's `id` and its first
comment's `author.login`, `comments(first:1)` — and places each id as the
first comment of one thread. Any id it cannot place, or that opens a thread
whose author does not start with `coderabbitai` (GraphQL spells the bot
`coderabbitai`, REST `coderabbitai[bot]`), refuses the whole call before the
first mutation. Then it resolves the unresolved ones in the order given and
stops at the first failure.

- Alternative: resolve what it can and report the rest. Rejected: an id that
  does not place is a wrong hand-off from the skill, and half the call done
  hides that.
- Alternative: roll back on a failed mutation. Rejected: there is nothing to
  undo — a resolved thread of a fixed finding is the intended end state, and
  a rerun skips it.
- No check that the local `HEAD` is the pull request's head: decision 5 sets
  the checks, and the order (decision 2) is the skill's and the session's.

Output, one line per id and the last saying the outcome:
`resolve: <id> resolved`, `resolve: <id> already resolved, skipped`,
`resolve: <id> failed — <gh's message>`, and `resolve: refused — <why>`.
Exit 0 when every named thread ends resolved, 1 on a refusal or a failure, 2
on the usage. The gate ledger records nothing: `resolve` is no gate.

### The skill names the ids; it resolves nothing itself

A run that applied fixes prints, right above its gate line, the one command
`bun bun/work.ts resolve --pr <n> --comment <id> …`, listing each inline
comment whose every finding it fixed. A comment that also carries a skipped
or rejected finding is left out — its thread is the user's. A finding from a
review body has no thread and is never named. The *Never post to the PR* rule
stays, rewording "no resolves" to point at the command.

- Alternative: the skill resolves after the push itself. Rejected by
  decision 2: the skill runs before the push, and a thread resolved over a
  head without the fix lets the bot approve it.

### Step 1 reads the head's state before the reviews, and the check run too

Order: `headRefOid`, then the head's `CodeRabbit` check run and its commit
status, then the reviews, then the other calls. A review the bot posts
before its status or check run is then always in the read that follows them.
The status is kept beside the check run: it is how the bot reported until
27.10, and a draft's `Review skipped: draft pull request` is read there. The
check run counts only as `completed`/`success` with that exact first summary
line; anything else is no review.

The skill reads the check run with its own `gh api` call. The sibling change
`finish-review-arrives` adds a `bun/` reader of the same check run for
`finish`; a second reader in `bun/` is not written here, and the skill does
not call that one, since prose runs `gh` and the reader is a module.

### Severity is a word read, not a pattern matched

Step 2 says: read the severity word of each finding — after its icon, as in
`**<picture>…</picture> Major**`, or in its category line, as in `_🟠 Major_`
— these are examples, not a pattern, as `session-wrapup` already words it.
The order of category and severity on the line is not relied on.

### The Safety rule names `resolve` — the user's to approve

`core/rules.md`'s last Safety rule ends: "`bun bun/work.ts finish` is the one
script the allow list grants a push, a pull request and a ready." Proposed:

> `bun bun/work.ts finish` is the one script the allow list grants a push, a
> pull request and a ready, and `bun bun/work.ts resolve` the one it grants a
> review thread's resolve.

The edit is applied in the apply step only after the user approves it on
the card; until then the rule stands as it is, which is true while `resolve`
does not exist.

## Risks / Trade-offs

- [The thread is resolved as the user on the laptop] → it writes no text,
  only the thread's state, and decision 1 settles it; under the board loop
  the App's token does it, which decision 7 leaves to the probe.
- [The bot changes the check run's summary wording again] → the head reads as
  unreviewed and the run ends `OPEN`, the safe side; the next live failure
  names it, as #319 did.
- [A commit heads two pull requests and its check run belongs to the other]
  → the head is counted as reviewed by the other's run. Accepted: a shared
  head is rare, the reviews are still read per pull request, and
  `session-wrapup`'s `/pull/<n>` check is not copied into the skill.
- [`resolve` is run before `finish` pushed] → the bot may approve a head
  without the fix. The command cannot see whether the fix is pushed
  (decision 5); the skill names the command for after the push, and
  `local-review-loop` holds the order.
