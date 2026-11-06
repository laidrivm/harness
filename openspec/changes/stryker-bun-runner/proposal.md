# stryker-bun-runner

## Why

`stryker.config.json` runs Stryker's command runner, which reports no tests
and no coverage: every mutant of a module runs all of `bun test bun/<name>`, a
mutant no test reaches reads `Survived` rather than `NoCoverage`, and Stryker
cannot see a test change, so `bun/mutation-run.ts` re-runs a module whole when
one of its tests changes. Since #443 a run already mutates only the modules
whose source or fingerprint changed (card *Mutate only changed files*,
41039875c31b81088ac5d49379578b78, covers that selection); what is left to
this card is what a module's run costs once selected: a test edit re-runs the
module whole, and a `bunfig.toml` or Stryker-option edit re-runs all 19 (card
*Run Stryker through a bun runner with per-test coverage instead of the
command runner*, 41039875c31b81d78347f6f843fb864d).

Explore measured `@hughescr/stryker-bun-runner` 1.6.0 against the command
runner on 2026-11-06, bun 1.4.2, Node 24.2.0, Stryker 10.0.0, four workers, on
a scratch copy of `HEAD` at load 7–14 from other agents:

| Module | Command runner | Bun runner | Killed | Survived → NoCoverage |
|---|---|---|---|---|
| `bun/autonomy.ts` (113 mutants) | 6 s | 2 s | 97 = 97 | 0 |
| `bun/config.ts` (87) | 24 s | 4 s | 60 = 60 | 22 |
| `bun/sync-settings.ts` (248) | 116 s | 23 s | 189 = 189 | 17 |

Over every listed module, one after another, the bun runner took 104 s
against the about six minutes the command runner takes. On the 16 modules it
ran, it killed exactly the mutants the stored results under `mutation/` hold
as killed, mutant by mutant, and only moved 205 of their survivors from
`Survived` to `NoCoverage`; the floor counts both. Three did not run:
`bun/tracked.ts` and `bun/review-config.ts` failed their dry run on the
scratch copy, which held no commit for the tests that read the repository's
tracked files, and `bun/skill-record.ts` cannot run under it at all — its
whole body runs when the module is imported and exits, and its tests kill
its 55 mutants only through the `bun` process they start, which per-test
coverage does not see.

The user answered on the card on 2026-11-06: refactor `bun/skill-record.ts`
so its tests reach it in their own process, rather than keep it on the
command runner or drop it (1 б), and refactor `bun/tracked.ts` or
`bun/review-config.ts` the same way without asking if the baseline shows
them losing kills for the same cause, asking only for a different one (2).

## What Changes

- Every listed module's mutants run under `@hughescr/stryker-bun-runner`
  with per-test coverage: each mutant runs only the tests that reached it in
  the module's dry run, and one no test reaches is `NoCoverage` without a run.
  The command runner leaves the configuration.
- `bun/skill-record.ts` keeps its hook behaviour, but its body becomes an
  exported function the hook's main block, under `import.meta.main`, calls;
  its tests call that function in their own process. Any other listed module
  the baseline finds killed only through a child process is refactored the
  same way.
- No module switches with fewer kills: each module's killed count under the
  bun runner matches or beats its command-runner count on the same source.
- A stored file keeps the tests and coverage Stryker's incremental mode reads
  — each test file's source and tests, each mutant's covering and killing
  tests — and its fingerprint leaves the test files out, so a test edit
  re-runs only the mutants whose covering or killing tests changed. Fixtures,
  `bunfig.toml`, its preload, Stryker's options and now the runner's version
  stay in the fingerprint and re-run every module whole.
- The sandbox's own git repository, made today by the command each mutant
  runs, is made once per run by Stryker's `buildCommand` running a committed
  `bun/mutation-sandbox.ts`.
- New dev dependency `@hughescr/stryker-bun-runner` 1.6.0, pinned exactly.

Not in this change: which modules a run selects (card *Mutate only changed
files*); `ignoreStatic`; a second Stryker major.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mutation-floor`: the runner a listed module's mutants are judged by, a
  module's tests reaching it in their own process, what a stored file and its
  fingerprint hold, when a test edit re-runs a module, and `NoCoverage` as an
  expected status.

## Impact

- `stryker.config.json`: `testRunner: "bun"`, `appendPlugins`,
  `coverageAnalysis: "perTest"`, `buildCommand`.
- `bun/mutation-run.ts` and its tests: the per-module configuration, the
  fingerprint, the trimmed stored file; new `bun/mutation-sandbox.ts` with its
  test.
- `bun/skill-record.ts` and its tests, and any module the baseline adds.
- `package.json`: the dev dependency, and the floor's count and `why` the
  baseline gives; `bun.lock`.
- `mutation/*.json`: every stored file rewritten once by an `--all --force`
  baseline, larger by its tests' sources and coverage.
- `.githooks/gates.sh` and `.github/workflows/mutation.yml` run the same two
  commands; CI keeps Node for Stryker.
- `bun install` warns that the runner's peer `typescript@<7` meets
  TypeScript 7.0.2; Stryker reads no `tsconfig` here, `tsconfigFile` naming an
  absent file, so nothing calls the API TypeScript 7 lacks.
