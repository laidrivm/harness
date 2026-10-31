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
- Read live on 31.10: #355's head `afccbcd` has no `CodeRabbit` commit status.
  The read `gh api
  "repos/OWNER/REPO/commits/<head sha>/check-runs?check_name=CodeRabbit&filter=all&per_page=100"
  --paginate --jq '.check_runs[] | select(.app.slug == "coderabbitai") |
  [.status, .conclusion, .output.title]'` printed
  `["completed","success","Finished"]` and
  `["completed","skipped","Review skipped"]`, and `bun/command-guard.ts`
  exits 0 on it.
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

On the card's second question (31.10), answered there at 19:24:

9. **а** — the Safety rule's wording below, *The Safety rule names
   `resolve`*, is adopted as proposed.

## Decisions

### `resolve` places every id before it changes anything

It reads the branch (`git symbolic-ref`), `origin`'s repository and the
branch's pull requests through `bun/pull-requests.ts`, and refuses unless
`--pr` is one of the branch's open ones — a branch open into two bases has
two. It then reads every review thread with one query, `gh api graphql
--paginate --slurp` (gh 2.97 here; without `--slurp` each page prints as its
own JSON object and one `JSON.parse` fails past 100 threads) — the skill's
fourth call plus each thread's `id` and its first comment's `author.login`,
`comments(first:1)` — and places each id as the first comment of one thread.
Any id it cannot place, or that opens a thread whose author login is not
exactly `coderabbitai`, refuses the whole call before the first mutation. A
prefix test would pass `coderabbitai-x`, a login anyone can register
(`core/rules.md`, *A guard against malformed input must cover the whole
value*). GraphQL spells the bot `coderabbitai` (read on #347, 31.10), and a
deleted author reads `null`, which is not the bot. Then it resolves the
unresolved ones in the order given and stops at the first failure.

Every `gh` call, the reads and the mutations, runs under `gh`'s own
identity. `readPullRequests()` uses a minted read token when
`HARNESS_GITHUB_APP_MINT` is set; `resolve` is not run where it is (see the
board loop below). A cloud session's proxy refuses GraphQL, so there the
thread read fails and `resolve` exits 1 having changed nothing — the safe
side, and the README's *Cloud sessions* names it.

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

A run prints, right above its gate line, the one command `bun bun/work.ts
resolve --pr <n> --comment <id> …`. The unit is the thread, since a resolve
closes the whole thread: it names the first comment's id of each unresolved
thread of the bot's whose every finding — the first comment's and each
reply's with a severity line of its own — it fixed or verified as already
fixed. A thread that also carries a skipped or rejected finding is left out
— it is the user's. A reply's id is never named, since `resolve` places only
first comments. A finding from a review body has no thread and is never
named. The skill keeps a comment only when its `user.login` is exactly
`coderabbitai[bot]`, the REST spelling of the login `resolve` checks, so no
id it names is refused for its author. The session runs the command once
every fix is on the head: after its own `finish` pushed, or at once when the
run applied none. The *Never post to the PR* rule stays, rewording "no
resolves" to point at the command.

Step 1 today drops a thread that is resolved *or outdated*, listing it as
`already resolved`. An outdated thread that is not resolved still holds the
approval back, so it is verified like any finding instead: already fixed on
the head, its id is named; otherwise it is dispositioned as usual.

- Alternative: the skill resolves after the push itself. Rejected by
  decision 2: the skill runs before the push, and a thread resolved over a
  head without the fix lets the bot approve it.

### The board loop is out of scope

A session whose launcher pushes runs no `finish` and holds no App token
(`bun/github-app.ts`), so it runs no `resolve` and names the command in its
final message, as it names the pull request's title and body. Resolving
after the runner's push — under the App's token, decision 7 — is the runner's
and is left to stage 2.5's probe, step 7, which checks that token can.

### Step 1 reads the head's state before the reviews, and the check run too

Order: `headRefOid`, then the head's `CodeRabbit` check run and its commit
status, then the reviews, then the other calls. A review the bot posts
before its status or check run is then always in the read that follows them.
That it does post first is read, not assumed: on #347's three reviewed heads
and #353's one (31.10), each review's `submitted_at` comes 2–8 seconds before
the check run's `completed_at` (`01:14:16`/`01:14:23`, `09:11:37`/`09:11:43`,
`10:13:40`/`10:13:48`, `23:03:29`/`23:03:31`). Four samples are no contract;
the single re-fetch before the gate line covers a review that lands later.
The status is kept beside the check run: it is how the bot reported until
27.10, and a draft's `Review skipped: draft pull request` is read there.

The check runs count by one rule for "reviewed", `finish-review-arrives`'s
(*CodeRabbit's state of a commit is read from its check runs*, main
session's decision, 31.10): over every run named `CodeRabbit` that
CodeRabbit's app posted (`filter=all`, `app.slug` `coderabbitai`), none
still in progress and one with the conclusion `success` and a title not
opening `Review skipped`. Conclusion and title, never the summary's text,
which already moved once. A head whose runs read anything else — skipped,
rate limited, in progress, none — is no review.

The skill reads the runs with its own `gh api` call; `bun/coderabbit-run.ts`,
the module `finish-review-arrives` adds, is a module with no command line,
and no second reader is written in `bun/`. Two statements of one rule drift
silently, so a test holds them together (`core/rules.md`, *Pin a name one
system looks up in another with a test*). While the module is not on
`main`, it holds the skill's step 1, which names the `success` conclusion
and the `Review skipped` title prefix, against the requirement's own words,
"succeeded with a title not opening `Review skipped`", read from that
change's delta or, once archived, `openspec/specs/work-finish/spec.md`; the
delta names no slug, so the app's slug is pinned only later. Once the module
lands, the test reads its constants — conclusion, title prefix and slug —
instead, and whichever of the two changes applies second makes that switch. The cited requirement
sits in that change's delta until it archives, so this change archives
after it (tasks.md, group 3) — no `after:` edge, which would hold the apply
too, not only the archive.

Not done here, though `finish-review-arrives`' design expected this card to
do it: a command line for `bun/coderabbit-run.ts` that both skills call.
The main session settled the skill's own read on 31.10; `session-wrapup`'s
check-run read stays a third, unpinned statement of the rule, left to a card.

### Severity is a word read, not a pattern matched

Step 2 says: read the severity word of each finding — after its icon, as in
`**<picture>…</picture> Major**`, or in its category line, as in `_🟠 Major_`
— these are examples, not a pattern, as `session-wrapup` already words it.
The order of category and severity on the line is not relied on.

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
  → the head is counted as reviewed by the other's run. Accepted: a shared
  head is rare, the reviews are still read per pull request, and
  `session-wrapup`'s `/pull/<n>` check is not copied into the skill.
- [`resolve` is run before `finish` pushed] → the bot may approve a head
  without the fix. The command cannot see whether the fix is pushed
  (decision 5); the skill names the command for after the push, and
  `local-review-loop` holds the order.
