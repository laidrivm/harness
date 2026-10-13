# turn-gate-pulled-commits

## Why

On 2026-10-13 the orchestrator session ran `git pull --ff-only` on `main`, and
the pull brought in #60, which had already merged. The `Stop` half of
`bun/turn-gate.ts` then refused the turn with "This turn committed and
completed "1. The branch-state module and its caller" in
openspec/changes/merged-branch-guard/ … Run the pre-PR sequence now". That turn
committed nothing. The commits came in with the pull, and their pre-PR sequence
had already run on the pull request's branch. The same thing happened five or
six times that day. The workaround was to run `bun bun/pre-pr.ts` on a clean
`main`, which records a run of 0 lines for a tip nobody worked on.

The gate counts a group as the turn's work when the group is complete at the
turn's tip and was not complete at the mark. A pull moves the tip, so every
group that another pull request finished counts. A bare `git fetch` on `main`
counts them as well: the mark's paragraph reads the tip from `@{upstream}` when
`HEAD` has not moved, and `main`'s upstream is `origin/main`. The local
`/coderabbit-local` run on #64 flagged that second case first. Replaying the
orchestrator's reflog from 2026-10-13 under today's rule, 8 of its last 14
fast-forward pulls on `main` completed a group.

This card comes before `board-loop`: an unattended runner pulls `main` at the
start of every cycle, and each of those pulls would be refused.

## What Changes

- A group already complete in the task lists that `origin/main` holds when the
  turn ends does not qualify the turn. That group reached the default branch
  through a pull request of its own. A turn that pulled it, fetched it or
  merged it into a branch brought the group in; it did not complete it.
- `origin/main` is read at `Stop`, in the same `git cat-file --batch` call as
  the mark and the tip. A repository without that ref reads it as holding no
  task list, so nothing is excluded and the gate behaves as it does today.
- A turn that completes its own group, whether or not it pushes or merges
  `main` into its branch, is refused exactly as before. In a turn that
  completes its own group and also pulls in another pull request's group, the
  refusal names only the turn's own group.

## Non-goals

- Telling commits apart by author or committer. Those fields say nothing about
  which turn made a commit, as the card already notes.
- A collaborator's push to the turn's own feature branch, fetched during the
  turn. It still counts once, bounded by the once-per-mark rule. No such push
  has been seen in a repository on this harness.
- Changing what discharges a turn that did complete a group. That is
  `pre-pr-run-record`'s record and the gate lines, and both are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: *A turn that commits reports its gates before it ends* stops
  counting a group that `origin/main` already holds complete when the turn
  ends. It gains scenarios for a pull, a fetch, a merge of `main`, a turn that
  mixes its own group with a pulled one, a repository without `origin/main`,
  and the one ceiling this accepts.

The closest existing artefact is that requirement, as
`openspec/changes/archive/2026-10-08-pre-pr-sequence-gate/` introduced it and
`openspec/changes/archive/2026-10-13-pre-pr-run-record/` extended it.

## Impact

- `bun/turn-gate.ts` reads one more side per task list. `bun/branch-state.ts`
  exports the base ref it already names, so the two gates read one constant.
- A new test file next to the turn gate's existing four.
- `self-pinned-gates` (#78, open) edits the registration paragraph of the same
  requirement. Whichever of the two changes is archived second must re-copy the
  requirement from the live spec.
- Consumers pick up the change at their next pin bump. Their registrations are
  unchanged.
