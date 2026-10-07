# repoint-moved-changes — tasks

The completion check named below is the one in design.md, *A d2ass path is
marked on its own line*: every hit of its grep names a file that exists here
or carries *in d2ass* on its line.

## 1. Cut `bun-version-sites` to the harness's part

- [x] 1.1 File a card on `D2ASS` for the bun version reconciliation, written
      from `bun-version-sites` as it stands: the version-site check (tasks
      1.x, 2.x, 3.1–3.3), the `toolchain-pins` delta, and the design's
      decisions on reading `Dockerfile`, workflow inputs and
      `.github/dependabot.yml`. Add `tracked-file-sweep` task 2.3 (switch
      `src/app/module-classes.test.ts` and `src/app/styles/styles.test.ts` to
      the sweep, in the pull request that bumps the pin to the commit landing
      `bun/tracked.ts`). Verify the card exists on `D2ASS` and names both
- [x] 1.2 Delete `bun-version-sites/specs/toolchain-pins/` and every task,
      design section and proposal passage the card took. Rewrite the
      proposal's Why to say the change was cut and that the rest went to
      `D2ASS`; keep the `agent-permissions` delta. Re-point task 3.4 at
      `bun/settings.ts` / `bun/settings.test.ts` and confirm `Bash(bun up *)`
      is listed there. Verify `openspec validate bun-version-sites` passes and
      the completion check finds nothing in this change but *in d2ass* lines
- [ ] 1.3 Add the `D2ASS` card's name to the cut-down proposal, then commit
      the step on its own and put that commit's hash on the card. Verify the
      card's link resolves to the commit that deleted the artefacts

## 2. Rewrite the two decisions that are not paths

- [ ] 2.1 Rewrite `tracked-file-sweep` design *The module lives under
      `scripts/`, and `src/**` imports it* as in design.md: the module is
      `bun/tracked.ts` beside `bun/scan.ts`, d2ass's `src/app/` tests reach it
      through the pinned package, and the `src/shared/` alternative is
      dropped. Remove task 2.3, naming the `D2ASS` card in its place. Verify
      by reading the section back against `bun/` as it stands
- [ ] 2.2 Re-point `scan-lift` task 1.7 and its design decision *The rule of
      two is a `CLAUDE.md` Code rule* at `core/rules.md`'s Code list, and its
      budget check at `core/rules.md` against ~350 lines and the Code sublist
      against ~20 rules. Verify both figures still match
      `openspec/specs/context-budget/` and that the sublist has room

## 3. Re-point the remaining mentions

- [ ] 3.1 Replace each `scripts/<name>` mention in the seven changes with
      `bun/<name>`, by basename, across proposal, design, tasks and spec
      deltas. Assert the count of replacements against the count of hits
      before and read every changed line back. Verify each new `bun/` path
      exists, or is one a change creates (`tracked`, `branch-state`,
      `turn-gate` and their tests)
- [ ] 3.2 Replace each moved doc (`git-and-prs`, `review-toolkit`,
      `feature-workflow`) with `core/<doc>.md`, and resolve each
      `docs/testing.md` mention by the passage it cites: `core/testing.md`
      where the passage is there, *in d2ass* where it is §The mutation floor.
      Verify by grepping each cited passage's wording in `core/testing.md`
- [ ] 3.3 Resolve each `CLAUDE.md` mention by finding the cited rule's wording
      in `core/`: `core/rules.md` or `core/code-style.md` where it is, *in
      d2ass* where it is not (`tracked-file-sweep`'s import rule for
      `src/model.ts`). Requote a rule whose wording drifted. Verify each
      re-pointed citation by grepping its quote in the file it now names
- [ ] 3.4 Mark every remaining `src/**`, `stryker.config.json` and
      `checks/container-image.test.ts` mention *in d2ass* on its line. Verify
      the completion check reports no unmarked line

## 4. Close

- [ ] 4.1 Run the completion check and `openspec validate --all`; record that
      the first lists only existing harness files and *in d2ass* lines and
      that the second passes
- [ ] 4.2 Run `bun test` and record that the uncited count from
      `bun/spec-coverage.ts` has not grown against the count before 1.1
- [ ] 4.3 Move the `Re-point the moved changes' paths at the harness layout`
      card on `Harness` to `done`, and verify its status reads `done`
