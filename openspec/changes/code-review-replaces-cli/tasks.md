# Tasks

#324 (the archive of `pre-pr-diff-paths`) has merged, so the
`pre-pr-runner` requirements this change modifies are live; merge
`origin/main` into the apply branch first, as for any step.

## 1. The runner names `code-review`

- [ ] 1.1 In `bun/pre-pr-steps.test.ts` and `bun/pre-pr-steps-run.test.ts`,
      make the expected lists name a `CODE_REVIEW` id of `"code-review"`
      where they name `CODERABBIT_LOCAL`, and the `[3]` case's title
      `code-review`; make the case that reads each id's `SKILL.md` under
      `core/skills/` skip `code-review`, with a comment naming the
      `bun/review-docs.test.ts` case that pins `Skill(code-review)` (design.md
      decision 5). Verify with `bun test bun/pre-pr-steps.test.ts
      bun/pre-pr-steps-run.test.ts` that they fail on the missing export, and
      record it
- [ ] 1.2 In `bun/pre-pr-steps.ts`, export `CODE_REVIEW = "code-review"` in
      place of `CODERABBIT_LOCAL` and name it in `JUDGEMENT`; grep `bun/` and
      `orchestrator/` for `CODERABBIT_LOCAL` and `"coderabbit-local"` and
      switch every caller. Verify with the two test files green

## 2. The toolkit runs `/code-review` as the local review

- [ ] 2.1 Probe, in this branch's worktree, which argument `/code-review`
      reads as the base of its diff and which as a tree (design.md decision
      1): run it once with the runner's base named, and check that the files
      it names are all in `git diff --name-only <base>...HEAD`. Record the
      form that works in design.md decision 1 before 2.2 cites it; if none
      does, stop and report it
- [ ] 2.2 In `bun/review-docs.test.ts`, turn the cases of *the local review
      runs only while no pull request is open* to read step 5
      (`5. \`/code-review\``), the documentation-branch paragraph and a
      `/code-review` bullet found by its opening (`` `/code-review` — ``),
      each naming `/code-review high`; add cases that the bullet names the
      form 2.1 recorded for the base, names no `--comment`, `--fix` or
      `--post`, counts each finding 🟠 Major (design.md decision 3), says the session writes the `CODE-REVIEW gate:` line, and that a
      review that does not return or names a file the branch's diff does not
      change is reported and the push goes on (cite
      `local-review-loop/the-review-does-not-return`); that the
      `/coderabbit-local` bullet says it is in no sequence and no gate; and
      that the `/coderabbit` bullet disposes on the same terms as
      `/code-review`. Delete the cases of *the /code-review bullet measures
      Claude's review beside the CLI* but the `Skill(code-review)` one, and
      add a case that the doc holds no `Review measurement`. Normalise
      whitespace before matching. Verify they fail and record it
- [ ] 2.3 Edit `core/review-toolkit.md` with the editing tool: the
      `/code-review` bullet takes the local-review terms of the
      `/coderabbit-local` bullet and design.md decisions 1–4 and 8, losing
      the measurement; the `/coderabbit-local` bullet shrinks to an on-demand
      skill, in no sequence and no gate (decision 6), keeping its guideline
      sentence; step 5 and the documentation-branch paragraph name
      `/code-review high`; the `/coderabbit` bullet points at `/code-review`'s
      terms. Verify with `bun test bun/review-docs.test.ts` green
- [ ] 2.4 Edit `README.md`'s sentence on `Skill(code-review)` to name step 5
      rather than the measurement, and `core/skills/session-wrapup/SKILL.md`'s
      example ledger line to `code-review`. Then grep the tree for
      `coderabbit-local`, `Review measurement`, `measured beside` and `local
      CLI`, leaving as they are the archive, `docs/context/` (records of past
      sessions), other open changes, the skill itself, `README.md`'s table
      row and gate-line list (the kept skill still ends on a gate line) and
      the `Skill(coderabbit-local)` entry; list the remaining hits and their
      dispositions in the commit message. At archive, rewrite the Purpose of
      `openspec/specs/local-review-loop/spec.md`, which no delta reaches, to
      name `/code-review` as the local review and drop the measurement

## 3. Verify

- [ ] 3.1 `openspec validate code-review-replaces-cli --strict`, `bun test
      bun/board-state-hygiene.test.ts bun/spec-coverage-sweep.test.ts
      bun/spec-coverage-floor.test.ts`, then the pre-PR sequence with
      `/code-review high` as its step 5 in the form 2.1 recorded; read one
      ledger record of that call and confirm its `rule` reads `code-review`
      once `judgement-step-record` has merged, or name in the report that it
      has not (design.md, *Risks*)
