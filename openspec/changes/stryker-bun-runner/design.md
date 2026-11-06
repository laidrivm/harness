# Design

## Context

See proposal.md, *Why*, for the measurements and the user's answer.
`bun/mutation-run.ts` writes one Stryker configuration per listed module
under `.stryker-tmp`, from `stryker.config.json`'s shared options plus
`mutate`, `commandRunner.command`, `incrementalFile`, `limits` and
`concurrency`, runs `bunx --no-install stryker run` on it, and trims
Stryker's incremental file into `mutation/<name>.json` with a fingerprint
(decision 4 of the archived `pre-push-commit-gates`). The command each mutant
runs also gives the sandbox a git repository of its own before `bun test
bun/<name>`. Stryker's incremental differ (`@stryker-mutator/core` 10.0.0,
`mutants/incremental-differ.js`) reuses a mutant's result when its source is
unchanged and, under a runner that reports coverage, when its killing test is
unchanged (killed) or it gained no covering test (not killed); it tells a
changed test from an unchanged one by diffing each test file's stored
`source`, and falls back to test names alone when no source is stored.

## Goals / Non-Goals

**Goals:**

- Each mutant runs only the tests that reached it, and a test edit re-runs
  only the mutants whose covering or killing tests changed.
- No module switches runner with fewer kills than the command runner gives
  it on the same source.

**Non-Goals:**

- Which modules a run selects: card *Mutate only changed files*
  (41039875c31b81088ac5d49379578b78). Its selection reads the fingerprint
  this change narrows; neither change moves the other's rule (decision 7).

## Decisions

### 1. `@hughescr/stryker-bun-runner` 1.6.0, pinned exactly

WARM, read on 2026-11-06 from the npm registry and GitHub:

- **Worth it**: 104 s for every listed module against about six minutes; 2 to
  6 times faster per module; `NoCoverage` made visible; test-level reuse.
- **Alive**: 23 releases since 2026-01-16, the latest, 1.6.0, on 2026-10-13
  (24 days old); last push the same day; Apache-2.0. Stryker's own bun runner
  (stryker-js #5424) is still an open request.
- **Right-sized**: 324 KB unpacked, six files; runtime dependencies `ws`,
  `smol-toml`, `tinyglobby` and `@stryker-mutator/api`; a dev dependency
  only, so no consumer installs it.
- **Maintained securely**: one maintainer and three contributors, 8 stars —
  a bus factor of one, so pinned exactly and bumped by hand; no lifecycle
  script in it or its dependencies (`bun pm untrusted`: none). Peer
  `typescript@<7` against our 7.0.2 makes `bun install` warn; the runner
  needs it only to read a `tsconfig`, and `tsconfigFile` names an absent
  file, as it already does for Stryker itself.

Rejected: `stryker-mutator-bun-runner` 0.4.0, one release on 2025-07-07, peer
`@stryker-mutator/core@^9` against our 10; a runner of our own after
richpjames/on-the-beach#345, which would own the inspector, coverage preload
and scoring this package already tests against bun 1.4.2.

### 2. A module its tests reach only through a child process is refactored

`bun/skill-record.ts` is a hook script: its body reads stdin and calls
`process.exit(0)` when imported. The runner imports every mutated module
before the dry run, so the dry run exits with no test summary and its
completeness check fails the run; and past that, its tests reach the module
only through the `bun` process they start, which per-test coverage does not
see, so all 55 kills would be lost. The answer of 2026-11-06 (1 б) settles
it: the body becomes an exported function, the hook's main block under
`import.meta.main` reads stdin, calls it and exits 0. The function takes the
environment as a parameter, passing it to every git it starts, so the tests
call it in their own process with the variables they set today — `GIT_DIR`,
`GIT_WORK_TREE`, `XDG_STATE_HOME`, `CLAUDE_PROJECT_DIR` — without touching
`process.env`, which every test file in that process shares. The cases about
the process itself stay spawned: stdin read, nothing printed, exit 0, and a
`PATH` with no git on it, which only a process started with that `PATH`
reproduces. Its mutants are then counted against the command runner on the
refactored source before the switch, and the bun runner must kill at least
as many (decision 8).

The same holds for any listed module the baseline finds killed only through
a child process; `bun/tracked.ts` and `bun/review-config.ts`, which the
scratch copy could not run, are the candidates. Answer 2 lets the apply
refactor one for that cause without asking; a module losing kills for
another cause stops the apply for a question on the card.

Rejected, by the same answer: keeping such modules on the command runner
through a reasoned map in `package.json` (two runners, two fingerprint
shapes), and dropping them from `mutate` (55 kills gone from the count).

### 3. The sandbox repository comes from `buildCommand`

Stryker runs `buildCommand` once in the sandbox before the dry run, through
`execa` with no shell. `stryker.config.json` sets it to `bun
bun/mutation-sandbox.ts`, a committed script holding what the command's
prelude does today: unless the sandbox already has a `.git` with a `HEAD`,
`git init`, `git add -A` and one commit under `-c` values that keep the
user's identity, signing and hooks out. A preload was rejected: it runs in
every `bun test` process at once and would race.

The prelude's other half, unsetting the variables `git rev-parse
--local-env-vars` names, cannot move with it: an unset in the build step's
process reaches no test, and the runner's `bun test` processes inherit
Stryker's environment. `bun/mutation-run.ts` instead spawns Stryker with
those variables removed from its environment, so the build step, the dry run
and every mutant run start without them, as each mutant's command does
today. The cases in `bun/mutation-run-command.test.ts` that pin the prelude
— an inherited `GIT_DIR` and `GIT_WORK_TREE` under sh, dash and bash, and the
citation of *A mutant that writes to the root git names* — move to that spawn
and to `bun/mutation-sandbox.test.ts`, and the file's other cases stop
importing `command()`.

### 4. The stored file keeps tests and coverage

`trim` keeps, besides today's fields, `testFiles` — each file's `source` and
its tests' `id`, `name` and `location` — and each mutant's `coveredBy` and
`killedBy`, sorted. Without `source` Stryker matches tests by name alone, so
an edited test body would reuse a stale verdict. The machine-dependent fields
stay out. The sources make the stored files larger by about the 136 KB of the
listed modules' tests; `mutation/**` is already outside the diff budget. The
first task probes, on `bun/sync-settings.ts` with its two test files, that two
runs on unchanged code give every test the same id and write the same bytes,
and that Stryker reuses every mutant from the trimmed file, as decision 4 of
`pre-push-commit-gates` probed for the command runner.

Probed on 2026-11-06, scratch configuration, four workers: the first run,
`--force`, ran 41 tests and scored 189 `Killed`, 42 `Survived` and 17
`NoCoverage`; the second, from the first's trimmed file, printed `248 of 248
mutant result(s) are reused.`; the 41 test ids and names were the same in
both. The two trimmed files differed in one thing only: a mutant whose result
is reused gains `"killedBy": []` where a fresh run that did not kill it writes
no `killedBy`. `trim` therefore drops an empty `killedBy`, and the two files
are then byte-identical.

### 5. The fingerprint

The fingerprint drops the test files, which Stryker now diffs itself, and
keeps the fixtures they import, `bunfig.toml` and its preload — none of which
Stryker sees — and the options as text. The command each mutant ran leaves
it; the versions of `@hughescr/stryker-bun-runner` and
`@stryker-mutator/core` join it, read by `load` from the tracked
`package.json`'s exact pins into the `Tree`, so `fingerprint` stays a
function of the `Tree` and a scratch repository without `node_modules` reads
the same: the runner's 1.5 and 1.6 notes changed verdicts, and so can a
Stryker bump, so either re-runs every module. `concurrency` stays out, as
before.

Two checks the fingerprint carried today stay without it. `plan`'s list of
files that must match `HEAD` adds `testsOf(module)` itself, so an uncommitted
test still fails the run. And a module whose current test files are not
exactly the stored file's `testFiles` keys — one added or one deleted — runs
incrementally, as one whose test source differs does: Stryker then reruns
the mutants an added test covers, and those a deleted test killed. Stryker
10's differ reuses a survivor that gained no covering test, and reads a test
as changed only where an edit falls between its start and the next test's: a
static mutant has no covering test to compare, and an edit to setup above the
first test changes no test. So such a run hands Stryker the stored file
without its survivors, and Stryker runs them again as new (CodeRabbit on
#472, rounds 1 and 2).

### 6. The per-module configuration

`testRunner: "bun"`, `appendPlugins: ["@hughescr/stryker-bun-runner"]` and
`coverageAnalysis: "perTest"` sit in `stryker.config.json`;
`bun/mutation-run.ts` adds `bun.testFiles` — `testsOf(module)`, the same
files the command runner's `bun test bun/<name>` matched — and `bun.timeout`,
the runner's wall-clock limit on the dry run's `bun test` process in
milliseconds, as `limits.dryRunTimeoutMinutes` × 60 000 (900 000), in place of
`commandRunner`. Measured that way, the scratch runs killed exactly the
stored kills.

### 7. Where it meets *Mutate only changed files*

That card decides which modules a push runs; this one decides how a module
runs once chosen and what makes its fingerprint stale. The shared seam is
`fingerprint` in `bun/mutation-run.ts`: here it loses the test files and the
command and gains the runner's version; a test edit then selects the module
through the stored test sources rather than the fingerprint. Whichever
change merges second rebases onto the other's `plan`.

### 8. The kill check and the floor

Before `stryker.config.json` switches, while `bun/mutation-run.ts` can still
run the command runner, the apply runs the bun runner over every listed
module from scratch configurations, as explore did, and compares killed
counts with the stored command-runner results module by module. A module
whose count is lower is refactored as decision 2 says, re-measured under the
command runner by a named `bun/mutation-run.ts` run, which rewrites its
stored file, and measured again under the bun runner. Both counts are then
taken on the same source, and the switch waits until no module is lower. The
floor then takes
the count the `--all --force` baseline gives: 454 if nothing moves, since
`NoCoverage` counts with `Survived`, or a new value where a refactor changed
the mutants, with the `why` naming the share now `NoCoverage` and any
refactor.

## Risks / Trade-offs

- [One maintainer] → pinned exactly; reverting is the configuration and one
  baseline.
- [Strict dry run: a test that ends its process early fails the module] → it
  fails loudly naming the module, as a crashed Stryker does today.
- [Mutant runs order test files by cost, not as `bun test` does] → no listed
  module's tests use `mock.module`, the runner's named source of order
  dependence; the kill check is the evidence.
- [Tests run one at a time] → slower dry runs; measured net faster above.
- [A runner bump changes verdicts] → its version is in the fingerprint.
- [A refactored hook stops doing what the platform runs it for] → the
  spawning case keeps its wiring under test.

## Migration Plan

One `bun bun/mutation-run.ts --all --force` rewrites every stored file,
committed with the floor's count and `why`. Rollback: revert the change; the
next run re-runs every module, its fingerprint having changed.
