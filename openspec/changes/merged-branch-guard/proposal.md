# merged-branch-guard

## Why

A pull request that has merged strands every commit made to its branch
afterwards, and the rule protecting against that is prose: re-check the
branch's pull-request state before every commit to it. On 2026-08-19 that
rule was not executed and four commits were stranded on a branch merged
seven hours earlier — the branch was inherited already checked out, and
nothing asked what state it was in. The guard that already refuses a commit
on `main` runs on the same event and can decide this one too.

## What Changes

- `scripts/command-guard.ts` refuses a `git commit` on a branch whose commits
  are already upstream, which is what a merged pull request leaves behind
  whatever style closed it.
- The freshness half of the check — not the merged verdict — engages only
  for a branch that exists on the remote. A branch with no counterpart has,
  so far as the repository can tell, never been pushed, so no pull request of
  it can have merged and it pays nothing, which is most local work.
- A repository with no base ref at all is an explicit exception rather than an
  undecidable: with no upstream there is nothing a merge could strand, and
  refusing there would refuse every commit in every scratch repository.
- The merged verdict runs for every branch and holds however old the base ref
  is, because a stale base can only miss a merge, never invent one. Closing
  that one direction is a separate refusal: on a branch that is on the remote,
  a base ref not fetched recently is refused as undecidable rather than
  passed, because that is the case the incident consisted of.
- `docs/git-and-prs.md`'s prose rule is shortened to what the guard cannot
  see, per *A mechanised prohibition leaves its prose home*.

## Non-goals

- Reaching the network. The guard costs 16–22 ms per Bash call today; a fetch
  or a `gh` call on every commit is a different order of cost, and an offline
  session would degrade to exactly the behaviour that missed the merge.
- Guarding anything but `git commit`. A push from a merged branch is already
  refused when it names `main`, and a push of stranded commits to the branch
  itself harms nothing the commit did not already.
- Deciding whether a merged branch's work should be moved, and where. The
  guard says the commit must not land here; where it lands is a judgement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: the guard's commit rule gains a second refusal — a
  branch whose commits are already upstream, and a pushed branch whose
  merge state cannot be decided from a stale `origin/main`.
- `agent-rulebook`: none. The prose shortening this change performs is what
  that capability's existing requirement already demands; no requirement of
  it changes.

## Impact

- `scripts/command-guard.ts`, a new `scripts/branch-state.ts` holding the ref
  reads, and their tests in a new `scripts/command-guard-branch.test.ts`.
  `scripts/command-guard.fixture.ts` gains a remote and a fetch time — it
  drives the guard through a real repository, which is what a branch-state
  check needs.
- `docs/git-and-prs.md`: the pull-request-state rule is shortened to the part
  the guard cannot reach.
- Every commit the agent makes on a pushed branch now depends on
  `origin/main` having been fetched recently, which is a workflow cost paid
  in one command.
- No dependency, no configuration, no client code.
