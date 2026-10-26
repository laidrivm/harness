# Tasks

## 1. The local review runs only before the pull request, and Claude's review is measured beside it

- [ ] 1.1 In `bun/review-docs.test.ts`, add failing cases that read
      `core/review-toolkit.md` with whitespace normalised (`flat()`): step 5
      of *The pre-PR sequence* and its documentation-branch paragraph each
      say `/coderabbit-local` runs only while no pull request is open on the
      branch, a draft counting as open, and that a push into an open one
      skips it while the earlier steps run, and that a state the read could
      not get runs it; the `/coderabbit-local` bullet says the same. Cite
      `local-review-loop/a-push-into-an-open-pull-request`,
      `local-review-loop/a-branch-whose-pull-request-was-closed-unmerged`,
      `local-review-loop/the-pull-request-s-state-cannot-be-read` and
      `local-review-loop/a-code-branch-reaches-the-end-of-the-sequence`.
      Derive each case's text inside the case. Verify the cases fail with
      `bun test bun/review-docs.test.ts` and record the failure
- [ ] 1.2 Add failing cases for a new `/code-review` bullet in *The skills*,
      found by its opening as the `/coderabbit` bullet is: it names
      `/code-review high`, a fresh subagent, the commit of the CLI's first
      pass, a `## Review measurement` heading line in the pull request's
      body with one line per verified defect naming which reviewer flagged
      it, or the single line `none` when neither flagged one, the full
      candidate command `gh pr list --repo <repo> --state all --search
      '"Review measurement" in:body' --json number,body`, and that only a
      body with a line exactly `## Review measurement` counts as measured, an
      `idea` card filed once CodeRabbit has reviewed the fifth, by the
      session disposing of that review, the end at the tenth, that it is no gate,
      that a run that does not return leaves no section and is not counted,
      and that `/ponytail-review`'s record is no evidence about it. Cite the
      six scenarios of *Claude's review is measured beside the CLI before
      it may replace it*. Verify they fail and record it
- [ ] 1.3 Edit `core/review-toolkit.md` with the editing tool: the
      `/coderabbit-local` bullet, step 5 and the documentation-branch
      paragraph per 1.1; the `/code-review` bullet per 1.2 and design.md
      decisions 3–8; step 5 names the measurement by pointing at that
      bullet, not restating it. Verify with `bun test
      bun/review-docs.test.ts` green
- [ ] 1.4 Grep the tree, the archive excepted, for each claim replaced —
      `coderabbit-local`, `then push`, `one pass of`, `fix push` — and
      reconcile every site that still says the CLI runs before every push;
      `core/git-and-prs.md` and `core/autonomy.md` are expected to need no
      edit (design.md, Context). Verify with the grep output read back and
      `bun test bun/spec-coverage.test.ts bun/spec-coverage-floor.test.ts`
      green
