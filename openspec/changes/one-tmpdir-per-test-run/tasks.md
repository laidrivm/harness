# one-tmpdir-per-test-run — tasks

One pull request. The failing cases come first, their failure seen before the
module exists, each cited as `// spec: test-temp-dir/<slug>`. Every case runs
a nested `bun test` against a `TMPDIR` of its own (design, decision 5), with
an explicit timeout.

## 1. The parent and its sweep

- [x] 1.1 Failing cases in `bun/test-tmpdir.test.ts`, a fixture writing a
      project whose `bunfig.toml` preloads `bun/test-tmpdir.ts` by absolute
      path: a test's `tmpdir()` is a `harness-test-*` directory directly under
      the case's `TMPDIR`
      (`a-fixture-s-temporary-directory-lands-in-the-parent`); a run of two
      test files, each making a directory, passes
      (`test-files-of-one-run-share-the-parent`); after a passing
      run and after a failing one, the parent the run made, as its test
      wrote it down, is gone (`a-run-that-ends-leaves-nothing`,
      `a-run-whose-tests-fail-leaves-nothing`); a passing run whose test
      leaves a non-empty subdirectory without write permission exits 0
      (`a-parent-that-cannot-be-removed-at-the-end`); a run killed with
      `SIGKILL` once its test has made a directory, and a run whose test
      calls `process.exit(0)` after making one, each leave the parent the
      run made, as its test wrote it down (`a-run-killed-mid-test`,
      `a-run-stopped-by-a-test-s-process-exit`)
- [x] 1.2 Failing cases for the sweep, each entry backdated with `utimesSync`:
      a `harness-test-*` directory two hours old is gone, and no
      `harness-swept-*` entry is left (`a-later-run-removes-an-abandoned-parent`);
      a `harness-swept-*` directory two hours old is gone
      (`a-later-run-removes-an-abandoned-claim`); four runs started together
      against one two-hour-old parent all exit 0, it is gone and no
      `harness-swept-*` entry is left
      (`runs-starting-together-sweep-one-parent-once`); a `harness-test-*`
      directory a minute old is still there
      (`a-later-run-keeps-a-parent-in-use`); a directory of another name and
      a regular file named `harness-test-x`, both two hours old, are still
      there (`other-entries-are-left-alone`); a two-hour-old parent holding a
      non-empty subdirectory without write permission leaves the run
      exiting 0 (`an-abandoned-parent-that-cannot-be-removed`). The two
      permission cases restore the permission in their cleanup and skip
      themselves under uid 0, which ignores permission bits, naming why
- [x] 1.3 A failing case running the harness's own `bunfig.toml` on
      `bun/tracked.test.ts` with `GIT_DIR` set and the case's `TMPDIR`: the
      run is refused and the case's `TMPDIR` lists no `harness-test-*` entry
      (`a-refused-run-makes-no-parent`)
- [x] 1.4 Then `bun/test-tmpdir.ts`: the sweep of `harness-test-*` and
      `harness-swept-*` entries under the starting `tmpdir()` that `lstat`
      reads as directories unmodified for an hour, each claimed by setting
      its modification time to now and renaming it to a new
      `harness-swept-*` name, then removed, the read, the touch, the rename
      and the removal in one `try` per entry; `mkdtempSync` of the parent;
      `process.env.TMPDIR` set to it; a global `afterAll` removing it inside
      a `try`. Its header names
      decisions 1, 3 and 4 of the design. Add it to `bunfig.toml`'s
      `[test] preload` after `./bun/git-env-guard.ts`. Verify
      `bun test bun/test-tmpdir bun/git-env` passes

## 2. The suite and Stryker

- [ ] 2.1 Run `bun test` with `TMPDIR` set to a new empty directory: no
      `harness-test-*` entry is left in it; every other entry left, from a
      process a test started outside the parent (design, *Non-Goals*), is
      named by prefix and count in the pull request
- [ ] 2.2 Re-run the mutation baseline, `bun bun/mutation-run.ts --all
      --force`, with `TMPDIR` set to a new empty directory, commit what it
      writes, run `bun bun/mutation-run.ts` again, which must mutate nothing,
      then `bun bun/mutation-floor.ts`, setting `harness.mutationFloor` to
      the count it names if that moved (the README's mutation step, since
      #446 a push gate): the `harness-test-*` entries
      left number no more than the mutants whose status is not `Survived`,
      plus one for a killed dry run — a surviving mutant's run normally ends
      with its hooks, and an excess is traced to the mutant whose test
      exited early and named in the pull request — and every entry of another
      prefix is named as in 2.1. A status that moved is re-run for its module
      alone (design, *Risks*) and named in the commit and the pull request
