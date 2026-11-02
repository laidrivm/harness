# coderabbit-round-two-scope — tasks

One group per pull request, on `feat/coderabbit-round-two-scope-<n>`. Each
failing case is written first, its failure recorded, and cited as
`// spec: <capability>/<slug>`. The bracketed numbers are the proposal-stage
`/zombies` ideas.

## 1. The round-two rule and the skill's deferral

- [ ] 1.1 Write failing cases in `bun/review-docs.test.ts`, reading the
      `/coderabbit` bullet as the cap cases do. They check that it starts the
      rule at "the second round" [1] and names `openspec/specs/**` and
      `core/**` as the paths whose Minors are pushed [2]. They check that it
      names the card `CodeRabbit Minors deferred from #<N>` and the Skipped
      form `deferred to <card>` [3], says the `resolve` command leaves a
      deferred Minor's thread to the user [4], and says a fourth round
      holding only deferred Minors is not capped [5]. For
      `core/skills/coderabbit/SKILL.md`, whitespace normalised, they check
      that step 5 lets a project's policy defer a finding to a card "by its
      severity, path and round" [6] and lists it under Skipped as
      `deferred to <card>`, counted in the arithmetic [7]. They also check
      that the rule *Severity budgets attention, not belief* names a deferral
      the project's policy makes [8], and that step 3 keeps
      "`below severity threshold` is not a reason on its own" [9]. Verify:
      each new case fails against today's prose
- [ ] 1.2 In `core/review-toolkit.md`'s `/coderabbit` bullet, after the
      three-round cap, add the rule (design, *Where the line falls*, *The
      tail card*), the deferred thread left to the user, and the fourth round
      that holds only deferrals. In the skill, add the sentence to step 5's
      override paragraph, the clause to *Severity budgets attention, not
      belief*, and the deferral as a reason in step 3's Minor line (design,
      *The skill's sentence*). Verify: `bun test bun/review-docs.test.ts`
      passes, and `bun bun/check.ts` passes

## 2. `path_instructions` for a change's artefacts

- [ ] 2.1 Write failing cases in `bun/review-config.test.ts` over the
      repository's config, read through `parsed()` and `at()` as the
      approval cases read it. The first finds the
      `reviews.path_instructions` entry whose `path` is exactly
      `openspec/changes/**`, so a missing list [10] and an `archive/**` path
      [11] both fail it. Then a `test.each` over `archive`,
      `contradictions` and `wording, duplication or style` checks the
      entry's `instructions`, one case per phrase, so a failure names the
      phrase that is gone [12] [13]. No fabricated config is needed, since
      the pin reads one file and no helper is added. Verify: each case fails
      against today's config
- [ ] 2.2 Add the entry to `.coderabbit.yaml` (design, *`path_instructions`,
      not `path_filters`*), and give its header and the test file's header a
      clause on what the entry is for. Add the instructions given to a
      change's artefacts to the list of what the config pins in the
      `local-review-loop` spec's Purpose. Verify: `bun test
      bun/review-config.test.ts` passes, `bun bun/check.ts` passes, and
      `openspec validate --strict --specs` passes
