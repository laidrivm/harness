## 1. `bump.ts self` moves the development pin

- [ ] 1.1 Write the failing cases: in `bun/bump-pin.test.ts`, a manifest with
      the harness under `devDependencies` alone reads and moves there; one
      with the same pin under both moves both; one whose two fields differ
      reads and moves `dependencies` alone; the old spec once more outside
      the two fields still throws (design D3); in a new
      `bun/bump-self.test.ts`, over a scratch git repository and the fake API
      `bun/bump-verify.test.ts` uses: head not green → `sha` empty, tree
      unchanged; head is the pin → same; head differs from the pin only in
      `bun.lock` and in `package.json`'s `devDependencies.harness` → same
      (D2); the same with both harness fields moved → same; head differs
      from the pin only in `package.json`, in a field
      other than the pin (a script) → one new bump commit, as below; a
      manifest whose two harness fields differ → non-zero exit, tree
      unchanged (D3); head differs elsewhere → one
      new commit by `github-actions[bot]` changing only those two files, the
      pin at the head, and `sha`, `old`, `behind` written to `GITHUB_OUTPUT`
      with `behind` the commit count. Cite each `harness-updates` scenario in a
      `// spec:` comment. Record that they fail
- [ ] 1.2 Implement D1, D2 and D3 in `bun/bump.ts` and `bun/bump-pin.ts`: the
      fallback in `pinOf`, `movePin`'s count per field holding the old spec,
      the `self` command (refusing two different pins) reusing `greenHead`,
      `movePin`,
      `INSTALL` and the commit identity lifted from `land` into one helper
      both call; usage line and header comment name `self`. `wc -l` both
      files; split by the 300-line cap first if `bump.ts` would pass it.
      Verify with `bun test bun/bump-pin.test.ts bun/bump-self.test.ts
      bun/bump-land.test.ts bun/bump-verify.test.ts`

## 2. The workflow opens or updates the bump pull request

- [ ] 2.1 Add `.github/workflows/self-bump.yml` per design D4, pinning
      `actions/create-github-app-token` by full commit with its tag in a
      comment, and the same `checkout` and `setup-bun` pins and `bun-version`
      as `test.yml`, with the comment saying nothing updates those pins. The
      pull request body names the old and new short commits and `behind`.
      Verify with `bun test bun/bun-version.test.ts` and by reading the file
      back against D4; its first real run is 4.2
- [ ] 2.2 Rewrite README's "The pin moves by hand: …" sentence (line 15) to
      name the workflow, the `bump/self-pin` pull request the user merges, and
      that a hand move still works the old way when the workflow is off.
      Verify by reading the paragraph back

## 3. A host pass names its pin's lag

- [ ] 3.1 Write the failing cases in a new `orchestrator/pass-lag.test.ts`
      (`pass-pin.test.ts` is at 294 lines), on `pass-pin.test.ts`'s fixtures:
      a pin 3 commits behind the published harness `main` → the log's first
      line names its short commit and 3; a pin at `main` → no lag line; the
      `main` fetch failing → no lag line, no stop file, the pass runs. Cite
      the `orchestrator` scenarios. Record that they fail (they run where
      `flock` exists — on Linux CI, skipped on macOS)
- [ ] 3.2 Implement design D5 in `orchestrator/pass.sh`; probe the added
      lines under bash (the script's shell). Verify with
      `bun test orchestrator/pass-lag.test.ts orchestrator/pass-pin.test.ts`
      on Linux CI

## 4. Turn it on

- [ ] 4.1 **User act.** In the repository's settings create the environment
      `self-bump` with deployment branches limited to `main`; generate a
      second private key for the board loop's GitHub App and store it there
      as the secret `HARNESS_APP_KEY`, and the App's id as the variable
      `HARNESS_APP_ID` (the names 2.1 reads)
- [ ] 4.2 **User act.** Run `gh workflow run self-bump.yml --repo
      laidrivm/harness` once. When its `self` step writes a `sha` (the pin
      lags a green head that is no merged bump), confirm a `bump/self-pin`
      pull request opens with `Test` and CodeRabbit on it, and merge it, then
      confirm the next `Test` run on `main` ends the workflow quietly (D2),
      and that the first later run that writes a `sha` opens a new
      `bump/self-pin` pull request rather than editing the merged one (D4).
      When it writes none (the head is not green, is the pin, or is a merged
      bump), confirm the run ends green with no branch pushed and no pull
      request
