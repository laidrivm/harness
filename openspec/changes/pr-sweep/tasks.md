# pr-sweep — tasks

Two groups, so the change ships as `feat/pr-sweep-1` and `feat/pr-sweep-2`.
Group 1 runs from a terminal with the runner user's own `gh` login. Group 2
adds the App and needs `bun/github-app.ts`, which `github-app-identity`
group 2 adds. Numbers in brackets refer to the proposal-stage `/zombies` list
in the proposal's pull request. Each group writes its failing cases first and
records that they fail against the tree as it stands. Every case runs
`bun/pr-sweep.ts` with a `gh` stub first on `PATH`. The stub answers from a
fixture per call and logs each call's arguments and environment. Each case
cites its scenario as `// spec: pr-sweep/<slug>`.

## 1. The sweep with the runner's own credential

Closes every scenario of `pr-sweep` but those of §*The sweep writes as the App
when one is configured*. Of that requirement, it closes *No App*.

- [ ] 1.1 Write the failing selection and exit cases in a new
      `bun/pr-sweep.test.ts`. No open pull request prints nothing and exits 0
      [1]. Non-agent pull requests get the listing alone and no line [2].
      `feat`, `feature/x` and `FEAT/x` are not agent branches, while
      `spec/x` is one [10]. Login `app/<slug>` with `is_bot` matches only when
      an App is configured, and `<slug>` and `<slug>[bot]` never match
      [14, 46]. A draft reads `skipped` with no status, and so does a marked
      head with nothing new. A fork prints no line [45]. At a marked head
      (review of PR 182): a moved base reads `updated`. A check that turned
      red under a mark without `ci` gives one `ci` hand-off and a rewritten
      mark naming `ci` beside the kinds it named before, and the run after it hands off nothing. Neither
      drift nor the description is fetched. The status description is read
      only when a hand-off would follow. A `harness/sweep`
      status in a state other than `success` still marks [15]. Each of these
      arguments exits 2 with no `gh` run: empty, `o/r/x`, `o/..`, `o/.`,
      `o r`, `o/r` with a newline, `-o/r`, and an owner of 40 characters [12].
      A failed `gh api user` exits 1 before the listing [29]. A failed or
      timed-out listing exits 1 [22, 31]. Two pull requests, one `failed` and
      one `marked`, print both lines in listing order and exit 1 [4]
- [ ] 1.2 Write the failing judgement cases in a new
      `bun/pr-sweep-judge.test.ts`:
      - Mergeability `UNKNOWN` reads `waiting` [35]. `CONFLICTING`, even when
        behind, gives a `conflict` hand-off with no `update-branch`, and is
        marked [36].
      - `behind_by` 1 runs `update-branch` with the number and `--repo` and
        no `--rebase`. It reads `updated`, with no drift fetch and no status
        [11, 18, 37]. A failed update reads `failed` with no status [20].
        `behind_by` 0 goes on to judge drift.
      - Drift: a differing file, a missing `harness/` (404, so every core file
        is named), three problems in one hand-off's detail [8, 25]. Drift
        while a check is red, or pending, gives the `drift` hand-off alone,
        marked [38, 39]. A head whose `package.json` has only
        `devDependencies.harness`, or no `package.json`, has no `core/` read
        [23, 44]. A malformed pin reads `failed` naming the value [24]. A
        non-404 listing failure reads `failed`, and so does a pinned `core/`
        with no `rules.md` [26, 27]. The temporary directories are gone after
        every run, a failed fetch included [30].
      - CI: a pending check reads `waiting` naming it. No check reads
        `waiting` with `no checks` [40]. Earlier failed and latest passed
        counts as passed, the reverse as failed [5, 6]. A queued re-run with
        no `startedAt` after a passed run counts as pending, and on a tie
        of `startedAt` a pending run wins, then a failed one (review of PR
        182). One job name in two
        workflows is two keys [7]. `CANCELLED`, `TIMED_OUT` and status
        `ERROR` count as failed, `NEUTRAL` and `SKIPPED` as passed, and
        `EXPECTED` as pending [41]. Two failed checks are named in one `ci`
        hand-off to `ciflow` [9]. No `gh run` call is ever made [42].
      - Description: a green head gives a `description` hand-off with the mark
        `handed off: description` [3]. A head that merges the base gives
        none, while a merge whose second parent the base lacks gives one [43].
        A failed compare call reads `failed` [28].
      - The line and the mark: every fixed key is present. `reason` is absent
        for `marked` and `updated`. `handoffs` and `detail` are always arrays
        [16]. Standard output holds only JSON lines [17]. The mark goes to the
        head SHA with `harness/sweep` and `success`, after the line is printed
        [19]. A failed status write leaves the printed line as it was, names
        the pull request on standard error and exits 1 [21].
- [ ] 1.3 Export the time limit from `bun/pull-requests.ts`, its two callers
      unchanged, and see `bun test bun/goal-check bun/board-loop` stay green
- [ ] 1.4 Add `bun/pr-sweep.ts` as `design.md` fixes: the argument, the
      credential's login, the listing, the order of judgement, the drift
      check through `drift` and `pinOf` over temporary directories, the line,
      and the mark. See 1.1 and 1.2 pass, and `bun bun/file-size.ts` keep
      each file under its cap
- [ ] 1.5 In `README.md`, under *Consuming*, add a paragraph after the board
      loop's: what one run does, that it takes `<owner>/<repo>`, reads no
      clone, re-runs no CI, prints one JSON line per agent pull request, and
      marks with `harness/sweep`. Nothing starts it yet. Verify by reading it
      back
- [ ] 1.6 Run `bun bun/check.ts` and `bun test`. Both pass

## 2. The sweep writes as the App

Closes `pr-sweep` §*The sweep writes as the App when one is configured*:
*The App configured* and *One setting alone*.

- [ ] 2.1 Write the failing cases in `bun/pr-sweep.test.ts`, against a
      `Bun.serve` API reached through `GITHUB_API_URL` and a PKCS#1 key from
      `generateKeyPairSync`. One setting alone, or one that is empty or
      whitespace-only, exits 1 and lists nothing [13, 32]. A failed mint exits
      1 and lists nothing [33]. The token request names the swept repository
      alone, with exactly `contents` and `pull_requests` at `write`,
      `statuses` at `write` and `checks` at `read` [47]. `gh api user` runs
      with no App token in its environment. Every later `gh` call gets the
      token through `GH_TOKEN` [48]. No spawned process's arguments hold the
      token [34]. The App's `app/<slug>` is then an allowed author [46]
- [ ] 2.2 Make `github-app.ts`'s token request take its permission set from
      the caller. Pass the board loop's two from `board-loop-push.ts`, and see
      `bun/github-app.test.ts` and `bun/board-loop-push.test.ts` still pass,
      with the board loop's request body unchanged
- [ ] 2.3 Wire the App into `bun/pr-sweep.ts`: the settings through
      `github-app.ts`, the login read first, then one token minted for the run.
      See 2.1 pass
- [ ] 2.4 Add to the README paragraph from 1.5: the two settings, both or
      neither, and that with them every write is the App's. Verify by reading
      it back. Then run `bun bun/check.ts` and `bun test`. Both pass
