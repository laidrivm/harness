# coderabbit-resolve-fixed-threads — tasks

Three groups, one pull request: `feat/coderabbit-resolve-fixed-threads`. Each
failing case first, its failure seen, cited as `// spec: <capability>/<slug>`.
The bare `origin` comes from `bun/work-finish.fixture.ts`; its `gh` stub
answers every `gh api` call with one file, so `bun/work-resolve.fixture.ts`
gets a stub that answers each call by its arguments — the pull-request read,
each page of the threads query, each mutation — and logs every call.

## 1. `work.ts resolve`

- [ ] 1.1 The last Safety rule of `core/rules.md` takes the wording the user
      adopted (`design.md`, decision 9, *The Safety rule names `resolve`*),
      in the commit that adds the subcommand (1.2). Verify by reading the
      rule back against the design's quote
- [ ] 1.2 Failing cases in `bun/work-resolve.test.ts` for the arguments: no
      `--comment`; `--comment 123x`, `--comment ""`, `--comment -1`; `--pr 0`,
      no `--pr`, `--pr 7 --pr 8`; a positional; an unknown option — each
      prints the usage, exits 2 and logs no `gh` call. `--pr 7 --comment 1
      --comment 2` reaches the command with both ids. Then add the `resolve`
      branch and usage line to `bun/work.ts`, `parseArgs` with `multiple:
      true` on both options and `--pr` taken only once, each value anchored
      `^[1-9]\d*$`
- [ ] 1.3 Failing cases for the pull request: a detached `HEAD` refuses before
      any thread read; `--pr 8` on a branch whose open pull request is #7
      refuses naming #7; `--pr 9` on a branch open as #7 and #9 reads #9's
      threads; a failed pull-request read refuses naming `gh auth status`;
      each refusal exits 1 with no mutation logged. Then write
      `bun/work-resolve.ts` reusing `originRepository()` and
      `readPullRequests()` from `bun/pull-requests.ts`
- [ ] 1.4 Failing cases for placing the ids: no threads at all refuses the id
      as unplaced; a reply's id inside the bot's thread refuses; one of two
      ids opening the user's thread refuses the whole call with no mutation;
      `coderabbitai-x` and a `null` author each refuse; a failed thread read
      refuses; an id opening the 101st thread, served as the second page of
      a `--paginate --slurp` read, is placed; `4433138725`, past 2³¹, is
      placed by its `fullDatabaseId` string. Then the read
- [ ] 1.5 Failing cases for the resolves: one id, unresolved, makes one
      `resolveReviewThread` call with its thread's id, prints `resolve: <id>
      resolved` and exits 0; a resolved and an unresolved one make one call,
      print a skip and a resolved line, exit 0; the same id named twice
      resolves once; an outdated unresolved thread is resolved; the second of
      three calls failing leaves the first resolved, names the second, does
      not attempt the third, exits 1. Then the mutation loop
- [ ] 1.6 `README.md`: the command table gets the `resolve` row beside
      `finish`, linking `openspec/specs/work-resolve/spec.md`, and *Cloud
      sessions* says `resolve` fails there, the proxy refusing GraphQL;
      `bun/work.ts`'s header comment names the subcommand. Verify with `bun
      test bun/work*.test.ts` and `bun test bun/settings.test.ts`

## 2. The `coderabbit` skill and the docs

- [ ] 2.1 Failing cases in `bun/command-guard-gh-api.test.ts`: the skill's
      `check-runs?check_name=CodeRabbit` read, its `<head sha>` filled in,
      passes the guard; the existing `<head sha>/status` case keeps passing.
      A failing case pinning the skill to `finish-review-arrives`'s rule for
      "reviewed": while `bun/coderabbit-run.ts` is not on `main`, step 1
      names the `success` conclusion and the `Review skipped` title prefix,
      and the requirement *CodeRabbit's state of a commit is read from its
      check runs*, read from that change's delta (or
      `openspec/specs/work-finish/spec.md` once archived), still says
      "succeeded with a title not opening `Review skipped`"; once the module
      is on `main`, the case reads its constants — conclusion, title prefix
      and app slug — instead, and whichever change applies second makes that
      switch. Then rewrite step 1 of
      `core/skills/coderabbit/SKILL.md`: head, then the check runs
      (`check_name=CodeRabbit&filter=all`, paginated) and the status, then
      the reviews; reviewed by a review on the head, the status
      `success`/`Review completed`, or runs of CodeRabbit's app with none in
      progress and one concluded `success` titled anything not opening
      `Review skipped` — never the summary's text; the head counted without
      a review object is disposed of and re-fetched like any review, and
      ends `PASS` only while the walkthrough reads «No actionable comments
      were generated» naming the head as its `Commit`, else the no-review
      `OPEN` line; a head that moved before a fix re-reads all three signals
- [ ] 2.2 Step 1's filters: a comment counts only when its `user.login` is
      exactly `coderabbitai[bot]`; the fourth call reads `fullDatabaseId`
      for `databaseId`; a resolved thread is dropped as `already
      resolved`; an outdated thread that is not resolved is verified like
      any finding. Step 2: read each finding's severity word, the two markups
      (`**<picture>…</picture> Major**`, `_🟠 Major_`) as examples, not a
      pattern; take every severity in a body, as now. Step 6's legend names
      `success` and the check run on the no-review `OPEN` line
- [ ] 2.3 The skill's report: right above the gate line, `bun bun/work.ts
      resolve --pr <n> --comment <id> …` naming the first comment's id of
      each unresolved thread of the bot's whose every finding, its replies'
      included, it fixed or found fixed — never a reply's id, never a thread
      holding a skipped or rejected one; run after the session's own
      `finish` pushed, or at once when the run applied no fix, and only
      while the head read right before is the verified or the pushed
      commit, else `/coderabbit` again; a session
      whose launcher pushes names it in its final message and runs nothing. The *Never post to the PR* rule's "no resolves" points at that
      command, `@coderabbitai resolve`/`approve` still named as forbidden.
      Grep the skill for "resolve" afterwards and read each hit
- [ ] 2.4 `core/review-toolkit.md`: the head with no findings counts by its
      check run too, and the `Review skipped: draft pull request` code span
      is rejoined onto one line. `core/git-and-prs.md`'s approval bullet: the
      thread of a fixed finding is resolved by the session with `work.ts
      resolve` after `finish` pushed it; a dismissed one stays the user's.
      Grep `core/`, `README.md` and `openspec/specs/` for `Review completed`
      and "resolve" wording these contradict

## 3. Archive order

- [ ] 3.1 Before `/opsx:archive`, confirm `finish-review-arrives` is under
      `openspec/changes/archive/`, so the `agent-autonomy` requirement's
      citation of *CodeRabbit's state of a commit is read from its check
      runs* resolves in `openspec/specs/work-finish/spec.md`; if it is not,
      wait for it. Verify with `ls openspec/changes/archive | grep
      finish-review-arrives`
