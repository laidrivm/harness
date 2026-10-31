# coderabbit-resolve-fixed-threads — tasks

Two groups, one pull request: `feat/coderabbit-resolve-fixed-threads`. Each
failing case first, its failure seen, cited as `// spec: <capability>/<slug>`.
The `gh` stub on `PATH` and the bare `origin` come from
`bun/work-finish.fixture.ts`.

## 1. `work.ts resolve`

- [ ] 1.1 Failing cases in `bun/work-resolve.test.ts` for the arguments: no
      `--comment`; `--comment 123x`, `--comment ""`, `--comment -1`; `--pr 0`,
      no `--pr`; a positional; an unknown option — each prints the usage,
      exits 2 and logs no `gh` call. `--pr 7 --comment 1 --comment 2` reaches
      the command with both ids. Then add the `resolve` branch and usage line
      to `bun/work.ts`, `parseArgs` with `multiple: true`, each value anchored
      `^[1-9]\d*$`
- [ ] 1.2 Failing cases for the pull request: a detached `HEAD` refuses before
      any thread read; `--pr 8` on a branch whose open pull request is #7
      refuses naming #7; a failed pull-request read refuses naming `gh auth
      status`; each exits 1 with no mutation logged. Then write
      `bun/work-resolve.ts` reusing `originRepository()` and
      `readPullRequests()` from `bun/pull-requests.ts`
- [ ] 1.3 Failing cases for placing the ids, the stub serving the threads
      query: no threads at all refuses the id as unplaced; a reply's id
      inside the bot's thread refuses; one of two ids opening the user's
      thread refuses the whole call with no mutation; a failed thread read
      refuses; `coderabbitai` and `coderabbitai[bot]` count as the bot,
      `coderabbit-fan` does not; an id opening the 101st thread, on the
      second page, is placed. Then the paginated read
- [ ] 1.4 Failing cases for the resolves: one id, unresolved, makes one
      `resolveReviewThread` call with its thread's id, prints `resolve: <id>
      resolved` and exits 0; a resolved and an unresolved one make one call,
      print a skip and a resolved line, exit 0; the same id named twice
      resolves once; an outdated unresolved thread is resolved; the second of
      three calls failing leaves the first resolved, names the second, does
      not attempt the third, exits 1. Then the mutation loop
- [ ] 1.5 `README.md`'s command table gets the `resolve` row beside `finish`,
      linking `openspec/specs/work-resolve/spec.md`; `bun/work.ts`'s header
      comment names the subcommand. Verify with `bun test bun/work*.test.ts`
      and `bun test bun/settings.test.ts`

## 2. The `coderabbit` skill and the docs

- [ ] 2.1 Failing case in `bun/command-guard-gh-api.test.ts`: the skill's
      `check-runs?check_name=CodeRabbit` read, its `<head sha>` filled in,
      passes the guard; the existing `<head sha>/status` case keeps passing.
      Then rewrite step 1 of `core/skills/coderabbit/SKILL.md`: head, then
      the check run and the status, then the reviews; reviewed by a review on
      the head, the status `success`/`Review completed`, or the check run
      `completed`/`success` whose summary's first line is `Result: Success -
      Review completed`; the head counted without a review object is disposed
      of and re-fetched like any review
- [ ] 2.2 Step 2: read each finding's severity word, the two markups
      (`**<picture>…</picture> Major**`, `_🟠 Major_`) as examples, not a
      pattern; take every severity in a body, as now. Step 6's legend names
      `success` and the check run on the no-review `OPEN` line
- [ ] 2.3 The skill's report: right above the gate line, a run that applied
      fixes names `bun bun/work.ts resolve --pr <n> --comment <id> …` for each
      inline comment whose every finding it fixed, run after `finish` pushed
      the fix; the *Never post to the PR* rule's "no resolves" points at that
      command, `@coderabbitai resolve`/`approve` still named as forbidden.
      Grep the skill for "resolve" afterwards and read each hit
- [ ] 2.4 `core/review-toolkit.md`: the head with no findings counts by its
      check run too, and the `Review skipped: draft pull request` code span
      is rejoined onto one line. `core/git-and-prs.md`'s approval bullet: the
      thread of a fixed finding is resolved by the session with `work.ts
      resolve` after `finish` pushed it; a dismissed one stays the user's.
      Grep `core/`, `README.md` and `openspec/specs/` for `Review completed`
      and "resolve" wording these contradict
- [ ] 2.5 Only once the user approved it on the card: the last Safety rule in
      `core/rules.md` reads "`bun bun/work.ts finish` is the one script the
      allow list grants a push, a pull request and a ready, and `bun
      bun/work.ts resolve` the one it grants a review thread's resolve." If
      the user declines or rewords it, apply their wording or drop the task
      naming the answer
