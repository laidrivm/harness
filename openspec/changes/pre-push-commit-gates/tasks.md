# pre-push-commit-gates — tasks

Seven groups, one pull request each unless a task says otherwise, on
`feat/pre-push-commit-gates-<n>`, each but the reformat under the 800-line
budget. Failing cases first, their failure recorded, cited as `// spec:
<capability>/<slug>`; `/warm` wherever the runner names it.

## 1. Biome, and the reformat alone

- [x] 1.1 Add `@biomejs/biome` 2.5.15 to `devDependencies`, `bun.lock` to
      `harness.diffBudgetExclude`, and `biome.json` per design decision 2,
      its exclusions every tracked file another tool writes, listed from
      `git ls-files '*.json' '*.jsonc' '*.js' '*.ts'`; `bun install`; confirm
      `.gitignore` still covers `node_modules`. Verify `bunx --no-install
      biome --version` prints 2.5.15
- [ ] 1.2 In a scratch copy of the tree, run the reformat of 1.3 and list
      the tracked `.ts` files over 300 lines afterwards. If any, stop this
      group: split them on their own branch to the length they will have
      once formatted, open that pull request, and resume after it merges.
      Verify the list is empty against the tree this group branches from.
      Measured 2026-11-01 on `ffa7bdf7`: 38 files over at width 80, 12 at
      120; question 7 on the card holds the group
- [ ] 1.3 `bunx --no-install biome format --write .`, then `bunx
      --no-install biome check --write --linter-enabled=false .` for import
      order alone, no hand edit in the same pull request; `bun test` passes;
      the body
      carries `oversize: mechanical Biome reformat of the whole tree, no
      hand edits`. Verify `biome format .` reports nothing and the diff
      budget's gate line reports the override

## 2. The type check: dependencies, configuration, source fixes

- [ ] 2.1 Add `typescript` 7.0.2 and `@types/bun` 1.4.2 to
      `devDependencies` and `tsconfig.json` per design decision 3, and
      correct `test.yml`'s comment that the harness's pin is the one dev
      dependency. Verify `bunx --no-install tsc --noEmit` runs and record
      its error count here
- [ ] 2.2 Fix the errors in `bun/` sources other than tests and fixtures,
      a failing test first for each fix that changes behaviour (the first:
      `bun/ci-run-clone.ts:59`). Verify `tsc --noEmit` reports no error in
      those files and `bun test` passes; if the diff nears 800 lines, close
      the group at the last whole file and carry the rest into group 3

## 3. The type check: tests, fixtures and `orchestrator/`

- [ ] 3.1 Fix the remaining errors in `bun/` tests and fixtures and in
      `orchestrator/`, splitting into as many pull requests as the budget
      needs, each closing at a whole file. Verify `bunx --no-install tsc
      --noEmit` exits 0 on the last and `bun test` passes

## 4. The gates script, the hook and the CI jobs

- [ ] 4.1 Fix Biome's three linter errors by hand, a failing test first
      where the fix changes behaviour. Verify `bunx --no-install biome ci .`
      exits 0
- [ ] 4.2 Add `"suppressions": {}` under `harness` in `package.json`.
      Verify `bun bun/no-suppressions.ts` exits 0
- [ ] 4.3 Failing cases in `bun/pre-pr.test.ts`: the hook runs the draft
      check after dropping git's variables and before `.githooks/gates.sh`;
      `harness.bumpTest` is the command the hook runs for its gates
      (`a-gate-the-runner-s-checks-run-too`). Failing cases in
      `bun/git-env.test.ts`, extending its stub `PATH` to every program
      `gates.sh` starts: no command the hook or `gates.sh` starts carries
      git's variables; with `actionlint` and `gitleaks` absent the hook
      exits 0 (`a-tool-the-machine-does-not-have`); a stub `gitleaks` exiting
      1 fails the hook (`a-tool-the-machine-has-reporting-a-finding`) and is
      given `--log-opts=<base>..HEAD` with the base `bun/diff-base.sh`
      prints (`a-secret-that-is-already-in-the-base-branch`), which is
      `HARNESS_BASE` when it is set; and
      `bun/pre-pr.ts` given `origin/main` runs `harness.bumpTest` with
      `HARNESS_BASE=origin/main`
- [ ] 4.4 Write `.githooks/gates.sh` per design decision 1, without the
      mutation step; the hook calls it after the draft check and keeps
      `bash bun/diff-budget.sh || true` last; set `harness.bumpTest` to
      `bash .githooks/gates.sh`. Verify 4.3's cases pass and `bun
      bun/pre-pr.ts origin/main` records `pass` for the project checks
- [ ] 4.5 Add `.github/workflows/lint.yml` per design decision 6, the two
      container digests copied from d2ass's `lint.yml` with the comment that
      nothing updates them. Verify `bun bun/check-yaml.ts` exits 0 and every
      job passes on the pull request
- [ ] 4.6 `README.md`, *Working on the harness*: a push runs the gates
      `commit-gates` lists, through `.githooks/gates.sh`, and needs `bun
      install` first. Verify the line links the spec. In the pull request
      body, list for the user the check names to make required in the
      ruleset

## 5. The Stryker probe and the mutation step

- [ ] 5.1 Add `@stryker-mutator/core` 10.0.0 to `devDependencies`, add
      `reports` and `.stryker-tmp` to `.gitignore` before any run, `mutation/**`
      to `harness.diffBudgetExclude`, and write `stryker.config.json` per
      design decision 4. Verify `git status` shows
      no file under either after a run
- [ ] 5.2 Probe on `bun/command-parse.ts`: run it with `--incremental` and
      its incremental file, then again with no change. Record on the card
      both run times, whether the file is byte-identical after the second,
      which fields depend on the machine, whether Stryker reads the file with
      those fields removed and a fingerprint key added, whether a changed
      test file alone is re-run without `--force`, whether a deliberate
      mutant is judged against the sandbox's files rather than the
      checkout's, how the per-module values are passed, and whether `node
      -v` answers on the host (a card if not). If the second run is not
      near-instant, stop here, ask on the
      card, and leave the pull request draft
- [ ] 5.3 Failing cases in `bun/mutation-run.test.ts` over the pure parts:
      modules exclude tests and fixtures; a module no test file matches is
      named and not run (`a-module-no-test-file-matches`); a source that
      differs from its stored copy runs incrementally
      (`the-module-s-source-changed`); a changed `bun/pre-pr-steps.test.ts`
      forces `bun/pre-pr.ts` and `bun/pre-pr-steps.ts` and nothing else
      (`a-test-file-changed`), and a deleted or renamed test forces the same
      way; a changed `bun/command-guard.fixture.ts` forces the modules whose
      tests import it (`a-fixture-another-module-s-tests-import`); a test
      state the fingerprint records runs incrementally; a new module runs
      whole and fails until committed (`a-new-module-has-no-stored-file`); a
      module with a test file and no stored file fails naming it
      (`a-module-with-tests-and-no-stored-file`); current stored results, or
      a change to `bun/diff-budget.sh` alone, run nothing; a Stryker exit that
      is not 0 fails before the merge; a module to run with no `node` on
      `PATH` fails naming Node;
      a stored file of an untracked module fails naming it
      (`a-stored-file-outliving-its-module`), and so does one whose module
      has no test file left (`a-stored-file-whose-module-lost-its-last-test`);
      a stored file keeps only the fields design decision 4 names
      (`the-same-results-written-in-another-checkout`); a
      stored file differing from `HEAD`'s, or untracked, fails naming it
      (`a-push-whose-run-rewrote-a-stored-file`); a dirty test, fixture or
      `bunfig.toml` fails; a committed change to `bunfig.toml` forces every
      module; a stored file without `files`, and two naming one path, fail;
      the merge, read by `bun/mutation-floor.ts`, sums every
      stored file's survivors
      (`unchanged-modules-counted-from-their-stored-results`). Then write
      `bun/mutation-run.ts` with `--all`. Verify the
      cases pass and a run on `bun/command-parse.ts` writes
      `mutation/command-parse.json`

## 6. The baseline

- [ ] 6.1 Failing cases in `bun/no-suppressions.test.ts`: a tracked
      `mutation/no-suppressions.json` carrying the three markers passes with
      an empty allowlist, and another file under `mutation/` carrying one
      fails (`the-stored-mutation-results-of-the-check-s-own-script`); then
      exempt that path beside `self()`. Verify `bun bun/no-suppressions.ts`
      exits 0 with the stored file present
- [ ] 6.2 On the laptop, `bun bun/mutation-run.ts --all`, committing each
      module's stored file as it finishes; open one pull request per batch,
      each listing its modules, every module whose dry run failed and why,
      and the stored files' total size. Verify the last batch leaves every
      module with tests holding a stored file (`a-run-asked-for-every-module`)
      and a second `--all` rewrites none (`a-run-that-found-nothing-to-rewrite`)

## 7. The mutation step in the hook and in CI

- [ ] 7.1 Set `harness.mutationFloor` to the baseline's survivor total and
      its reason. Verify `bun bun/mutation-run.ts && bun
      bun/mutation-floor.ts` exits 0
- [ ] 7.2 Failing case in `bun/git-env.test.ts`: a push whose diff touches
      nothing under `bun/` starts no Stryker and still runs the floor
      (`a-push-that-changed-no-module`). Then add the step and the floor to
      `.githooks/gates.sh`. Verify the case passes and a push of this group
      mutates nothing
- [ ] 7.3 Add `.github/workflows/mutation.yml` per design decision 6.
      Verify the job passes on the pull request without mutating, and add its
      check name to the list for the ruleset
- [ ] 7.4 `README.md`: `mutation/`, `.githooks/gates.sh`, `biome.json`,
      `tsconfig.json` and `stryker.config.json` in the map of where files
      live, and how to refresh `mutation/` by hand (`--all --force`). No
      test reads the map, so verify by reading it back against `git ls-files`
