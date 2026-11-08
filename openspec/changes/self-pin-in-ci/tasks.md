# self-pin-in-ci — tasks

## 1. `bump.ts self` and the workflow that proposes its commit

- [ ] 1.1 Write the failing cases in a new `bun/bump-self.test.ts`, starting
      from #281's (`git show 64d84b6^:bun/bump-self.test.ts`), over a scratch
      git repository and `bun/bump.fixture.ts`'s stand-in API: head not green
      → `sha`, `old`, `behind` empty, tree unchanged; head is the pin → same;
      head differs from the pin only in `bun.lock` and `devDependencies.harness`
      → same (D2); the same with both harness fields moved → same; head
      differs only in another `package.json` field (a script) → one bump
      commit; two different pins → non-zero exit naming both specs, tree
      unchanged, also where the head is not green, is the pin or reads as a
      merged bump (D3); head differs elsewhere → one new commit by
      `github-actions[bot]` changing only `package.json` and `bun.lock`, the
      pin at the head, `sha`, `old` and `behind` written with `behind` the
      commit count; the install step failing → non-zero, no commit; a pin
      commit missing from the history (a shallow fetch) → non-zero naming the
      diff, no commit; run as a script with `GITHUB_OUTPUT` set → exactly the
      `sha=`, `old=` and `behind=` lines appended, all three empty on a quiet
      run. Cite each
      `harness-updates` scenario of the self bump in a `// spec:` comment.
      Record that they fail
- [ ] 1.2 Implement D1–D3 in `bun/bump.ts`, restoring `bumpSelf`,
      `mergedBump` and `commitBump` from `64d84b6^`, with `harnessFields`
      exported again from `bun/bump-pin.ts`; `land` calls `commitBump`; the
      usage line and header comment name `self`; `bump.fixture.ts`'s header
      names the third test file. Verify with `bun test bun/bump-pin.test.ts
      bun/bump-self.test.ts bun/bump-land.test.ts bun/bump-verify.test.ts`
      and `wc -l bun/bump.ts` under the file-size cap
- [ ] 1.3 Write a failing case that reads `.github/workflows/self-bump.yml`
      and `test.yml` as parsed YAML: the `workflow_run` trigger names
      `test.yml`'s `name`, `completed` and `main` alone, and the job's `if`
      requires `success` and `push` or a dispatch — a renamed `Test` would
      otherwise stop every bump without a sound. Record that it fails
- [ ] 1.4 Add `.github/workflows/self-bump.yml` per design D4 а and D5:
      `actions/create-github-app-token` pinned by full commit with its tag in
      a comment, the `checkout` and `setup-bun` pins and `bun-version` of
      `test.yml`, the comment saying nothing updates those pins, and the
      title and body D5 gives. Verify with `bun test bun/bun-version.test.ts`,
      1.3's case, `actionlint` through `.githooks/gates.sh`, and by reading
      the file back against D5; its first real run is 2.2
- [ ] 1.5 Rewrite README's *Move the pin by hand* line (*Working on the
      harness*) to name the workflow, the `bump/self-pin` pull request the
      user merges, and the hand move as the fallback while the workflow is
      off. Verify by reading the paragraph back

## 2. Turn it on

- [ ] 2.1 **User act.** Create the environment `self-bump` with deployment
      branches limited to `main`; generate a second private key of the board
      loop's App and store it there as the secret `HARNESS_APP_KEY`, and the
      App's id as the variable `HARNESS_APP_ID` (the names 1.4 reads)
- [ ] 2.2 **User act.** Run `gh workflow run self-bump.yml --repo
      laidrivm/harness` once. When it writes a `sha`, confirm a
      `bump/self-pin` pull request opens as the App with the eight required
      checks and CodeRabbit on it; when `main` moves before the merge,
      confirm the next run updates that pull request rather than opening a
      second. Merge it, confirm the next `Test` run on `main` ends the
      workflow quietly (D2), and that the first later run writing a `sha`
      opens a new pull request rather than editing the merged one. When it
      writes none, confirm the run ends green with no branch pushed and no
      pull request. This is the evidence for the three workflow scenarios no
      unit test reaches
