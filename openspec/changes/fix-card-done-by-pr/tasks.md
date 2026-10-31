# fix-card-done-by-pr — tasks

One group, one pull request, `feat/fix-card-done-by-pr`. Each failing case is
written first, its failure recorded, and cited as `// spec: <capability>/<slug>`.
The cases are the proposal-stage `/zombies` ideas, bracketed by number.

## 1. A fix card's `done` by its merged pull request

- [ ] 1.1 Failing cases in `bun/pull-requests.test.ts` for
      `readPullRequest(n, repo?)`, over the file's `gh` stub: a pull request
      merged into `main` reads `{ state: "MERGED", base: "main" }`, its query
      `repos/o/r/pulls/350` [2]; an open draft reads `OPEN` [4]; `{}` reads
      `CLOSED`, with the base undefined [1]; an empty `merged_at` is not merged [3];
      `gh` exiting 1 [5], an array answer [6], no `origin` with no `gh` call [7]
      and a failing mint with no `gh` call [8] each read `"failed"`; the minted
      token reaches `gh` [9]. Then add the reader, lifting the mint, spawn and
      parse that `readPullRequests` makes into one function both call (design,
      *The reader*). Verify: `bun test bun/pull-requests.test.ts` passes,
      and the existing `readPullRequests` cases pass unchanged
- [ ] 1.2 Give `bun/work-status.fixture.ts`'s `Run` an optional `gh` answer
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
- [ ] 1.3 Name the form where the `Pointer` is described. In
      `core/feature-workflow.md`, the bullet that opens "A card's `Pointer` is
      a directory of this tree" gains the `pr:<N>` form, which the session
      that opened the closing pull request writes beside its `Ссылки` link,
      and the reconciliation bullet skips a `pr:` pointer as it skips a
      cross-repository one. `README.md`'s `work.ts status` row says that
      `done` is also proven by a pull request merged into `main`. Verify:
      `grep -n 'pr:<N>' core/feature-workflow.md README.md` finds each place,
      and `bun test` passes
