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
  with `env: { ...process.env }` the child gets the new one, and so does a
  child of `node:child_process` or `Bun.$` (local review's probe);
- the global `afterAll` does not run after a test's `process.exit` nor under
  `--bail` (local review's probe), nor does a `process.on("exit")` handler
  under `bun test`; a test file that throws while loading still runs it
  (local review's probe), and a `bun test <filter>` that matches no file
  leaves nothing a preload made.

Stryker's command runner runs `bun test bun/<name>` per mutant in a sandbox
copy of the checkout, `bunfig.toml` and `bun/` included, and on timeout kills
it with `tree-kill`'s `SIGKILL` (`@stryker-mutator/core`,
`dist/src/utils/object-utils.js`).

## Goals / Non-Goals

**Goals:**
- A run that ends leaves nothing in `TMPDIR`; a killed one leaves one entry.
- Entries left by killed runs do not accumulate across runs.

**Non-Goals:**
- A process a test starts through `Bun.spawn` without `env`, which keeps the
  starting `TMPDIR` (*Context*), or with an `env` lacking `TMPDIR`, which
  falls back to `/tmp`. Changing each spawn site is a fixture rewrite for
  leftovers nobody has measured; task 2.1 lists what they leave.
- Cleaning up after a run in a signal handler (decision 4).
- A consumer's test suite.

## Decisions

### 1. A preload with a global `afterAll`

One module in `bunfig.toml`'s `[test] preload`, so no fixture changes and a
new fixture is covered without knowing it. `process.on("exit")` was the
alternative; the probe saw no exit handler run under `bun test`, and a global
`afterAll` is bun's own end-of-run hook.

Setting `TMPDIR` only in the command Stryker runs per mutant, to a directory
under `.stryker-tmp`, was the narrower alternative (local review). It misses
most of what the card counted: `command-guard-*`, `diff-budget-*`,
`work-finish-origin-*`, `work-take-home-*` and `mutation-run-*` come from
tests of modules `stryker.config.json` does not list, so Stryker never ran
them, and those runs were ended early outside it. That command is in every
stored file's fingerprint too, so it would re-run the baseline just the same.

### 2. Listed after the git-environment guard

The guard exits the process before any test loads; listed first, it refuses
before a parent exists, so a refused run leaves nothing to remove.

### 3. The sweep removes parents unmodified for an hour

The user's answer 1 а on the card, 2026-11-06. A run's parent changes its
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

The sweep claims an abandoned parent by renaming it to a new
`harness-swept-*` name before removing it, so of several runs starting
together, Stryker's concurrent mutants among them, one removes it and the
rest find it gone and move on. A `harness-swept-*` directory unmodified for
an hour, left by a sweep killed mid-removal, is swept the same way. It reads
each entry with `lstat`, so a link or a regular file of either name is left
alone. The winner pays the removal inside its own run, a mutant's timed run
included, once per abandoned parent.

An entry the sweep cannot read, claim or remove is skipped — the read, the
rename and the removal in one `try`, since another run may claim the entry
between any two of them — and so is a failed removal of the run's own parent
at its end: a leftover is not a reason to refuse or fail a suite.

### 4. No signal handler

Stryker, the source this change is for, kills with `SIGKILL`, which no
handler sees. An interrupt from a terminal, a timeout's `SIGTERM`, a test's
`process.exit` and `--bail` each leave one entry, which decision 3 removes an
hour later.

### 5. The tests run a nested suite against a `TMPDIR` of their own

`bun/test-tmpdir.test.ts` writes a small project into a case directory — a
`bunfig.toml` preloading the module by absolute path and a test file — and
runs `bun test` there with `TMPDIR` set to another case directory, so a case
never reads or writes the real `TMPDIR`, where other runs share the laptop.
This answers the card's second open question. The refused-run case runs the
harness's own `bunfig.toml`, as `bun/git-env.test.ts` does, so the order of
decision 2 is what it checks.

### 6. The mutation baseline is re-run in the same pull request

The user's answer 2 а on the card, 2026-11-06. Every `mutation/*.json`
fingerprints `bunfig.toml` and its preloads, so all nineteen go stale. #443
re-ran the baseline in the pull request that changed the preload, and the
same run is the check that the preload works under Stryker. It runs with
`TMPDIR` set to an empty directory of its own, which Stryker passes to every
mutant (`...process.env` in its command runner), so concurrent runs on the
laptop and their sweeps cannot move the count read after it.

## Risks / Trade-offs

- [A test that runs over an hour without touching its parent, or a run frozen
  for an hour by a sleeping laptop or a debugger, loses its parent to a
  concurrent run's sweep] → no suite comes near the first; the second fails
  that run loudly on `ENOENT`, and a rerun passes.
- [A mutant that wins a sweep pays the removal against its timeout and may
  read as `Timeout`] → task 2.2 runs in an empty `TMPDIR`, where only parents
  of that same run's killed mutants are swept; a status that moves is re-run
  for its module alone before it is attributed to the code.
- [Each run lists the whole `TMPDIR` once] → one `readdir`, against the
  thousands of fixture directories this change keeps out of it.
- [A child started with `{ ...process.env }`, through `node:child_process` or
  through `Bun.$` that outlives the run writes into a removed parent] → none
  is known; it would fail loudly on `ENOENT`.
- [The case for a parent that cannot be removed passes vacuously as root,
  which ignores permission bits] → the case skips itself under uid 0, naming
  why.
