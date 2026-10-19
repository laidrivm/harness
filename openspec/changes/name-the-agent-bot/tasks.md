# name-the-agent-bot — tasks

One group, so the change ships whole on `feat/name-the-agent-bot`. Numbers in
brackets refer to the proposal-stage `/zombies` list in the proposal's pull
request. The failing cases come first, and the task records that they fail
against the tree as it stands.

## 1. Name the bot and cap the rounds

Closes `agent-permissions` §*The rule against writing under the user's name
names the App's bot* and `agent-autonomy` §*A pull request gets CodeRabbit's
fixes for at most three rounds*.

- [ ] 1.1 Write the failing cases in a new `bun/review-docs.test.ts`. Each
      case cites its scenario in a `// spec:` comment and reads the doc at
      the test's own run, inside the case. Prose is compared with whitespace
      normalised, as `bun/autonomy.test.ts` does. The cases:
      - `core/git-and-prs.md`'s bullet on writing under the user's name
        holds a backticked `<slug>[bot]` login, and the bare `<slug>` is
        named as the App [1, 2];
      - a bullet with no `[bot]` login, or whose slug is empty or only
        whitespace, fails and names the bullet, and the scan never runs
        against an empty slug [1, 4];
      - a bullet wrapped across a line break still matches [3];
      - the bullet names the runner and the orchestrator, says never from
        inside a session, and still says the `gh` writes stay refused
        [5, 6];
      - no file that `git ls-files bun` lists holds the slug read from the
        doc. The negative case runs against a made-up slug in a temporary
        tree, so the test never spells the App's name, and an untracked
        file holding the slug does not fail it [7, 8];
      - `core/review-toolkit.md`'s `/coderabbit [pr]` bullet, found by its
        opening and not by the `/coderabbit-local` bullet's "three reviews",
        caps rounds at three, names `CODERABBIT gate: BLOCKED`, and carries
        an `(unattended: card` marker with non-empty text after its dash
        [10, 12, 13];
      - that bullet says nothing is posted in the pull request at the cap
        [15].
      Run `bun test bun/review-docs.test.ts` and record that it fails on the
      two bullets as they stand.
- [ ] 1.2 Edit `core/git-and-prs.md`'s bullet *Send, reply, comment or review
      under the user's name …*. Keep its sentences. Add that the App
      `laidrivm-harness-agent` writes as itself and shows as
      `laidrivm-harness-agent[bot]`, only from the board loop's runner or
      the orchestrator, never from inside a session, which holds no token
      of the App's (`github-app-identity`). Add the id and email nowhere
      (design.md, D1). Verify: the 1.1 cases for this bullet pass.
- [ ] 1.3 Edit `core/review-toolkit.md`'s `/coderabbit [pr]` bullet. Add the
      cap of three rounds, a round being CodeRabbit's review of one commit,
      counted from the pull request's reviews (design.md, D4). Then add what
      happens at a fourth round whose review carries a finding to apply: the
      run applies none, ends on `CODERABBIT gate: BLOCKED` naming the cap,
      and reports each finding left, attended to the user, and
      `(unattended: card — …)` as one question on the card with nothing
      posted in the pull request (design.md, D5). Verify: every 1.1 case
      passes.
- [ ] 1.4 Run `/zombies` without arguments over the diff. Read the
      behavioural items [9, 11, 14, 16] against the two bullets: a session's
      own conduct, which no bun test can run. Each of them is disposed
      there, in prose.
- [ ] 1.5 Grep the four places for the wording that each edit makes
      incomplete: `under the user's name`, `round trip`, `three rounds`,
      `fourth`. Reconcile every site the change makes false, and name the
      site in the pull request's body. The `remove-ship` archive and
      `local-review-loop` §*The loop terminates* are records and the local
      cap, and they stay as they are. Verify: `bun test` passes whole.
