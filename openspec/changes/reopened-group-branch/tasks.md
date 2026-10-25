## 1. The unticked tasks of merged groups are carried as a new group

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
      each marked `// spec: board-loop/<scenario>`: groups 4 and 5 of five
      merged and reopened are one carry step 6 on `feat/demo-6`, the prompt
      naming both (marked `change-slicing/a-task-added-to-a-merged-group`
      too); group 4 of six reopened with group 5 unshipped carries group 4
      alone as step 7; a single group reopened is carry step 2 on
      `feat/demo-2`; an open and a closed pull request on a later group's
      branch pass over naming it; a pull request on the carry branch passes
      over naming it; a closed, unmerged step branch tries no carry. Change
      case [14]'s merged row to the carry it now takes. Record that they fail
- [ ] 1.4 Add the walk to `consider()` as `design.md` decides, with
      `carried` on `Step` in `bun/board-loop-prompt.ts`, and make 1.3 pass
- [ ] 1.5 Add the carry variant to `prompt()`'s first line as `design.md`
      words it, and a case marked `// spec: board-loop/a-carry-step` that
      the first line names the carried groups, the new group, the `(was`
      pointer and the `moved to` line, and that the other lines are the
      launch form's. Put it in `board-loop-takeable.test.ts` or a new file:
      `board-loop-stage.test.ts` is at 300 lines
- [ ] 1.6 In `core/git-and-prs.md`, after the step-branch sentence, add that
      the unticked tasks of groups whose pull requests merged move into a new
      last group, shipped as its own step; in `core/feature-workflow.md`,
      after the answer step's paragraph, that a carry step changes only the
      first line of the form, naming the move. Verify with
      `bun test bun/spec-coverage*.test.ts` and `bun test`
