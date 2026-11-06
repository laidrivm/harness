# one-tmpdir-per-test-run — tasks

One pull request. The failing cases come first, their failure seen before the
module exists, each cited as `// spec: test-temp-dir/<slug>`. Every case runs
a nested `bun test` against a `TMPDIR` of its own (design, decision 5), with
an explicit timeout.

## 1. The parent and its sweep

- [ ] 1.1 Failing cases in `bun/test-tmpdir.test.ts`, a fixture writing a
      project whose `bunfig.toml` preloads `bun/test-tmpdir.ts` by absolute
      path: a test's `tmpdir()` is a `harness-test-*` directory directly under
      the case's `TMPDIR`
      (`a-fixture-s-temporary-directory-lands-in-the-parent`); a run of two
      test files, each making a directory, passes
      (`test-files-of-one-run-share-the-parent`); after a passing
      run and after a failing one, the case's `TMPDIR` lists what it listed
      before (`a-run-that-ends-leaves-nothing`,
      `a-run-whose-tests-fail-leaves-nothing`); a passing run whose test
      leaves a non-empty subdirectory without write permission exits 0
      (`a-parent-that-cannot-be-removed-at-the-end`); a run killed with
      `SIGKILL` once its test has made a directory, and a run whose test
      calls `process.exit(0)` after making one, each leave exactly one new
      entry, a `harness-test-*` directory (`a-run-killed-mid-test`,
      `a-run-stopped-by-a-test-s-process-exit`)
- [ ] 1.2 Failing cases for the sweep, each entry backdated with `utimesSync`:
      a `harness-test-*` directory two hours old is gone, and no
      `harness-swept-*` entry is left (`a-later-run-removes-an-abandoned-parent`);
      one a minute old, and a directory of another name two hours old, are
      still there (`a-later-run-keeps-a-parent-in-use`,
      `other-entries-are-left-alone`); a two-hour-old parent holding a
      non-empty subdirectory without write permission leaves the run
      exiting 0 (`an-abandoned-parent-that-cannot-be-removed`). The two
      permission cases restore the permission in their cleanup and skip
      themselves under uid 0, which ignores permission bits, naming why
- [ ] 1.3 A failing case running the harness's own `bunfig.toml` on
      `bun/tracked.test.ts` with `GIT_DIR` set and the case's `TMPDIR`: the
      run is refused and the case's `TMPDIR` lists nothing
      (`a-refused-run-makes-no-parent`)
- [ ] 1.4 Then `bun/test-tmpdir.ts`: the sweep of `harness-test-*` entries
      under the starting `tmpdir()` unmodified for an hour, each claimed by a
      rename to `harness-swept-*` and then removed, both in one `try` per
      entry; `mkdtempSync` of the parent; `process.env.TMPDIR` set to it; a
      global `afterAll` removing it inside a `try`. Its header names
      decisions 1, 3 and 4 of the design. Add it to `bunfig.toml`'s
      `[test] preload` after `./bun/git-env-guard.ts`. Verify
      `bun test bun/test-tmpdir bun/git-env` passes

## 2. The suite and Stryker

- [ ] 2.1 Run `bun test` with `TMPDIR` set to a new empty directory: no
      `harness-test-*` entry is left in it; every other entry left, from a
      process a test started outside the parent (design, *Non-Goals*), is
      named by prefix and count in the pull request
- [ ] 2.2 Re-run the mutation baseline, `bun bun/mutation-run.ts --all`, with
      `TMPDIR` set to a new empty directory: the `harness-test-*` entries
      left number no more than the mutants run, and every entry of another
      prefix is named as in 2.1. Commit the stored files; a status that moved
      is named in the commit and the pull request
