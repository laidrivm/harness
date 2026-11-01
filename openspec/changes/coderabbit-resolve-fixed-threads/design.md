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
- Read live on 31.10: #355's head `afccbcd` has no `CodeRabbit` status; its
  `check-runs?check_name=CodeRabbit&filter=all` read, which the command guard
  passes, gives `success`/`Finished` and `skipped`/`Review skipped`. #347's
  findings open `**<picture>…</picture> Major** · **<category>** · **<effort>**`.

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
   that `coderabbitai` opened, skips a resolved one, and checks nothing else
   — widened by decision 10 to one check more.
6. The `coderabbit` skill is not vendored (`skills-lock.json`); it is edited
   here.
7. Assumption: the App, with `pull_requests: write`, can call
   `resolveReviewThread`. Not checked live; stage 2.5's probe, step 7, checks
   it.
8. Assumption: resolving the last thread brings the approval by itself — on
   #347 it came after the hand resolves, with no push. Checked in the same
   probe.

On the card's second question (31.10), answered there at 19:24:

9. **а** — the Safety rule's wording below, *The Safety rule names
   `resolve`*, is adopted as proposed.

On the card's third question (CodeRabbit's Major on #358, thread
4433212228), answered there on 1.11 at 10:42:

10. **а**, with the user's addition — `resolve --head <sha>` refuses before
    the first mutation when the pull request's head differs, but «при
    несовпадении resolve один раз перечитывает голову через пару секунд и
    только потом отказывает»: on a mismatch it reads the head once more a
    couple of seconds later, since GitHub's API can lag a push, and only
    then refuses. Decision 5 widens by this one check.

## Decisions

### `resolve` places every id before it changes anything

It reads the branch (`git symbolic-ref`), `origin`'s repository and the
branch's pull requests through `bun/pull-requests.ts`, and refuses unless
`--pr` is one of the branch's open ones — a branch open into two bases has
two. It then reads every review thread with one query, `gh api graphql
--paginate --slurp` (gh 2.97 here; without `--slurp` each page prints as its
own JSON object and one `JSON.parse` fails past 100 threads) — the skill's
fourth call plus each thread's `id` and its first comment's `author.login`
and `fullDatabaseId`, `comments(first:1)` — and places each id as the first
comment of one thread, comparing the id as the decimal string
`fullDatabaseId` carries. `databaseId` is GraphQL's 32-bit `Int`, which
GitHub documents as not holding 64-bit ids; #358's comment ids already pass
2³¹ (`4433138725`, read through both fields on 31.10). The skill's own
fourth call moves to `fullDatabaseId` too (tasks.md 2.2).
Any id it cannot place, or that opens a thread whose author login is not
exactly `coderabbitai`, refuses the whole call before the first mutation. A
prefix test would pass `coderabbitai-x`, a login anyone can register
(`core/rules.md`, *A guard against malformed input must cover the whole
value*). GraphQL spells the bot `coderabbitai` (read on #347, 31.10), and a
deleted author reads `null`, which is not the bot. Then it resolves the
unresolved ones in the order given and stops at the first failure.

Every `gh` call runs under `gh`'s own identity; `resolve` is not run where
`HARNESS_GITHUB_APP_MINT` is set (the board loop, below). A cloud session's
proxy refuses GraphQL, so there `resolve` exits 1 having changed nothing.

- Rejected: resolving what places and reporting the rest — an unplaced id is
  a wrong hand-off; and a rollback on a failed mutation — a rerun skips what
  is resolved.
- The head check is `--head` against the `headRefOid` the pull-request read
  already returns (`readPullRequests()`), so the match costs no extra call;
  a mismatch costs one more read after a 2-second wait (decision 10). The
  local `HEAD` is not compared: the session names the commit, the pushed one
  or the one the run verified. The check narrows the window to the thread
  read and the mutations, it does not close it — an atomic check-and-resolve
  GitHub does not offer.

Output, one line per id and the last saying the outcome:
`resolve: <id> resolved`, `resolve: <id> already resolved, skipped`,
`resolve: <id> failed — <gh's message>`, and `resolve: refused — <why>`.
Exit 0 when every named thread ends resolved, 1 on a refusal or a failure, 2
on the usage. The gate ledger records nothing: `resolve` is no gate.

### The skill names the ids; it resolves nothing itself

A run prints, right above its gate line, the one command `bun bun/work.ts
resolve --pr <n> --head <sha> --comment <id> …`. `--head` names the commit
the run verified against when it applied no fix; when it applied one, it is
the literal `<pushed sha>`, which the session fills in after `finish` and
which `resolve` refuses as malformed if run unfilled. The unit is the
thread, since a resolve
closes the whole thread: it names the first comment's id of each unresolved
thread of the bot's whose every finding — the first comment's and each
reply's with a severity line of its own — it fixed or verified as already
fixed. A thread that also carries a skipped or rejected finding is left out
— it is the user's. A reply's id is never named, since `resolve` places only
first comments. A finding from a review body has no thread and is never
named. The skill keeps a comment only when its `user.login` is exactly
`coderabbitai[bot]`, the REST spelling of the login `resolve` checks, so no
id it names is refused for its author. The session runs the command once
every fix is on the head: after its own `finish` pushed, `<pushed sha>`
filled in, or at once when the run applied none. When
`resolve` refuses over another head, the session runs `/coderabbit` again.
The *Never post to the PR* rule stays, rewording "no
resolves" to point at the command.

Step 1 today drops a thread that is resolved *or outdated*, listing it as
`already resolved`. An outdated thread that is not resolved still holds the
approval back, so it is verified like any finding instead: already fixed on
the head, its id is named; otherwise it is dispositioned as usual.

- Alternative: the skill resolves after the push itself. Rejected by
  decision 2: the skill runs before the push, and a thread resolved over a
  head without the fix lets the bot approve it.

### The board loop is out of scope

A session whose launcher pushes runs no `finish` and holds no App token, so
it only names the command in its final message. Resolving after the runner's
push, under the App's token (decision 7), is left to stage 2.5's probe.

### Step 1 reads the head's state before the reviews, and the check run too

Order: `headRefOid`, then the head's `CodeRabbit` check run and its commit
status, then the reviews, then the other calls. A review the bot posts
before its status or check run is then always in the read that follows them.
On #347's three heads and #353's one (31.10) each review's `submitted_at`
came 2–8 seconds before the check run's `completed_at`. Four samples are no
contract, so a head with no review object reaches `PASS` only while the
bot's walkthrough reads «No actionable comments were generated» naming the
head as its `Commit` — the signal `session-wrapup` reads, seen on #355 —
and otherwise ends on the no-review `OPEN` line. The status is kept: it is
how the bot reported until 27.10.

The check runs count by one rule for "reviewed", `finish-review-arrives`'s
(*CodeRabbit's state of a commit is read from its check runs*, main
session's decision, 31.10): over every run named `CodeRabbit` that
CodeRabbit's app posted (`filter=all`, `app.slug` `coderabbitai`), none
still in progress and one with the conclusion `success` and a title not
opening `Review skipped`. Conclusion and title, never the summary's text,
which already moved once. A head whose runs read anything else — skipped,
rate limited, in progress, none — is no review.

The skill reads the runs with its own `gh api` call; `bun/coderabbit-run.ts`
has no command line, and no second reader is written in `bun/`. A test holds
the two statements of the rule together (`core/rules.md`, *Pin a name one
system looks up in another with a test*): the skill's `success` and `Review
skipped` against the requirement's words "succeeded with a title not opening
`Review skipped`" while the module is not on `main`, then against its
`REVIEWED.conclusion` and `REVIEWED.skippedTitle` (#361); the app's slug, a
literal in its `own()`, stays unpinned. Whichever change applies second
makes the switch. The cited requirement sits in that change's delta until it
archives, so this change archives after it (tasks.md, group 3) — no `after:`
edge, which would hold the apply as well.

Not done here, though `finish-review-arrives`' design expected this card to
do it: a command line for `bun/coderabbit-run.ts` that both skills call.
The main session settled the skill's own read on 31.10; `session-wrapup`'s
check-run read stays a third, unpinned statement of the rule, left to a card.

### Severity is a word read, not a pattern matched

Step 2 reads each finding's severity word, both markups given as examples,
not a pattern, as `session-wrapup` words it; the order on the line is not
relied on.

### The Safety rule names `resolve` (user's decision 9)

`core/rules.md`'s last Safety rule ends: "`bun bun/work.ts finish` is the one
script the allow list grants a push, a pull request and a ready." It becomes:

> `bun bun/work.ts finish` is the one script the allow list grants a push, a
> pull request and a ready, and `bun bun/work.ts resolve` the one it grants a
> review thread's resolve.

The rule also forbids running an act the guard refuses through a committed
script, and the mutation is such an act, so the edit lands in the commit
that adds the subcommand: before it the rule would forbid `resolve`, after
it a `resolve` without the edit would make the rule false.

## Risks / Trade-offs

- [The thread is resolved as the user on the laptop] → it writes no text,
  only the thread's state, and decision 1 settles it.
- [The bot renames a run's title or conclusion] → the head reads as
  unreviewed and the run ends `OPEN`, the safe side, in the skill and in
  `finish` alike, since both read one rule; the next live failure names it,
  as #319 did.
- [A commit heads two pull requests and its check run belongs to the other]
  → counted as reviewed by the other's run. Accepted: rare, and the reviews
  are still read per pull request.
- [`resolve` is run before `finish` pushed] → unfilled, `<pushed sha>` is no
  40-hex id and `resolve` prints the usage; filled with a commit not yet
  pushed, it is not the pull request's head, and `resolve` refuses after its
  re-read (decision 10).
