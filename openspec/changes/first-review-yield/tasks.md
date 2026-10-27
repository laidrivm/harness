# first-review-yield — tasks

One pull request, `feat/first-review-yield`, applied after `work-finish`
group 2 merges (design.md, *Seams*); merge `origin/main` into it first. Each
failing case first, its failure recorded, cited as `// spec:
agent-rulebook/<slug>`.

## 1. The wrap-up writes a `first review` line

- [ ] 1.1 Failing cases in a new `bun/session-wrapup-yield.test.ts`, reading
      `core/skills/session-wrapup/SKILL.md` as
      `bun/transcript-archive-catch-up.test.ts` reads it (its subject derived
      inside each case): step 5 names the line
      `- first review: k of n without Major+` and `none reviewed`, the
      `(Major+)`, `(unmeasured)` and `inferred` marks, and each `gh` read of
      design.md decision 5 verbatim, `{owner}/{repo}` and `--limit 1000`
      included; it counts only the earliest commit reading `Review completed`
      for this pull request (a check run linking its `/pull/<n>`, or the
      status); it takes `<since>` as the day before the previous heading's
      date and skips a pull request an earlier `first review` line names as
      measured, not one named unmeasured, which it adds to the `updated:`
      search's numbers; it counts a dismissed Major; it
      tells the session to read each finding's severity word and names both
      markup forms as examples; `allowed-tools` holds
      `Bash(gh api:*)` and `Bash(gh pr list:*)`; the example block holds a
      `- first review:` line. One citation per scenario of the
      `agent-rulebook` delta. Verify with `bun test
      bun/session-wrapup-yield.test.ts` that each fails, and record it
- [ ] 1.2 Write the step-5 paragraph, the example line and the two
      `allowed-tools` entries in `core/skills/session-wrapup/SKILL.md`, and
      add the first-review count to its `description`. Verify with `bun test
      bun/session-wrapup-yield.test.ts bun/transcript-archive-catch-up.test.ts`
      green
- [ ] 1.3 Live probe: run step 5's reads by hand, from this branch's
      worktree, on #328 (expect the first reviewed commit `a191163` after
      five unreviewed draft heads, and three Major) and #325 (expect `34738ad`
      and no review, so without Major+); confirm the command guard passes
      each read. Record the commands' output in the pull request body

## 2. The baseline entry

- [ ] 2.1 Re-read the baseline window up to `work-finish` group 2's merge
      (design.md decision 7) with step 5's reads: the last 20 pull requests
      measured by decisions 2–4 whose first review completed before that
      merge. Update design.md's *Baseline* table and figure where they
      moved, marking the figure «rough» if any severity was inferred
- [ ] 2.2 Append to the current `docs/context/pipeline-yield-<yyyy-mm>.md`
      an entry headed `## <date> — baseline (first-review-yield)` holding
      the line `- first review: k of 20 without Major+` with the 20 pull
      requests and marks of the *Baseline* table, and one line naming the
      window and design.md as the method. Verify that `git diff origin/main
      -- docs/context/` adds lines only, and that the line's numbers match
      the table
