# merged-branch-guard — design

## Context

`scripts/command-guard.ts` is a `PreToolUse` hook on every Bash call. It
already reads the current branch on a `git commit` to refuse one on `main`,
so the event, the parse and the branch read are all in place; what is missing
is a second question asked at the same point.

The prose rule it would relieve is `docs/git-and-prs.md`: re-check a pushed
branch's pull-request state before every commit to it, as a call whose output
is read before the write. It is a rule about doing something first, which is
the kind a session skips without noticing — on 2026-08-19 it was not run at
all, and four commits landed on a branch whose pull request had merged seven
hours earlier.

Four measurements taken on this repository shape everything below. Each is a
count of the prefixes `git cherry` printed, or a command's own output:

- **A** — a merged branch against a fresh `origin/main`: 3 lines, every one
  `-`. Equivalence detection works with no network.
- **B** — the same branch against the `origin/main` the session actually
  held (`fdfb6d1`): 10 lines, every one `+`. A verdict computed then would
  have said "not merged", so detection alone would have missed the incident.
- **C** — a branch freshly created from `origin/main`, no commits yet: zero
  lines. A rule reading "no `+` lines means merged" refuses every branch's
  first commit.
- **D** — `git rev-parse --verify refs/remotes/origin/<branch>` separates a
  branch that exists on the remote from one that does not, and
  `git reflog show origin/main --date=unix` prints the last fetch as a Unix
  timestamp. Both are local.

A fifth, taken as the negative control this design needs: this branch, one
commit, unmerged and unpushed, printed 1 line, prefix `+`, and zero `-`.

## Goals / Non-Goals

**Goals:**

- Refuse a commit that would be stranded, at the moment it is attempted.
- Cost nothing on a branch that cannot have been merged, which is the
  branch most work happens on.
- Refuse rather than guess when the answer cannot be computed, matching the
  rule the guard's own header states.

**Non-Goals:**

- Any network call. The guard's measured cost is 16–22 ms per Bash call, and
  it runs on every one of them; a fetch or a `gh` call per commit is a
  different order, and offline it would degrade into measurement B — the
  behaviour that missed the merge.
- Guarding `git push`. A push from a merged branch strands nothing the
  commit did not already strand.
- Choosing where stranded work should go instead. The guard refuses the
  commit; recovering the branch is a judgement it should not make.

## Decisions

### Merge is detected by equivalence, not by asking GitHub

`git cherry <upstream> <head>` marks each commit on the branch `-` when an
equivalent patch is already upstream and `+` when it is not. A squash merge
rewrites the commits, so no SHA of the branch appears in `main` afterwards
and containment tests such as `git branch --merged` say nothing; equivalence
is what survives the rewrite. Measurement A confirms it on a real
squash-merged branch, and the negative control confirms the other direction.

*Alternative considered*: `gh pr list --head <branch> --state merged`, which
is what the prose rule tells a human to run. It is authoritative, and it
needs the network, an authenticated `gh`, and a GitHub remote — three things
a commit should not depend on, on a hook that runs on every Bash call.

### The verdict is "at least one `-`", not "no `+`"

Measurement C rules out the negative form directly: a branch with no commits
prints nothing, and "no `+` lines" would read that as merged and refuse the
first commit of every branch ever created.

The positive form is also the one that survives the incident. Once a stranded
commit exists the branch prints `+` for it, so a rule requiring every line to
be `-` goes quiet exactly one commit too early; the `-` lines from the merged
commits remain for as long as the branch does. The negative control shows a
healthy branch carries none of them.

### The check engages only for a branch that exists on the remote

A branch with no counterpart under `refs/remotes/origin/` was never pushed,
so no pull request of it can have merged, and no amount of staleness changes
that. `git rev-parse --verify --quiet refs/remotes/origin/<branch>`
(measurement D) is one local call, and it lets the whole staleness question —
and its cost to the user — apply only where a merge is possible.

This is the decision that makes refusing on stale data affordable. Without
it, every commit in the repository would depend on a recent fetch.

### Staleness threatens the verdict in one direction only

A stale base ref can fail to carry a merge that has happened. It cannot
invent one: a `-` mark means the patch is in the ref the repository holds,
and no amount of age makes that false. So the merged verdict is sound however
old the base is, and is computed for every branch unconditionally; freshness
is a separate rule closing the one direction — measurement B, where the
17-hour-old ref reported the merged branch as unmerged.

### Freshness is `FETCH_HEAD`'s mtime, not a reflog

The first draft of this design read the last fetch from
`git reflog show origin/main --date=unix`. A reflog records *ref updates*, and
a fetch that brings no new commit updates nothing — so on a quiet `main` the
guard would refuse a commit, name a fetch as the remedy, watch the fetch
succeed, and refuse again, until somebody unrelated pushed. Measured on this
repository: across a fetch that brought nothing, the reflog stayed at 139
entries with its newest timestamp 57 minutes old, while `.git/FETCH_HEAD`'s
mtime advanced to the current second. `FETCH_HEAD` is rewritten by every
successful fetch, which is the event the bound is actually about.

Its mtime alone is not enough, and the second review round is what showed why:
`FETCH_HEAD` is rewritten by *any* fetch, so `git fetch origin <other-branch>`
refreshes it while the base ref stands still — measured, the mtime advanced a
second and the file it wrote named only that one branch. But the same file
carries the fix, because what it lists is precisely which refs the last fetch
covered: a plain `git fetch origin` in this repository wrote 130 lines with
`main` among them, and the unrelated-ref fetch wrote one line without it. So
the bound is the mtime *and* the base branch appearing in the contents — one
file read, answering both halves.

*Alternative considered*: running the freshness check as a fetch of the base
alone. That is decision one again — a network call on a hook that runs on
every Bash call — and it answers by doing the thing rather than by observing
whether it was done.

### A repository with no base ref is an exception, not an undecidable

The guard's rule is that what it cannot decide, it blocks. This one case
inverts it: with no `origin` remote, or none carrying `main`, there is no
upstream for a pull request to have merged into, so there is nothing to
strand. Blocking instead would refuse every commit in every scratch
repository — including the one this capability's own fixture fabricates to
test the guard, which would make the check untestable by itself. The
exception is written into the spec as an exception, so that a reader who
knows the fail-closed rule is not left thinking this is a hole in it.

`FETCH_MAX_AGE` is 30 minutes, measured inclusively. It bounds how long a
merge can go unseen, and its cost is one `git fetch` at most twice an hour
while committing on a pushed branch. The number is a judgement, not a
measurement, and it carries its reason where it is declared so that moving it
moves the reason too. Its value and its inclusivity are fixed by the delta
spec rather than here, since a requirement is what a test can cite.

*Alternative considered*: the mtime of `.git/refs/remotes/origin/main`. It is
one `stat` and no subprocess, but a packed ref has no such file and the
mtime then belongs to `packed-refs`, which every other ref update also
touches — and it carries the reflog's defect too, since a no-op fetch leaves
the ref alone.

### What "never pushed" can and cannot be inferred from

The absence of a ref under `refs/remotes/origin/` is the cheap test for a
branch no pull request can have merged, and it is what keeps the freshness
rule off ordinary local work. It is also weaker than it reads, and measuring
it is what showed by how much: in a fabricated repository, deleting the
branch on the remote and running `git fetch --prune` removed the
remote-tracking ref, and a push made without `-u` had left no
`branch.<name>.merge` configuration either — so a branch that was pushed and
pruned is indistinguishable from one that was never pushed.

That erasure does not reach the merged verdict, which never consults the
branch's own remote ref; `git cherry` still marked the pruned branch's commit
in the same probe. What it reaches is only the freshness refusal, so the
residual gap is one branch shape: pruned, merged, and not yet fetched. The
spec records that gap rather than implying a guarantee the check does not
have. Closing it would mean keeping a local record of every branch ever
pushed, which is a second source of truth for a window this narrow.

### The git interrogation is its own module

`scripts/command-guard.ts` stands at 246 lines against the 300-line cap in
`change-slicing`. Three ref reads with the comments this repository writes do
not fit under it, and a file is split to the cap that will apply to it rather
than the one that applies today. The branch questions — is this branch on the
remote, is any of its work already upstream, how old is `origin/main` — go to
`scripts/branch-state.ts`, leaving `command-guard.ts` holding what the
prohibitions are.

That seam already exists: `command-parse.ts` holds how a command line is
read, and the guard's own header says what it keeps is "what the
prohibitions themselves are". Asking git about a branch is the same kind of
thing as parsing a command line — a fact the guard consumes, not a rule it
states.

## Risks / Trade-offs

- **Offline work on a pushed branch is blocked** → the branch that cannot be
  fetched is also the branch whose merge state cannot be known, which is the
  case this change exists to refuse. The cost is bounded by the previous
  decision: an unpushed branch never asks, so the ordinary local loop —
  branch, commit, commit, push — is untouched until the push.
- **A branch that cherry-picked a commit which also landed upstream shows
  `-` without having merged** → it is refused. Over-refusing costs one
  `--no-verify`-free conversation with the user, where under-refusing costs
  the stranded work this change is named after; the guard already resolves
  its uncertainty this way for `git push` operands.
- **The check reads `origin/main` as the base for every branch** → a branch
  cut from another branch is measured against `main` regardless. That is the
  right base for the stranding question, since a merged pull request lands in
  `main`, but it means a stacked branch whose parent has merged is refused
  for the parent's commits rather than its own. Naming the merged commits in
  the refusal message is what tells the two apart.
- **The guard grows a second reason to spawn git** → a pushed branch costs
  three local git calls on a commit instead of one. All three are local ref
  reads; the branch read the guard already does is the expensive one, and it
  is already paid.

## Open Questions

None. The staleness policy was settled with the user before this document was
written: freshness is required, and only for a branch that exists on the
remote.
