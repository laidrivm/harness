# merged-branch-guard — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (docs/testing.md — TDD for edge cases). The bracketed
numbers are that run's idea numbers, so each of its 15 ideas is traceable to
the group that closes it.

Two groups, so two pull requests on `feat/merged-branch-guard-1` and `-2`, in
order. Group 1 ships the module and its tests with nothing calling it; group 2
wires it into the guard and shortens the prose the mechanism supersedes. The
seam between them is a module no shipped path calls, which is a horizontal
slice — so group 1 is not a released step on its own and group 2 follows it in
the same session.

## 1. The branch-state module

- [ ] 1.1 Extend `scripts/command-guard.fixture.ts` to fabricate a repository
      with an `origin` remote, a `main` branch on it, a branch pushed to it,
      and a `FETCH_HEAD` of a caller-chosen age and contents — age and
      contents both, since the bound reads the file for each. It fabricates no
      reflog: the reflog is what the freshness signal is deliberately not, and
      a fixture offering it invites a test that measures the wrong thing. The
      fixture is shared rather than copied, for the reason its own header
      already gives. (Req: agent-permissions — A commit on a merged branch is
      refused)
- [ ] 1.2 Write the mark-reading tests in
      `scripts/command-guard-branch.test.ts`: no marks at all is allowed [1];
      one `-` mark is merged [3]; `-` and `+` together is still merged [4];
      all `+` is not merged [5]. (Req: agent-permissions — A commit on a
      merged branch is refused)
- [ ] 1.3 Write the reachability tests: a branch with no ref under
      `refs/remotes/origin/` is never examined [15]; a branch name carrying a
      slash resolves its full remote ref [13]; a repository with no `origin`
      remote allows the commit [2]. (Req: agent-permissions — A commit on a
      merged branch is refused, §*The branch was never pushed*, §*The
      repository has no base ref*)
- [ ] 1.4 Write the freshness tests: exactly 30 minutes old is accepted and
      older is refused [6, 7]; a future timestamp must not compute a negative
      age [8]; an unreadable fetch time blocks [11]. (Req: agent-permissions —
      A commit on a merged branch is refused, §*The base ref is stale*,
      §*The fetch time cannot be read*)
- [ ] 1.5 Write the three regression tests the review rounds' probes earned: a
      successful fetch bringing no new commit refreshes the bound, which a
      reflog-based reading would not — measured, the reflog stayed at 139
      entries while `FETCH_HEAD` advanced; a fetch naming only an unrelated
      ref does *not* refresh it, though its mtime moved — measured, the file
      it wrote named that branch alone; a branch whose remote-tracking ref was
      removed by a remote deletion and `git fetch --prune` is still refused by
      the merged verdict, which does not consult that ref. (Req:
      agent-permissions — A commit on a merged branch is refused, §*A fetch
      that brings nothing new*, §*A fetch of an unrelated ref*, §*The remote
      branch was deleted and pruned*)
- [ ] 1.6 Write `scripts/branch-state.ts` against those tests: the remote-ref
      test, the `git cherry` read, the `FETCH_HEAD` mtime, the
      `FETCH_MAX_AGE` bound with its reason where it is declared, and a
      result that distinguishes merged, stale and unknown so the guard can
      word each refusal differently. It runs the reads in the repository a
      caller names, not in `cwd`, because `git commit -C <dir>` commits
      elsewhere. (Req: agent-permissions — A commit on a merged branch is
      refused)

## 2. Wiring, and the prose it supersedes

- [ ] 2.1 Write the guard-level tests in `scripts/command-guard-branch.test.ts`:
      a block exits exactly 2 [9]; the stale reason names the fetch and the
      merged reason names moving the work, distinguishably [10]; `git commit
      -C <other-repo>` is decided against the `-C` target [12]; a detached
      HEAD still reaches the existing branch-read refusal first [14]. (Req:
      agent-permissions — A commit on a merged branch is refused)
- [ ] 2.2 Call `branch-state.ts` from `command-guard.ts`'s `commit` arm, after
      the `main` check, and confirm `command-guard.ts` and every file this
      change touches stay under the 300-line cap `change-slicing` sets. (Req:
      agent-permissions — A commit on a merged branch is refused)
- [ ] 2.3 Measure the guard's per-call cost on a non-commit Bash call before
      and after, and record both numbers where the existing 16–22 ms figure is
      stated — the guard runs on every call, so a regression there is paid by
      every tool use, and the claim that only commits pay for this needs a
      measurement rather than a reading of the code. (Req: agent-permissions —
      A commit on a merged branch is refused)
- [ ] 2.4 Shorten `docs/git-and-prs.md`'s pull-request-state rule to what the
      guard cannot see — a merge that has not been fetched yet is refused
      rather than missed, so what remains for the prose is the judgement the
      guard declines to make: where the work goes once it is refused. (Req:
      agent-rulebook — A mechanised prohibition leaves its prose home)
