# fix-card-done-by-pr — tasks

One group, one pull request, `feat/fix-card-done-by-pr`. Each failing case is
written first, its failure recorded, and cited as `// spec: <capability>/<slug>`.
The cases are the proposal-stage `/zombies` ideas, bracketed by number.

## 1. A fix card's `done` by its merged pull request

- [x] 1.1 Failing cases in `bun/pull-requests.test.ts` for
      `readPullRequest(n, repo?)`, over the file's `gh` stub: a pull request
      merged into `main` reads `{ state: "MERGED", base: "main" }`, its query
      `repos/o/r/pulls/350` [2]; an open draft reads `OPEN` [4]; an empty
      `merged_at` on a closed one is not merged [3]. These each read
      `undefined`, which the file's entry prints as `"failed"`: `{}`, an error
      body, and an answer whose `number` is not 350 [1]; `gh` exiting 1 [5]; an
      array answer [6]; no `origin`, with no `gh` call [7]; a failing mint, with
      no `gh` call [8]. The minted token reaches `gh` [9]. Then add the reader,
      lifting the mint, spawn and parse, and the `state` mapping, into
      functions both readers call, and rewrite the module's opening comment
      to cover both reads (design, *The reader*). Verify: `bun test
      bun/pull-requests.test.ts` passes, with the existing `readPullRequests`
      cases unchanged
- [x] 1.2 Give `bun/work-status.fixture.ts`'s `Run` an optional `gh` answer
      and exit status, written as a logging stub into the run's `bin`, with
      no `gh` on `PATH` without one. Then write failing cases in a new
      `bun/work-status-pr.test.ts`. `pr:350` merged into `main` writes `done`,
      with no `fetch` or `archive` in the git log and the query on the stub's
      log [10]. `pr:0`, `pr:035`, `pr: 350`, `PR:350`, `#350` and `pr:350 (fix)`
      refuse under `no-pointer`, quoting the pointer, with no `gh` call [11],
      as does `pr:350` with a trailing space [12]. An open pull request
      refuses under `no-evidence` naming its number [13], a merge into
      `release` naming the base [14], and a pull request closed unmerged
      [17]. `--to applied` [15] and `--to proposed` [16] refuse under
      `no-evidence` with no `gh` call. A `gh` that exits 1 [18], and no `gh`
      at all [19], refuse under `unread`. `demo: pr:350` writes [21] and
      `other: pr:350` refuses under `no-pointer` [20]. From `approved`, five
      cards and a proven `pr:` `done` make no query [22]. Then classify the
      `Pointer` before the fetch in `bun/work-status.ts` (design, *The order in
      `evidence()`*). Verify: `bun test bun/work-status` passes, the tree
      cases unchanged
- [x] 1.3 Name the form where the `Pointer` is described. In
      `core/feature-workflow.md`, the bullet that opens "A card's `Pointer` is
      a directory of this tree" gains the `pr:<N>` form, `<repo>: pr:<N>` on
      another repository's board. On a fix card with no change directory, the
      turn that adds the closing pull request's `Ссылки` link writes it too. That is the
      session that opened the pull request, or, when the user opened it, the
      first turn that learns it exists. The session that learns the pull
      request merged moves the card with `status --to done` in that turn,
      unless the card is `discarded`. The reconciliation bullet skips a `pr:`
      pointer, as it skips a cross-repository one. `README.md`'s `work.ts status` row says that
      `done` is also proven by a pull request merged into `main`. Verify:
      `grep -n 'pr:<N>' core/feature-workflow.md README.md` finds each place,
      and `bun test` passes
