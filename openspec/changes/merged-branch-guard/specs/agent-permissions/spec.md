# agent-permissions — delta spec

## ADDED Requirements

### Requirement: A commit on a merged branch is refused

The hook SHALL block a `git commit` on a branch whose work is already
upstream, because a merged pull request strands every commit made to its
branch afterwards, whatever merge style closed it. It SHALL decide this with
local git only — no fetch, no `gh`, no network — since it runs on every Bash
call and an offline session must not silently lose the check.

The verdict SHALL be taken from `git cherry`, which marks a commit `-` when an
equivalent patch is already upstream and `+` when it is not, and equivalence
is what survives a squash merge rewriting the branch's commits. A branch SHALL
be treated as merged when at least one of its commits is marked `-`. The rule
SHALL NOT be stated as the absence of `+` marks: a branch with no commits
prints neither mark, and the absence form refuses the first commit of every
branch created.

This verdict SHALL be computed for every branch, whatever the branch's own
state on the remote, and a positive verdict SHALL be honoured however old the
base ref is. A stale base can only fail to carry a merge that has happened; it
cannot invent one. So staleness threatens this requirement in one direction
only, and the freshness rule below exists to close that one.

The hook SHALL refuse a commit when the base ref's last fetch is older than
`FETCH_MAX_AGE`, which SHALL be 30 minutes, measured inclusively: a fetch
exactly 30 minutes old is accepted and one older is refused. The bound SHALL
carry the reason it holds that value where it is declared.

The fetch time SHALL be read from the modification time of the repository's
`FETCH_HEAD`, which every successful fetch rewrites. It SHALL NOT be read from
the reflog of the base ref: a fetch that brings no new commit updates no ref
and so writes no reflog entry, which would refuse the commit while naming a
remedy that cannot change the answer — measured on this repository, where a
fetch bringing nothing left the reflog at 139 entries and its newest timestamp
57 minutes old while `FETCH_HEAD` advanced to the current second.

That timestamp alone SHALL NOT satisfy the bound. `FETCH_HEAD` is written by
every fetch whatever it fetched, so fetching one unrelated ref refreshes it
while leaving the base ref untouched — measured, `git fetch origin <other>`
advanced the mtime by a second and wrote a `FETCH_HEAD` naming only that
branch. The bound SHALL therefore be satisfied only when `FETCH_HEAD` is
within `FETCH_MAX_AGE` **and** its contents name the base branch, which is the
evidence that the fetch it timestamps covered the base. An unreadable
`FETCH_HEAD` SHALL be treated as unknown and therefore as a refusal, on the
terms this capability already applies to an undecidable event.

Where the base ref does not exist at all — no `origin` remote, or no `main`
under it — no merged verdict can be computed, and the commit SHALL be allowed
rather than refused. This is an exception to the undecidable-blocks rule and
is stated as one: a repository with no upstream has nothing a pull request
could have merged into, and refusing there would refuse every commit in every
scratch repository the agent creates, this capability's own test fixture
among them.

The freshness refusal SHALL apply only to a branch that exists under
`refs/remotes/origin/`. A branch with no counterpart there has, so far as the
repository can tell, never been pushed, so no pull request of it can have
merged and the window freshness closes is not open for it. That inference is
weaker than it reads and the weakness SHALL be recorded rather than implied:
deleting the branch on the remote and pruning removes the counterpart, and a
push made without `-u` leaves no upstream configuration behind either, so a
branch that was pushed and then pruned is indistinguishable from one that was
never pushed. Such a branch is still refused by the merged verdict above,
which does not consult that ref; what it loses is only the freshness refusal,
so the residual gap is a branch pruned, merged, and not yet fetched.

Each refusal SHALL name what the agent is to do next — move the work to a
branch cut from the merged base, or fetch — because a block whose remedy is
unstated is a block the session works around.

#### Scenario: A commit on a branch whose pull request merged

- **WHEN** the agent attempts `git commit` on a pushed branch whose commits
  `git cherry` marks `-` against a recently fetched base ref
- **THEN** the hook blocks the call, and the reason names the branch as
  already merged

#### Scenario: The branch was never pushed

- **WHEN** the agent attempts `git commit` on a branch with no ref under
  `refs/remotes/origin/`, and the base ref was last fetched longer ago than
  `FETCH_MAX_AGE`
- **THEN** the commit is allowed, because the freshness refusal does not
  reach a branch no pull request can have merged

#### Scenario: The first commit of a new branch

- **WHEN** the agent attempts `git commit` on a branch freshly cut from the
  base ref, which carries no commits and so no `git cherry` marks at all
- **THEN** the commit is allowed, because no mark is the absence of evidence
  and not evidence of a merge

#### Scenario: A pushed branch with work of its own

- **WHEN** the agent attempts `git commit` on a pushed branch whose commits
  `git cherry` marks `+` against a recently fetched base ref
- **THEN** the commit is allowed

#### Scenario: The base ref is stale

- **WHEN** the agent attempts `git commit` on a pushed branch and the base
  ref was last fetched longer ago than `FETCH_MAX_AGE`
- **THEN** the hook blocks the call, and the reason names fetching the base
  ref as what makes the branch decidable

#### Scenario: A fetch that brings nothing new

- **WHEN** a refused commit is followed by a successful fetch that brings no
  new commit, so no ref is updated
- **THEN** the next commit is allowed, because the fetch time comes from
  `FETCH_HEAD` rather than from a ref's reflog

#### Scenario: A fetch of an unrelated ref

- **WHEN** the last fetch named one branch other than the base, so
  `FETCH_HEAD` is recent but does not name the base branch
- **THEN** the hook blocks the call on a pushed branch, because the recency
  belongs to a fetch that did not cover the base

#### Scenario: The repository has no base ref

- **WHEN** the repository has no `origin` remote, or none with a `main`
  branch, so no merged verdict can be computed at all
- **THEN** the commit is allowed, because there is no upstream a pull request
  could have merged into

#### Scenario: The fetch time cannot be read

- **WHEN** the repository has no readable `FETCH_HEAD`
- **THEN** the hook blocks the call on a pushed branch, because an unknown
  answer takes the blocking path

#### Scenario: The remote branch was deleted and pruned

- **WHEN** a branch's counterpart under `refs/remotes/origin/` has been
  removed by a remote deletion followed by a prune, and its commits are
  marked `-` against the base ref
- **THEN** the hook still blocks, because the merged verdict does not consult
  that ref

#### Scenario: A stranded commit already exists

- **WHEN** a commit has already been made on the merged branch, so
  `git cherry` marks that one `+` while the merged commits stay `-`
- **THEN** the hook still blocks, because the merged commits' marks remain
  for as long as the branch does
