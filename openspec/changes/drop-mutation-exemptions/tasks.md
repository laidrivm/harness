## 1. Remove the exemption half

- [ ] 1.1 Delete `exemptions()`, the `DISABLE` and `ADMITTED` patterns and the
      `Comment` handling from `scripts/mutation-floor.ts`, with its call from
      the `import.meta.main` block and the now-unread `MODEL` and `MODEL_NAME`
- [ ] 1.2 Delete `scripts/mutation-floor-exemptions.test.ts`
- [ ] 1.3 Delete the three cases in `scripts/mutation-floor-cli.test.ts` that
      rest on that half — the malformed directive, the same comment in another
      file, and the absent model — and the `files` argument of its `cli`
      helper if nothing else passes one
- [ ] 1.4 Drop `./scan.ts` from `scripts/mutation-floor.fixture.ts`'s
      `modules` map, leaving the check and `./root.ts` — what the check still
      imports — and confirm the command-line cases still stand a runnable copy
- [ ] 1.5 Leave `scripts/scan.ts` untouched, and confirm it: `comments()` and
      its span bookkeeping stay for `scan-lift`'s consumer, so `git diff` names
      neither that file nor `scripts/scan.test.ts`

## 2. Move the requirement and the prose with it

- [ ] 2.1 Sync the `REMOVED` delta into
      `openspec/specs/mutation-floor/spec.md`, taking the whole *An equivalent
      mutant is admitted at the line it occupies* requirement and its four
      scenarios
- [ ] 2.2 Remove the four bullets in `docs/testing.md` §The mutation floor that
      describe the directive's accepted form, its `all` refusal, its comment
      spelling and the one-mutator rule; leave the floor's own bullets and the
      `reports/mutation/` deletion note
- [ ] 2.3 Search the four places `docs/feature-workflow.md` names for a
      sentence naming the exemption check, and correct or delete what no
      longer reads true. Three are grepped — this change's sibling artefacts,
      `openspec/specs/**` and the README ownership map — and the fourth, the
      cards, is read through the saved `Board view`, a board being no part of
      this tree.
      `openspec/specs/mutation-floor/` is the likeliest of the four to hold
      one, being where the check is specified

## 3. Prove the gate still holds

- [ ] 3.1 `bun test` — the surviving mutation-floor cases, `scan.test.ts` and
      `module-classes.test.ts` all pass, and the count of files drops by one
- [ ] 3.2 `bun run typecheck` and `bun run lint` clean, no unused import left
      behind by the deletions
- [ ] 3.3 `scripts/spec-coverage-floor.test.ts` passes with `FLOOR`
      unchanged at whatever `scripts/spec-coverage.ts` reads when this runs —
      the four scenarios left the specs rather than the citations, so the
      count falls with the floor's denominator and the gauge does not move.
      Not a figure: the floor was 385 when this was written and 402 once
      `notion-task-board` synced, and naming one would fail this step for the
      wrong reason
- [ ] 3.4 Run the real gate end to end: `rm -rf reports/mutation`,
      `bunx --no-install stryker run`, `bun scripts/mutation-floor.ts` — it
      exits 0 against `FLOOR = 66`
- [ ] 3.5 `bash scripts/diff-budget.sh origin/main` reports the branch's size,
      and the PR body carries an `oversize:` line only if it must
