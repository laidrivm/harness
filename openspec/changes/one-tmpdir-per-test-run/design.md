# Design

## Context

Fixtures make their directories with `mkdtempSync(join(tmpdir(), "<prefix>-"))`
and remove them in `afterAll` or `afterEach`. `bunfig.toml` preloads one
module today, `bun/git-env-guard.ts`, which refuses the suite before any test
file loads while one of git's repository variables is set.

Probed with bun 1.4.2 on 2026-11-06, a preload that sets `process.env.TMPDIR`:

- `tmpdir()` in every test file of the run returns the new value, so bun
  reads the variable at each call;
- an `afterAll` the preload registers runs once, after the run's last test
  file, not once per file;
- `Bun.spawnSync` without `env` hands the child the `TMPDIR` the run started
  with, as `bun/git-env-guard.ts`'s header already says of every variable;
  with `env: { ...process.env }` the child gets the new one.

Stryker's command runner runs `bun test bun/<name>` per mutant in a sandbox
copy of the checkout, `bunfig.toml` and `bun/` included, and on timeout kills
it with `tree-kill`'s `SIGKILL` (`@stryker-mutator/core`,
`dist/src/utils/object-utils.js`).

## Goals / Non-Goals

**Goals:**
- A run that ends leaves nothing in `TMPDIR`; a killed one leaves one entry.
- Entries left by killed runs do not accumulate across runs.

**Non-Goals:**
- A process a test starts without `env`, which keeps the starting `TMPDIR`
  (*Context*). The scripts doing so remove their own directory; changing each
  spawn site is a fixture rewrite for leftovers nobody has measured.
- Cleaning up after a run in a signal handler (decision 4).
- A consumer's test suite.

## Decisions

### 1. A preload with a global `afterAll`

One module in `bunfig.toml`'s `[test] preload`, so no fixture changes and a
new fixture is covered without knowing it. `process.on("exit")` was the
alternative; the probe saw no exit handler run under `bun test`, and a global
`afterAll` is bun's own end-of-run hook.

### 2. Listed after the git-environment guard

The guard exits the process before any test loads; listed first, it refuses
before a parent exists, so a refused run leaves nothing to remove.

### 3. The sweep removes parents unmodified for an hour

Proposed, open as question 1 on the card. A run's parent changes its
modification time whenever a fixture makes or removes a directory directly
under it, so a parent a run is still using stays recent. The longest runs
seen are a pre-PR suite run of 39 minutes on a loaded laptop (2026-11-05) and
Stryker's dry run, capped at 15 minutes (`limits` in `bun/mutation-run.ts`);
an hour is above both. Under Stryker the leftovers then never exceed the
mutants killed in the last hour.

Alternatives: naming the parent by the run's process id and removing those
whose process is gone, which empties the directory at once but reads a run in
another process namespace sharing `/tmp` as gone and removes a parent in use;
and no sweep, leaving one entry per killed run for good.

An entry the sweep cannot remove is skipped: a leftover is not a reason to
refuse a suite.

### 4. No signal handler

Stryker, the source this change is for, kills with `SIGKILL`, which no
handler sees. An interrupt from a terminal or a timeout's `SIGTERM` leaves one
entry, which decision 3 removes an hour later.

### 5. The tests run a nested suite against a `TMPDIR` of their own

`bun/test-tmpdir.test.ts` writes a small project into a case directory — a
`bunfig.toml` preloading the module by absolute path and a test file — and
runs `bun test` there with `TMPDIR` set to another case directory, so a case
never reads or writes the real `TMPDIR`, where other runs share the laptop.
This answers the card's second open question. The refused-run case runs the
harness's own `bunfig.toml`, as `bun/git-env.test.ts` does, so the order of
decision 2 is what it checks.

### 6. The mutation baseline is re-run in the same pull request

Proposed, open as question 2 on the card. Every `mutation/*.json`
fingerprints `bunfig.toml` and its preloads, so all nineteen go stale. #443
re-ran the baseline in the pull request that changed the preload, and the
same run is the check that the preload works under Stryker: the count of
`harness-test-*` entries in the real `TMPDIR` before and after it.

## Risks / Trade-offs

- [A test that runs over an hour without touching its parent loses it to a
  concurrent run's sweep] → no suite comes near it (decision 3).
- [A child started with `{ ...process.env }` that outlives the run writes into
  a removed parent] → none is known; it would fail loudly on `ENOENT`.
