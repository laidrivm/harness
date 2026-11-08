# self-pin-in-ci — tasks

## 1. `bump.ts self` and the workflow that proposes its commit

- [x] 1.1 Write the failing cases in a new `bun/bump-self.test.ts`, starting
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
      run; `main` in the API moved past the checkout's green `HEAD` → the
      bump targets `HEAD`, and the API's `commits/main` is never read (D1).
      Cite each `harness-updates` scenario of the self bump in a `// spec:`
      comment. Record that they fail
- [x] 1.2 Implement D1–D3 in `bun/bump.ts`, restoring `bumpSelf`,
      `mergedBump` and `commitBump` from `64d84b6^`, with `harnessFields`
      exported again from `bun/bump-pin.ts`, `greenHead` taking the commit
      to ask about (`verify` still passes `main`'s), and the install as
      `--lockfile-only` once a scratch run shows its `bun.lock` equals a full
      install's (else the full install, saying so in D1); `land` calls
      `commitBump`; the
      usage line and header comment name `self`; `bump.fixture.ts`'s header
      names the third test file. Verify with `bun test bun/bump-pin.test.ts
      bun/bump-self.test.ts bun/bump-land.test.ts bun/bump-verify.test.ts`
      and `wc -l bun/bump.ts` under the file-size cap. `bun/bump-pin.ts` is
      in `stryker.config.json`'s `mutate`, so before the push run
      `bun bun/mutation-run.ts`, commit what it writes, run it again and then
      `bun bun/mutation-floor.ts`, and commit the floor it names (README,
      *Working on the harness*)
- [x] 1.3 Write a failing case that reads `.github/workflows/self-bump.yml`
      and `test.yml` as parsed YAML: the `workflow_run` trigger names
      `test.yml`'s `name`, `completed` and `main` alone, and the job's `if`
      requires `success` and `push`, or a dispatch from `refs/heads/main` —
      a renamed `Test` would otherwise stop every bump without a sound — and
      no job of the workflow is named `test` (D5). Record that it fails
- [x] 1.4 Add `.github/workflows/self-bump.yml` per design D4 and D5,
      reading `vars.HARNESS_APP_ID` and `secrets.HARNESS_APP_KEY` in the job
      that names `environment: self-bump`, the token asked with contents,
      pull-requests and workflows write: `actions/create-github-app-token`
      pinned by full commit with its tag in a comment, the `checkout` and
      `setup-bun` pins and `bun-version` of `test.yml`, a comment beside the
      three pins saying nothing updates them but a hand edit, and the title
      and body D5 gives. Verify with `bun test bun/bun-version.test.ts`, 1.3's
      case, `actionlint` through `.githooks/gates.sh`, and by reading the
      file back against D5; its first real run is 2.2
- [x] 1.5 Rewrite README's *Move the pin by hand* line (*Working on the
      harness*) to name the workflow, the `bump/self-pin` pull request the
      user merges, and the hand move as the fallback while the workflow is
      off. Verify by reading the paragraph back

## 2. Turn it on

- [x] 2.1 **User act, once, by hand, in a terminal of your own** — the
      names 1.4 reads (design D4). No key ever goes into the tree, a card or
      a chat.
      1. The environment `self-bump`, deployment branches limited to `main`
         (or *Settings → Environments → New environment*, then *Deployment
         branches and tags → Selected branches and tags → Add rule* `main`):

         ```
         gh api -X PUT repos/laidrivm/harness/environments/self-bump -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
         gh api -X POST repos/laidrivm/harness/environments/self-bump/deployment-branch-policies -f name=main -f type=branch
         ```

      2. The key: at https://github.com/settings/apps/laidrivm-harness-agent,
         *Private keys → Generate a private key*; save the downloaded file as
         `~/Downloads/self-bump.pem`, then store it and delete the file:

         ```
         gh secret set HARNESS_APP_KEY --repo laidrivm/harness --env self-bump < ~/Downloads/self-bump.pem
         rm ~/Downloads/self-bump.pem
         ```

      3. The App's id, shown as *App ID* on the same page; the command
         prompts for it:

         ```
         gh variable set HARNESS_APP_ID --repo laidrivm/harness --env self-bump
         ```

      Verify with `gh api repos/laidrivm/harness/environments/self-bump`
      (one `main` branch policy), `gh secret list --repo laidrivm/harness
      --env self-bump` and `gh variable list --repo laidrivm/harness --env
      self-bump`, each naming its one entry.
      Done 08.11: the environment `self-bump` exists, its deployment-branch
      policy lists one rule, `main` of type branch; the secret
      `HARNESS_APP_KEY` and the variable `HARNESS_APP_ID` exist in it (names
      only were checked)
- [x] 2.2 **User act.** Once group 1 has merged, run `gh workflow run
      self-bump.yml --repo laidrivm/harness` once. When it writes a `sha`,
      confirm a
      `bump/self-pin` pull request opens as the App with the eight required
      checks and CodeRabbit on it; when `main` moves before the merge,
      confirm the next run updates that pull request rather than opening a
      second. Merge it on one approval (else design's *unattributed
      changes* risk applies: move the commit identity to the App's bot
      before the next run), confirm the next `Test` run on `main` ends the
      workflow quietly (D2), and that the first later run writing a `sha`
      opens a new pull request rather than editing the merged one. When it
      writes none, confirm the run ends green with no branch pushed and no
      new pull request — an earlier bump's open one stays as it was. This is
      the evidence for the three workflow scenarios no
      unit test reaches.
      Seen 08.11: the first run came by itself rather than by dispatch —
      run 42441674609, `workflow_run` on f7349295, succeeded and opened #490
      «Move the self-pin to f734929» from `bump/self-pin`, authored by the
      App, its commit by `github-actions[bot]`, with the required checks and
      CodeRabbit on it. CodeRabbit approved it and it merged on that one
      approval, so the *unattributed changes* risk did not fire. The next
      `Test` on `main`, at merge commit 9e1bfb6f, passed, and self bump run
      42472930936 ended green: `bun bun/bump.ts self` wrote no `sha`, the
      push step was skipped and no pull request opened. The log does not say
      which quiet stop fired; it reads as D2's by elimination, since that
      head was green and was not the pin. The `GITHUB_TOKEN` with
      `contents: read` reads check-runs. Not yet seen: a run by
      `gh workflow run` (the dispatch half of the job's `if`), `main` moving
      while a bump pull request is open (*A second bump updates the open
      pull request*), and a later run writing a `sha` after a merged bump
      (*A bump after a merged bump opens a new pull request*)
