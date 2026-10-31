# fix-card-done-by-pr — design

## Context

`bun/work-status.ts`'s `evidence()` fetches `origin`'s `main`, extracts its
`openspec/changes` into a temporary directory, strips this repository's own
`<name>: ` prefix from the `Pointer`, and matches what is left against
`POINTER` (`bun/work-take.ts`) and `ARCHIVE`; anything else refuses under
`no-pointer`. The command calls no `gh`. The one read of pull requests is
`readPullRequests()` in `bun/pull-requests.ts`: `gh api` on REST, the
repository from `origin` (or handed in), a minted token where
`HARNESS_GITHUB_APP_MINT` names a mint, a `SIGKILL` at `limit()`, and
`undefined` for every failure. The goal check, the board loop and `push-draft`
use it.

Readers of `Pointer` that are not `status` already read `pr:350` as no
change: `work.ts take` prints that the pointer names no change of this
checkout (work-take, *Take prints the change the card points at*); the board
loop and its pause notice match a `Pointer` wholly equal to
`openspec/changes/<slug>/`; `session-wrapup` compares only change
directories.

## Goals / Non-Goals

**Goals:**

- `status --to done` proves a `pr:<N>` card by GitHub's word on pull request
  `N` of `origin`'s repository, with no tree read.
- One copy of the `gh api` call — mint, limit, kill, parse — for both readers.

**Non-Goals:**

- `finish` writing the `Pointer`; a list of pull requests; checking that the
  pull request is the card's own (proposal, *What Changes*).
- The status guard on `notion-create-pages` (answer 4 b), which is a card of
  its own.
- `proposed` or `applied` for a `pr:` card.

## Decisions

### The form: `pr:<N>` in `Pointer`

Answer 1 a. Rejected: a `PR` number property (option B), which changes the
board's schema and still holds one number; the card's `Ссылки` (option C),
prose naming several pull requests with nothing saying which closes it — #350's
card links #338, #326 and #350; `refs/pull/<N>/head` an ancestor of
`origin/main` (option D), which needs no `gh` but misses a squash or rebase
merge, whose commits are new; a full URL, which pins the card to a host and an
owner, as task-board's *rich_text rather than url* already refuses.

The pattern is `^pr:([1-9]\d*)$`, anchored both ends, read after the
`<name>: ` prefix is stripped exactly as for a path. The number goes into
the API path, so nothing but digits may reach it, and it goes there as the
matched string, never through `Number()`, which rounds a number past 2^53 to
another pull request's.

Every other reader of `Pointer` keeps reading `pr:` as no change, which is
what a fix card is: `take` says the pointer names no change of this checkout,
and the board loop and its pause notice match only a change's path. No
shared classifier is added for them, since none of them acts on a fix card.

### The check: merged, into `main`

The read is `gh api repos/<owner>/<repo>/pulls/<N>`. Merged is `merged_at`
not null — `state` reads `closed` for a merged and an unmerged pull request
alike — and `base.ref` equal to `main`, the branch the tree evidence fetches
too. The repository is the one `origin` names, so "of this repository" holds
by construction; no `head.repo` check is made, since a fork's pull request
merged into `main` closes the card as well as a branch's.

### The reader: `readPullRequest(n, repo?)` beside `readPullRequests`

It takes the number as the digits the `Pointer` held, and returns
`{ state, base }`, `state` in `Pull`'s `OPEN`/`MERGED`/`CLOSED` mapping and
`base` the `base.ref` as read, or `undefined` for a failed read. An answer
that is not an object whose `number` is that number and whose `state` is
`open` or `closed` is a failed read, so an error body that `gh` printed with
exit 0 refuses under `unread`, never as a closed pull request. Two things
lift into private functions both readers call, so the second read is no second
copy (rule: *Write logic a second time only by lifting it*). One is the mint,
the environment, `spawnSync` with `limit()` and `SIGKILL`, and the JSON parse.
The other is the `state` mapping from `state` and `merged_at`. Only
`readPullRequests`' own filtering stays its own. The token is minted with
`pull_requests=read`, as for the branch read. The module's opening comment,
which describes a branch's pull requests and their callers, is rewritten to
cover both reads.

### The order in `evidence()`

The `Pointer` is classified before the fetch: prefix stripped, then `pr:`
tried first. A `pr:` card never fetches or archives, so the temporary
directory is made only for a path. For `pr:` the order of checks
(`notion-status-gate` design, *The order of checks and the write*) keeps its
places; step 4 reads the pull request instead of the tree:

1. `--to proposed` or `applied`: refused under `no-evidence`, no read.
2. The read; `undefined` refuses under `unread`.
3. `state` not `MERGED`, or `base` not `main`: refused under `no-evidence`,
   naming the pull request and what it read.

A `pr:` that the pattern refuses, `pr:035` or `pr:350 (fix)`, falls through to
the path match and refuses under `no-pointer` quoting it, as today. No new
ledger id. A refusal on a `pr:` card records no commit, since no `origin/main`
was read.

### Tests

The `gh` stub of `pull-requests.test.ts` (a script on `PATH` that logs its
arguments and prints the case's answer) covers the reader. For `status`,
`work-status.fixture.ts`'s `Run` gains an optional `gh` answer and exit status,
written as the same kind of stub into the run's `bin`; without one, no `gh`
is on `PATH`, so an unexpected read fails the case. The fixture's `origin` is a
local bare path, whose last two segments `remoteRepository()` reads as owner
and repository, so the query is asserted on the stub's log. The cases go in a
file of their own, `bun/work-status-pr.test.ts`, beside the tree file.

## Risks / Trade-offs

- [A `Pointer` written through the connector is unchecked: a session can name
  someone else's merged pull request and get `done`] → the same weakness as a
  `Pointer` naming another card's slug; the user reads the board, and the
  pull request is linked under `Ссылки` (roadmap clarification 11).
- [`gh` unauthenticated or offline] → `unread`, fail closed, as the tree
  read's failed fetch.
- [A card created straight at a `Status` other than `idea` through
  `notion-create-pages`, which the status guard does not match] → the user
  chose to close it now (answer 4 b), in a card of its own on the `Harness`
  board, `40a39875c31b81468d11f38edc885528`; this change leaves the guard as
  it is.
- [`main` hard-coded] → the tree evidence hard-codes it already; both move
  together if a repository's default branch is ever named otherwise.
