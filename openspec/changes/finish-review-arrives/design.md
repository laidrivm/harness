# finish-review-arrives — design

## Context

See proposal.md, *Why*. `finish()` in `bun/work-finish.ts` runs the
refusals, the push or its skip, the draft's opening, the card's question
read and `ready()` from `bun/ci-run-draft.ts`, in that order, and ends on
`finish: ready #N`. Nothing reads its output but the agent: no file under
`bun/`, `core/`, `orchestrator/` or `openspec/specs/` matches
`finish: ready` or `finish: draft` outside `work-finish` itself.

What CodeRabbit leaves on a commit, read on 2026-10-31 through
`commits/<sha>/check-runs?filter=all`, every run named `CodeRabbit` with
`app.slug` `coderabbitai`:

- #355's head `afccbcd`: `skipped`, title `Review skipped`, 09:55:22; then
  `success`, title `Finished`, 09:55:40.
- #344's `22f6f99`: `skipped` `Review skipped` 22:52:47, then `neutral`
  `Review rate limited` 22:53:08, summary `Result: Rate limited - Review
  rate limited`, which names no window.
- #344's `b5a5943`, reviewed after the user's `@coderabbitai review`:
  `success` `Finished`, summary `Result: Success - Review completed`.

The skip's title does not say why it skipped; a draft and any other skip
read alike, which is why the state below is `skipped` and never `draft`.

## Goals / Non-Goals

**Goals:** the ready switch comes after CodeRabbit has seen the push; the
agent learns from `finish`'s last line whether the review is coming; a
skipped head gets one `@coderabbitai review` from code, not from the agent.

**Non-Goals:** the proposal's list, and retrying a rate limit on the laptop
(answer 3 a: the retry costs the same limit, and the window runs 40 min and
more).

## Decisions

### One module reads the check runs

`bun/coderabbit-run.ts` holds a pure `state(runs)` over the check-run list
and `read(repo, sha)`, which runs `gh api
repos/<repo>/commits/<sha>/check-runs?filter=all&per_page=100` killed at
`limit()` from `bun/pull-requests.ts`, as every `gh` read there is.
`filter=all`, because the default `latest` keeps one run per name, and which
of a skip and a review counts as latest depends on an order CodeRabbit does
not promise. The states and their precedence are the spec's (*CodeRabbit's
state of a commit is read from its check runs*); precedence over all runs
rather than the newest one makes the answer independent of that order too.
Only `app.slug === "coderabbitai"` counts, so another app's run named
`CodeRabbit` cannot stand in for a review.

`rate limited` is read from the title alone, the one field that tells it from
another neutral run; the summary's wording is left alone, since CodeRabbit's
format already moved once (status to check run, 2026-10-27).

The `coderabbit` skill reads the commit status today (card
`40539875c31b8168a338eb254c353d08`). That card gives the module a command
line and points the skill's step 1 at it; this change adds no entry point no
shipped path calls. Alternative rejected: a command line now, which nothing
would run until that card lands.

### The wait before the ready switch (answer 1 a)

After the push or its skip and the draft's opening, `finish` reads `HEAD`'s
state every poll interval until it is other than no run, at most 12 polls —
60 s at the default 5 s. It runs before the card's question read, which stays
last before `ready()` so that it sees a question posted meanwhile, as the
archived `work-finish` design set; a question that then waits has cost up to
60 s, the price of keeping that order. A wait that ends with no run prints
`finish: no CodeRabbit run on <short> after 60 s` and goes on: the wait
narrows a race, it gates nothing.

No push in this call does not skip the wait: the run from an earlier push is
already there, so the first read returns.

### The reads after it (answer 1 a, option B of the explore)

After `ready()`, `finish` reads `HEAD`'s state every poll interval until it
is neither `skipped` nor no run, at most 18 polls — 90 s at the default. The
review starts 25–35 s after the switch when it comes (#338, #342). The last
line is the outcome, joined to the ready one so the last line stays the one
the agent reads:

- `finish: ready #7 — CodeRabbit reviewing 1a2b3c4`
- `finish: ready #7 — CodeRabbit reviewed 1a2b3c4`
- `finish: ready #7 — CodeRabbit rate limited on 1a2b3c4; no review asked for`
- `finish: ready #7 — CodeRabbit <conclusion> "<title>" on 1a2b3c4`
- `finish: ready #7 — no CodeRabbit run on 1a2b3c4 after 90 s`
- `finish: ready #7 — CodeRabbit's runs on 1a2b3c4 unread: <why>`
- for a skip, one of the request's four endings below

Every one exits 0: the ready switch went through, and an exit of 1 means the
pull request is still a draft everywhere else in `finish`.

### The poll interval is one knob

`HARNESS_CODERABBIT_POLL_MS`, a positive whole number of milliseconds, read
as `limit()` reads `HARNESS_GH_TIMEOUT_MS`; 5000 otherwise. The two waits are
counts of polls, so the tests run the whole sequence in milliseconds and no
second knob is needed. Alternative rejected: separate deadlines in seconds,
three knobs for one test need.

### Only where CodeRabbit is configured

`finish` reads no check run unless `git ls-files --error-unmatch
.coderabbit.yaml` succeeds at the checkout's top. A consumer without
CodeRabbit would otherwise pay 60 s and 90 s on every `finish` for runs that
never come. A repository running CodeRabbit with no config file keeps
today's behaviour, which is no regression. Tracked rather than present: a
gitignored copy is in the author's checkout and absent in a clone.

### The request is code's, once per head (answer 2, answer 4 b)

On a `skipped` state when the reads end, `finish` reads the pull request's
comments (`gh api repos/<repo>/issues/<n>/comments?per_page=100
--paginate`) and posts `gh pr comment <n> -R <repo> --body "@coderabbitai
review"` unless a comment whose body, trimmed, is exactly `@coderabbitai
review` was created at or after the `started_at` of `HEAD`'s earliest
CodeRabbit run. That time stands for when the head arrived; a request
before it was about an older commit. Code posts it, inside the one script
the allow list grants a push, a pull request and a ready, so its text and
the once-per-head rule are tested rather than left to a brief. Alternative
rejected: the agent running `gh pr comment` itself, whose text and count no
check reads.

The four endings:

- `finish: ready #7 — CodeRabbit skipped 1a2b3c4; asked for a review`
- `finish: ready #7 — CodeRabbit skipped 1a2b3c4; a review was already asked for`
- `finish: ready #7 — CodeRabbit skipped 1a2b3c4; comments unread, nothing asked: <why>`
- `finish: ready #7 — CodeRabbit skipped 1a2b3c4; the request failed, gh exited <n>`

`finish` does not read again after posting: whether the request took is the
`coderabbit` skill's read of the head, which already ends `OPEN` over a head
not yet reviewed. A second `finish` on the same head is refused before any
of this while the pull request is ready (`gh pr ready <n> --undo` first), and
the comment read holds it when it is not.

The explore's option C, `gh pr ready --undo` and a second `finish`, is
superseded by answer 2, which asks for the review directly rather than
through a second ready event that CodeRabbit's documentation promises no
more for than the first.

### Identity

`gh` posts as whoever it is authenticated as. On the laptop that is the
user, under the standing permission of answer 4 b for exactly this line and
nothing else. This is the one comment under the user's name the harness
makes without a prompt, so `core/git-and-prs.md`'s two bullets that forbid
any (*… nor any other comment as the user*, *Send, reply, comment or review
under the user's name only through a call the user approved*) and
`core/rules.md`'s Safety rule naming what `finish` is granted name it as
their exception. The `gh pr comment` deny entry stays: it holds the agent's
own hand, and `finish` runs `gh` from code, as it already runs `gh pr
create`.

A session holds no token of the GitHub App's (`github-app-identity`), so
`finish` never posts as the App's bot; that request is the host runner's,
in the follow-up card. The user says the bot holds a CodeRabbit seat, so its
command is expected to work, which the explore's evidence from other
repositories (CodeRabbit ignoring bot accounts) predates. That is an
assumption, below.

### The bounded wait is the user's exception to *never wait on a review bot*

`core/git-and-prs.md` says never to wait on a result a review bot produces.
`finish`'s two waits are bounded at 60 s and 90 s, run in code rather than
in the agent's turn, and were chosen by the user (answer 1 a); that bullet
names them as its exception, and the agent still ends its turn on
`finish`'s last line rather than waiting for the review itself.

### The host

`finish` behaves the same wherever it runs. On `rate limited` the agent
reports the pull request and stops, on the laptop by answer 3 a, and on the
host too until Windmill exists (roadmap stage 6): answer 3 b, a delayed
Windmill job posting `@coderabbitai review` as the App's bot once the window
opens, needs a scheduler this tree does not have, and the window's end is
written only in CodeRabbit's summary comment, which the check run does not
carry. It goes to a follow-up card on the Harness board, status `idea`. The
board loop's and `ci-run`'s own ready switches (`bun/board-loop.ts`,
`bun/ci-run-draft.ts`), which mark a pull request ready without `finish`,
read nothing yet; that card names them too.

## Assumptions

- The silent skip is the race of the push's event and the ready one. If it
  is not, the wait before the switch costs about 7 s per `finish` and buys
  nothing, and the reads and the request after it still catch the skip.
- The App's bot can run `@coderabbitai review` because it holds a seat. The
  roadmap's stage 2.5 live probe on the host checks it; until then only the
  laptop path has been seen to work, by the user's own comments.
- CodeRabbit keeps naming its check run `CodeRabbit` and the rate limit's
  title `Review rate limited`. A rename reads as no run or another
  conclusion, which the last line prints by name: visible, not silent.

## Risks / Trade-offs

- [Every `finish` is slower, by about 35 s when the review comes and up to
  150 s when it does not] → the alternative is an agent waiting an hour on a
  review that never comes, which is what the card records.
- [A post under the user's account] → one line, at most once per head per
  pull request, only on `skipped`, and only in a repository that tracks
  `.coderabbit.yaml`.
- [The comments read pages through every comment on the pull request] →
  harness pull requests carry tens; `--paginate` keeps it correct past 100.

## Migration Plan

None: the next `finish` after the merge behaves the new way, and nothing
parses its output.

## Open Questions

None. The answers of 2026-10-31 settle the explore's four questions.
