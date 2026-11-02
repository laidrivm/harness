# coderabbit-round-two-scope — tasks

One group per pull request, on `feat/coderabbit-round-two-scope-<n>`. Each
failing case is written first, its failure recorded, and cited as
`// spec: <capability>/<slug>`. The bracketed numbers are the proposal-stage
`/zombies` ideas.

## 1. The round-two rule and the skill's deferral

- [ ] 1.1 Write failing cases in `bun/review-docs.test.ts`, reading the
      `/coderabbit` bullet as the cap cases do. They check that it starts the
      rule at "the second round" [1] and dates a finding's round by "the
      commit its review names" [1]. They check that it names, as the living
      docs whose Minors are pushed, `openspec/specs/**`, a change's
      `specs/**`, `CLAUDE.md`, `code_guidelines` and `core/**` [2]. It must
      name the card `CodeRabbit Minors deferred from #<N>` and the Skipped
      form `deferred to <card>` [3], and say that a Minor the card already
      holds is not written again [3]. It must also say that the `resolve`
      command leaves a deferred Minor's thread to the user [4]. No new case
      is needed for the fourth round [5]: the existing cap sentence already
      leaves a skip with a reason alone, and the cap cases pin it. For
      `core/skills/coderabbit/SKILL.md`, whitespace normalised, they check
      that step 5 lets a project's policy defer a finding to a card "by its
      severity, path and round" [6]. They check that it lists such a finding
      under Skipped as `deferred to <card>`, counted in the arithmetic [7].
      They check that the rule *Severity budgets attention, not belief* names
      a deferral the project's policy makes [8]. They check that step 3's
      Minor line names that deferral as a reason and still says "`below
      severity threshold` is not a reason on its own" [9]. Verify: each new
      case fails against today's prose
- [ ] 1.2 In `core/review-toolkit.md`'s `/coderabbit` bullet, after the
      three-round cap, add the rule, the finding's round, the Minor already
      on the card, and the deferred thread left to the user (design, *Where
      the line falls*, *The tail card*). In the skill, add the sentence to step 5's
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
      `contradictions`, `Do not flag wording, duplication or style` and
      `becomes a living spec` checks the entry's `instructions`, one case per
      phrase. The negation is pinned whole, so an entry that asks for wording
      fails. A failure names the phrase that is gone [12] [13]. No fabricated config is needed, since
      the pin reads one file and no helper is added. Verify: each case fails
      against today's config
- [ ] 2.2 Add the entry to `.coderabbit.yaml` (design, *`path_instructions`,
      not `path_filters`*), and give its header and the test file's header a
      clause on what the entry is for. Add the instructions given to a
      change's artefacts to the list of what the config pins in the
      `local-review-loop` spec's Purpose. Verify: `bun test
      bun/review-config.test.ts` passes, `bun bun/check.ts` passes, and
      `openspec validate --strict --specs` passes
