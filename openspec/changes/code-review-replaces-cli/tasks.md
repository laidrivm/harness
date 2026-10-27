# Tasks

Apply after #324 (the archive of `pre-pr-diff-paths`) has merged: merge
`origin/main` into the branch first, then `openspec validate
code-review-replaces-cli --strict` reports no missing `pre-pr-runner` header.

## 1. The runner names `code-review`

- [ ] 1.1 In `bun/pre-pr-steps.test.ts` and `bun/pre-pr-steps-run.test.ts`,
      make the expected lists name a `CODE_REVIEW` id of `"code-review"`
      where they name `CODERABBIT_LOCAL`, and the `[3]` case's title
      `code-review`; replace the case that reads each id's `SKILL.md` under
      `core/skills/` with one that reads it there for every id but
      `code-review`, and pins `Skill(code-review)` in
      `.claude/settings.json`'s `permissions.allow` for that one (design.md
      decision 5), deriving each case's subject inside the case. Verify with
      `bun test bun/pre-pr-steps.test.ts bun/pre-pr-steps-run.test.ts` that
      they fail on the missing export, and record it
- [ ] 1.2 In `bun/pre-pr-steps.ts`, export `CODE_REVIEW = "code-review"` in
      place of `CODERABBIT_LOCAL` and name it in `JUDGEMENT`; grep `bun/` and
      `orchestrator/` for `CODERABBIT_LOCAL` and `"coderabbit-local"` and
      switch every caller. Verify with the two test files green

## 2. The toolkit runs `/code-review` as the local review

- [ ] 2.1 In `bun/review-docs.test.ts`, turn the cases of *the local review
      runs only while no pull request is open* to read step 5
      (`5. \`/code-review\``), the documentation-branch paragraph and a
      `/code-review` bullet found by its opening (`` `/code-review` — ``),
      each naming `/code-review high`; add cases that the bullet names no
      `--comment`, `--fix` or `--post`, says a correctness finding counts as
      🟠 Major and a cleanup as 🟡 Minor unless the review states one, says
      the session writes the `CODE-REVIEW gate:` line, and that a review
      that does not return is reported and the push goes on (cite
      `local-review-loop/the-review-does-not-return`); that the
      `/coderabbit-local` bullet says it is in no sequence and no gate; and
      that the `/coderabbit` bullet disposes on the same terms as
      `/code-review`. Delete the cases of *the /code-review bullet measures
      Claude's review beside the CLI* but the `Skill(code-review)` one, and
      add a case that the doc holds no `Review measurement`. Normalise
      whitespace before matching. Verify they fail and record it
- [ ] 2.2 Edit `core/review-toolkit.md` with the editing tool: the
      `/code-review` bullet takes the local-review terms of the
      `/coderabbit-local` bullet and design.md decisions 1–4, losing the
      measurement; the `/coderabbit-local` bullet shrinks to an on-demand
      skill, in no sequence and no gate (decision 6), keeping its guideline
      sentence; step 5 and the documentation-branch paragraph name
      `/code-review high`; the `/coderabbit` bullet points at `/code-review`'s
      terms. Verify with `bun test bun/review-docs.test.ts` green
- [ ] 2.3 Edit `README.md`'s sentence on `Skill(code-review)` to name step 5
      rather than the measurement, and `core/skills/session-wrapup/SKILL.md`'s
      example ledger line to `code-review`; then grep the tree, the archive
      excepted, for `coderabbit-local`, `Review measurement` and `measured
      beside`, and leave only the skill itself, its table row, its
      `Skill(...)` entry and this change. Verify by the grep's output in the
      task's commit message

## 3. Verify

- [ ] 3.1 `openspec validate code-review-replaces-cli --strict`, `bun test
      bun/board-state-hygiene.test.ts bun/spec-coverage-sweep.test.ts
      bun/spec-coverage-floor.test.ts`, then the pre-PR sequence with
      `/code-review high` as its step 5; read one ledger record of that call
      and confirm its `rule` reads `code-review` once `judgement-step-record`
      has merged, or name in the report that it has not (design.md, *Risks*)
