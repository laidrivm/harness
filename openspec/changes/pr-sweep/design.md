# pr-sweep — design

## Context

See `proposal.md` for the motivation. What the sweep builds on:

- `bun/pull-requests.ts` reads pull requests through `gh` under a time limit,
  `HARNESS_GH_TIMEOUT_MS` or 30 s.
- `bun/sync.ts`'s `drift(core, copy)` compares two directories, byte for byte.
  It is the check `check.ts` runs over a consumer's `harness/`, and a
  consumer's CI runs `check.ts` (`d2ass` and `mellon` both call
  `bun run harness:check`).
- `bun/bump-pin.ts`'s `pinOf` reads `dependencies.harness` from a
  `package.json`'s text. The harness itself pins itself under
  `devDependencies` and has no `harness/` copy.
- `github-app-identity` group 2 adds `bun/github-app.ts`: the two settings
  (both or neither), the JWT, `GET /app`, the installation lookup and the token
  request. Its token request names the two permissions the board loop needs.
- `vps-board-loop` splits the host into a `runner` user, which alone reads the
  secret files (`gh_token`, and later the App's key), and an `agent` user,
  which runs the sessions and owns the clones under `/home/agent/clones`.

The user settled these on the card (2026-10-17 and 2026-10-18). They are fixed
here and not reopened:

1. A sweep about once an hour backs up the events. It does not replace them.
2. Only agent pull requests are swept: `feat/` and `spec/` branches, authored
   by the App `laidrivm-harness-agent[bot]` or the loop's credentials.
3. An agent fixes a description that has drifted from its diff.
4. A pushed branch is never rewritten, so a branch behind its base is updated
   by merge: `gh pr update-branch` without `--rebase`. gh 2.97.0's help, read
   on 2026-10-18, says it merges by default.
5. A flaky test is recorded, never re-run green.
6. No state is stored apart from GitHub. "Handled at SHA" is a commit status
   from the App, context `harness/sweep`, on the head SHA.
7. Pushes and statuses go out as the App, through the token the runner mints.

## Goals / Non-Goals

**Goals:** a script that can run from a terminal today, with the user's `gh`
login, and later from the host's timer as `runner`, unchanged. Its output is
the whole interface the later flows need.

**Non-Goals:** the proposal's *Out of scope*. Also no retry inside a run: a
call that fails leaves its head unmarked, and the next run is the retry.

## Decisions

### One repository per run, named by its argument

`bun bun/pr-sweep.ts <owner>/<repo>`, run from a harness checkout. The
argument must match `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$`
as a whole, with a repository part other than `.` and `..`. Every `gh` call
names it (`--repo` or the `repos/<owner>/<repo>/` path). The sweep reads no
clone. It writes only a temporary directory for the drift check, removed when
the run ends. So it takes no lock of `pass.sh`'s and cannot race a pass in a
clone. On the host it runs as `runner`. That user holds the credentials, and no
session runs as it.

A clone's `origin`, as the board loop reads it, is the other way. It would tie
the sweep to the `agent` user's clones and to the lock that guards them, for
one string.

### The listing

One call reads everything the filter and most of the judgement need:

```text
gh pr list --repo <r> --state open --limit 1000 --json
  number,headRefName,headRefOid,baseRefName,author,isCrossRepository,
  isDraft,mergeable,statusCheckRollup
```

The allowed authors are compared with `author.login` as `gh` prints it. For an
App, that is `app/<slug>` with `is_bot` true. This was checked by reading a
Dependabot pull request of `microsoft/playwright` on 2026-10-20. The App's
slug comes from `GET /app`, through `github-app.ts`. The credential's login
comes from `gh api user --jq .login`, run with the sweep's inherited
environment before any App token is set. When that call fails, only the App is
allowed. When there is no App either, the run exits 1, since nothing could be
listed.

### The order of judgement at an unmarked head

1. `harness/sweep` on the head → `skipped` (`marked`). A draft → `skipped`
   (`draft`).
2. `mergeable` `UNKNOWN` → `waiting` (`mergeability`).
3. `mergeable` `CONFLICTING` → a `conflict` hand-off, marked. `update-branch`
   would fail on it every hour. The card's list did not name the conflict.
   It is added because, left out, the sweep would mark a head that no flow
   picks up.
4. Behind its base → `gh pr update-branch <n> --repo <r>` → `updated`. The new
   head is judged by the next run, once its CI has run.
5. Drift → a `drift` hand-off, marked, whatever CI reads. A consumer's CI runs
   `check.ts`, so drift usually turns it red as well. The drift hand-off says
   what the fix is, where `ci` would say only that something failed. The
   agent's fix pushes a new head anyway.
6. Any check pending, or none at all → `waiting` (the pending checks' names,
   or `no checks`).
7. Any check failed → a `ci` hand-off, marked.
8. Otherwise → a `description` hand-off unless the head is a merge from the
   base, marked.

### Behind is read from the compare API, not `mergeStateStatus`

The sweep reads `gh api repos/<r>/compare/<base>...<head sha>` and treats the
head as behind when `behind_by` > 0. `mergeStateStatus` holds a single value,
so `BLOCKED` stands for a missing approval, and every agent pull request lacks
one under the `main` ruleset. The enum's descriptions, read on 2026-10-20, do
not say which value wins when a PR is both blocked and out of date, and they
say nothing of when `BEHIND` is reported. The explore's recommendation read
`BEHIND` from it, and this design departs from that. `behind_by` answers the
one question asked.

### Drift reuses `drift` over two fetched directories

Where the head's `package.json` (`gh api …/contents/package.json?ref=<sha>`)
has no `dependencies.harness`, drift is not judged. That is the exemption, and
the harness's own repository is the case it names. Otherwise `pinOf` reads the
pin, and a malformed value fails the pull request. The sweep then fetches:

- every file directly under the head's `harness/`;
- every `.md` file directly under `laidrivm/harness`'s `core/` at the pin.

Each set is written into a directory of its own under the OS temp directory.
Then `drift(coreDir, copyDir)` runs unchanged. A 404 on the `harness/` listing
is an empty copy. Any other failure fails the pull request. Comparing blob
SHAs from the trees API would save the file reads, but it would be a second
copy of `drift`'s three rules (`rules.md` Code).

The harness is public, so the swept repository's installation token reads its
`core/`, just as Actions' `GITHUB_TOKEN`, also an installation token, checks
out public repositories.

### CI is judged per check by its latest run

The rollup can hold several runs of one check: the diff-budget workflow runs
again on `edited`, and PR #176 holds two `budget` runs. Each entry is keyed as
`<workflowName> / <name>` for a check run (the name alone when `workflowName`
is empty) and as `context` for a commit status. The entry with the latest
`startedAt` counts for its key, and `harness/sweep` is left out. A check run
is passed when it is `COMPLETED` with conclusion `SUCCESS`, `NEUTRAL` or
`SKIPPED`, and pending while it is not `COMPLETED`. A status is passed when it
is `SUCCESS` and pending when it is `PENDING` or `EXPECTED`. Everything else
failed, `CANCELLED` and `TIMED_OUT` included. The CodeRabbit status counts like
any other.

### A green head's description is checked unless the head merges the base

No deterministic test can tell whether a description still matches its diff,
so the agent judges that (decision 3). The sweep decides only when to ask. It
asks once per green head, except where the head commit has two parents and
the base already holds the second. That is `update-branch`'s merge, which adds
the base's commits and none of the branch's own. It is read through
`gh api repos/<r>/commits/<sha>` for the parents and
`compare/<base>...<second parent>`, where `ahead_by` is 0. A merge whose
conflicts were resolved by hand fits the same shape and is not asked about.
That gap is accepted.

### The line

One JSON object per line, on standard output, in the listing's order. Nothing
else goes to standard output. A refusal before the listing goes to standard
error.

```json
{"repo":"laidrivm/demo","pr":42,"branch":"feat/demo-1","sha":"<40 hex>","outcome":"marked","handoffs":[{"kind":"ci","to":"ciflow","detail":["Test / test"]}]}
```

- `outcome` is `marked`, `updated`, `waiting`, `skipped` or `failed`.
- `reason`, a string, is present for `waiting`, `skipped` and `failed`, and
  absent otherwise.
- `handoffs` is always an array. The kinds are `conflict`, `drift`, `ci` and
  `description`. `to` is `ciflow` for `ci` and `agent` for the rest. `detail`
  is always an array of strings: `drift`'s problem lines, `ci`'s failed
  checks, and empty for the other two.

A consumer keys a hand-off by repository, number, SHA and kind. The same key
can arrive twice: when the mark fails, the next run judges the head again.
Printing before marking makes a hand-off at least once. Marking first would
make it at most once, and a run killed between the two would then lose it
without a trace. So `marked` means the head was judged and its mark is written
next. A mark that then fails leaves the printed line as it stands. Standard
error names the pull request and the SHA, and the run exits 1.

### The mark

`gh api -X POST repos/<r>/statuses/<sha> -f state=success
-f context=harness/sweep -f description=<…>`. The description reads
`handed off: <kinds, comma-separated>` or `nothing to hand off`. The state is
`success` whatever was handed off. The status says the sweep handled the SHA,
not that the PR is good, and a `failure` would show a second red check beside
the one being handed off. GitHub allows 1,000 statuses per SHA and context.
The sweep writes one.

### Identity

With the App configured, `github-app.ts` mints one token at the start of the
run, after the credential's login is read. The token names the swept
repository alone, with `contents: write` and `pull_requests: write` for
`update-branch`, `statuses: write` for the mark, and `checks: read` for the
rollup. To make that possible, its token request takes the permission set from
its caller, and the board loop passes its two. Every later `gh` call gets the
token through `GH_TOKEN` in its environment, never in an argument. A token
lives an hour, longer than a run of a few repositories' pull requests takes.
Without the App, `gh` keeps the environment it inherited. Every `gh` call is
killed at the time limit `pull-requests.ts` applies, which that module exports
rather than this one copying it (`rules.md` Code).

## Risks / Trade-offs

- [GitHub may refuse the App an `update-branch` whose merge brings in changes
  to `.github/workflows/`, since the App holds no Workflows permission;
  unprobed] → the line then reads `failed` in every run until the user
  updates that branch, and the error is in the run's output.
- [A session working on the same branch when the sweep updates it] → its
  push is refused as a non-fast-forward. The hand-off flows, which are later
  changes, must merge the remote tip first (`git-and-prs.md`). The board loop
  works only on branches with no pull request yet, so it never meets this.
- [Anyone with push access can write a `harness/sweep` status] → that makes
  the sweep skip a head. Only the user and the App hold push access, and
  sessions hold no token.
- [Two runs overlapping on one repository] → both may update a branch or
  hand off twice. The consumer's key absorbs a duplicate hand-off. Running one
  sweep per repository at a time belongs to the engine.
- [Each green head costs one agent check of its description] → the
  base-merge exemption leaves out the sweep's own updates. The rest is the
  price of decision 3.
- [A check that never finishes keeps its head `waiting`] → the line names
  that check in every run.

## Migration Plan

Nothing runs the script until a later change wires it to a timer. Group 1
can run from a terminal with the user's `gh` login. To roll back, stop
running it. The statuses it wrote stay on their SHAs and decide nothing.

## Open Questions

- Decision 2 allows the loop's credential as an author. Under
  `vps-board-loop` that credential is a token of the user's own account, so
  the user's hand-made `feat/` and `spec/` pull requests are swept too. Once
  the App opens every loop pull request, the credential's login could stop
  being an allowed author while the App is configured. The spec follows the
  decision as recorded, and the question stays open until the user answers
  it.
