# one-tmpdir-per-test-run

## Why

On 2026-11-05 the laptop's `$TMPDIR` held about 395 thousand directories left
by the harness's tests: `command-guard-*` 80 thousand, `diff-budget-*` 55,
`work-finish-origin-*` 35, `work-take-home-*` 23, `mutation-run-*` 11. A test
removes its fixtures in `afterAll` or `afterEach`, and a run that is killed
runs neither, so it leaves every directory its fixtures made. The card
suspected Stryker, whose command runner kills a mutant's `bun test` on
timeout with `SIGKILL` (`tree-kill` in `@stryker-mutator/core`'s
`objectUtils.kill`), but all five prefixes belong to tests of modules
`stryker.config.json` does not list, so suite runs ended early outside
Stryker left them too. With that directory full, each bun stub a fixture starts
took 0.8 s instead of 10 ms, one `work-resolve` case ran 5.7 s instead of
90 ms, and all three pre-PR runs of that day failed twice on 5-second
timeouts (card *Keep one temp directory per test run, so an interrupted run
leaves one entry in TMPDIR*, 40f39875c31b81419e4bda065090a934).

## What Changes

- A second test preload, `bun/test-tmpdir.ts`, listed in `bunfig.toml` after
  `bun/git-env-guard.ts`, makes one parent directory per `bun test` run under
  the `TMPDIR` the run started with, points `process.env.TMPDIR` at it, so
  every fixture's `tmpdir()` lands inside, and removes it in a global
  `afterAll`. A killed run leaves that one entry instead of thousands.
- At start, before making its own, the preload removes every parent another
  run left that has not been modified for an hour, so leftovers from killed
  runs, and from runs a test's `process.exit` or `--bail` ended before the
  end-of-run hook, do not accumulate either. A parent a concurrent run is
  still using is kept.
- No fixture changes: every one already builds its paths on `tmpdir()`, which
  bun reads from `process.env.TMPDIR` at each call (probed with bun 1.4.2).
- Under Stryker each mutant's `bun test` runs in a sandbox that copies
  `bunfig.toml` and the preload, so each mutant gets a parent of its own, and
  a mutant killed on timeout leaves one entry for a later mutant's sweep.

Not in this change: a process a test starts through `Bun.spawn` or
`Bun.spawnSync` without `env`, which gets the `TMPDIR` the run started with,
not the edited `process.env`, and one started with an `env` that leaves
`TMPDIR` out, which falls back to `/tmp`; either writes outside the parent as
before; the 395 thousand entries already removed by hand on
2026-11-05; a consumer's own test suite, whose `bunfig.toml` the harness's sync
writes only `[install]` into.

## Capabilities

### New Capabilities

- `test-temp-dir`: where a harness test run's temporary directories live, and
  what a run that ends, or is killed, leaves behind.

### Modified Capabilities

None.

## Impact

- New: `bun/test-tmpdir.ts`, `bun/test-tmpdir.test.ts`. Changed:
  `bunfig.toml` (`[test] preload`), and all nineteen `mutation/*.json`.
- Every stored file under `mutation/` records `bunfig.toml` and each file it
  preloads in its fingerprint (`bun/mutation-run.ts`, `fingerprint`), so all
  of them go stale with this change; the same pull request re-runs the
  baseline and commits them (design, decision 6).
