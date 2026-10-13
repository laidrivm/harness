# turn-gate-pulled-commits — design

## Context

`bun/turn-gate.ts mark` writes `HEAD` at `UserPromptSubmit`. At `Stop`,
`tip()` takes `HEAD` when it moved, or `@{upstream}` when `HEAD` is back at the
mark and the upstream holds a commit the mark lacks. `completed()` then lists
every active `tasks.md` at the tip and reads each one at the mark and at the
tip in one `git cat-file --batch` call. A group counts when it is complete at
the tip and not at the mark. Nothing in that comparison asks where the commits
between the two came from. The motivation is in proposal.md, *Why*, and the
requirement is in `specs/commit-gates/spec.md`.

The command guard refuses a commit on `main` and a push that may reach `main`
(`bun/command-guard.ts`, `main-commit`, `main-push`, `push-to-main`). So
`origin/main` moves only when a pull request merges or the user pushes. The
agent cannot take either step alone.

## Goals / Non-Goals

**Goals:** a turn that only pulls, fetches or merges `main` completes no group;
a turn that completes its own group is decided exactly as it is today.

**Non-Goals:** in proposal.md, *Non-goals*.

## Decisions

### Exclude by the group's state on `origin/main`, not by commit reachability

A third side joins the comparison. A group complete at the tip counts only
when it is complete neither at the mark nor on `origin/main`. `completed()`
asks for `<BASE>:<path>` beside `<at>:<path>` and `<tip>:<path>` in the batch
it already makes, so the cost is one more blob per active change.

- *Alternative: end the turn when the tip is an ancestor of `origin/main`.*
  This covers a fast-forward pull and a fetch on `main`. It misses a merge of
  `main` into a feature branch, which the branch's own sessions run whenever
  they catch up, and which brings in every group `main` completed since the
  branch was cut.
- *Alternative: count only commits in `<mark>..<tip>` that `origin/main` cannot
  reach, and attribute groups to them.* This reaches the same verdict in every
  case listed below, including the self-merge ceiling, because a squash merge
  leaves the branch's own commits unreachable and the group complete on `main`
  either way. It needs a diff walk per commit where the chosen rule needs one
  blob.
- *Alternative: record `origin/main` at the mark.* The fetch that brings a
  group in is the one that moves the ref during the turn. A copy taken at the
  mark predates the group, so it excludes nothing in the very case the card
  reports.
- *Alternative: author or committer.* Rejected on the card: neither field says
  which turn made a commit.

### `origin/main`, the constant `branch-state.ts` already names

`bun/branch-state.ts` declares `BASE = "refs/remotes/origin/main"` for the
merged-branch guard. The turn gate imports it rather than declaring a second
copy, so the two gates cannot disagree about which branch is the base.
`refs/remotes/origin/HEAD` was considered, as `bun/diff-budget.sh` reads it.
Both consumers and the harness resolve it to `origin/main` (measured
2026-10-13), so it adds no case today, and it would split the base across two
names.

### Read at `Stop`, and an absent ref excludes nothing

The ref is read when the turn ends, for the reason the delta gives. When
`origin/main` does not resolve, `git cat-file --batch` answers `missing` for
its blobs, which `blobs()` already reads as empty. The exclusion set is then
empty and the verdict is today's. This leans towards refusing. The
once-per-mark bound limits that to one refusal, and a repository on this
harness without `origin/main` has not been seen.

### What `pre-pr-run-record` and `self-pinned-gates` see

- The runner's record is consulted only after `completed()` returns a group
  (`decide`, `ran(end, top)`). A turn whose only groups came from `origin/main`
  now returns before that point. It needs no record, and the workaround of
  running `bun bun/pre-pr.ts` on a clean `main` stops being needed. A turn with
  a group of its own still needs the record for its tip, unchanged.
- The gate ledger records nothing for such a turn, because `log` is called only
  on that same path. Today it gets a `refused` and then a `released`. The
  counts `session-wrapup` reads from the ledger drop by those false entries.
- `self-pinned-gates` (#78) runs the harness's hooks from
  `node_modules/harness/`. Once it merges, this fix reaches harness sessions
  only after the pin moves past the apply's merge commit, as `harness-updates`
  sets out. The delta's registration paragraph is the live one. #78 edits that
  paragraph, so whichever change is archived second re-copies the requirement.

### The tests' repository gains a `main` on its remote

`turn-gate.fixture.ts`'s `repo()` pushes only `feat`. The new cases publish a
commit to `origin`'s `main` and fetch it, so `refs/remotes/origin/main`
exists. A helper for that goes into the fixture, because the cases split
across files as the existing ones do. No existing case gains the ref, so each
existing case keeps today's verdict. That makes them the regression net for
*A repository without origin/main*.

## Measurements

- **Harness, 2026-10-13:** the orchestrator checkout's reflog of `main` holds
  14 fast-forward pulls from 00:12 to 10:50. Under today's rule, 8 of them
  complete at least one group (11 groups in all), and the turn committed
  nothing in each. Under this rule each pull's tip equals `origin/main`, so
  every one of those groups is excluded and no pull completes one.
- **Consumers, read-only, 2026-10-13:** the same replay over each consumer's
  reflog of `main` finds pulls that complete a group in 2 of 22 for d2ass and
  0 of 24 for mellon. Both would be excluded. Neither consumer's registrations
  change, so their check is unaffected. Both resolve `origin/HEAD` to
  `origin/main`.
- No vendored skill in `skills-lock.json` covers git hooks or this gate.

## Risks / Trade-offs

- **A turn that merges its own pull request** ends unreported. The delta
  names this as the accepted cost.
- **A collaborator's push to the turn's own branch**, fetched during the turn,
  still counts, refused once. Nobody else pushes to a harness branch today.
- **A group already complete on `origin/main` that the turn's branch re-opens
  and closes again** reads as excluded. It is the same heading-level reading
  the mark side already applies (*A group completed in an earlier turn*).
