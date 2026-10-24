## 1. A group reopened after its merge is carried on a retry branch

- [ ] 1.1 Move `consider()` and `Step`'s import, unchanged, from
      `bun/board-loop.ts` to a new `bun/board-loop-takeable.ts`, exported,
      and import it in `board-loop.ts`. Verify with
      `bun test bun/board-loop-takeable.test.ts bun/board-loop.test.ts` and
      `wc -l` on both files
- [ ] 1.2 Let the stub `gh` in `bun/board-loop.fixture.ts` answer per branch:
      a `ghBy` map from branch to the JSON `gh api` prints for it, the
      existing `gh` staying the answer for every other branch. Keep the file
      at or under 300 lines, splitting first if it would pass the cap
- [ ] 1.3 Write the failing cases in `bun/board-loop-takeable.test.ts`, one
      per scenario of *A pass takes only a takeable change* this change adds,
      each marked `// spec: board-loop/<scenario>`: group 4 reopened takes
      `feat/demo-4-2` (marked `change-slicing/a-task-added-to-a-merged-group`
      too); single group takes `feat/demo-1-2`; an open and a
      closed pull request on `feat/demo-4-2` pass over naming it; a closed,
      unmerged step branch tries no retry; a merged answer branch tries no
      retry; a `gh` listing the same merged pull request for every name stops
      after ten names. Change case [14]'s merged row to the retry it now
      takes. Record that they fail
- [ ] 1.4 Add the retry probe to `consider()` as `design.md` decides, with
      `merged` on `Step` in `bun/board-loop-prompt.ts`, and make 1.3 pass
- [ ] 1.5 Add the retry sentence to `prompt()`'s first line for a retry
      branch not left, and a case in `bun/board-loop-stage.test.ts` marked
      `// spec: board-loop/a-retry-branch-not-yet-created`; mark the
      existing left-branch case for a retry branch as well. Keep
      `board-loop-stage.test.ts` at or under 300 lines (it is at 300: put
      the new case in `board-loop-takeable.test.ts` or a new file)
- [ ] 1.6 In `core/git-and-prs.md`, after the step-branch sentence, add that
      a group holding an unticked box after its pull request merged ships
      again on `<its branch>-<k>` (`feat/<slug>-1-<k>` for a single group),
      `k` from 2, the first name only merged pull requests have not used.
      Verify with `bun test bun/spec-coverage*.test.ts` and `bun test`
