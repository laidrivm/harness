# Tasks

## 1. Probe before building

- [x] 1.1 Add `@hughescr/stryker-bun-runner` 1.6.0 exactly to `devDependencies` and `bun.lock` with `bun add -D --exact`, then confirm `bun install --frozen-lockfile` passes with only the `typescript` peer warning and `bun pm untrusted` lists nothing — verified by the two commands' output in the PR body
- [x] 1.2 Probe on `bun/sync-settings.ts`, two test files, in a scratch configuration under `.stryker-tmp` with `bun.timeout: 900000`: two runs over unchanged code give every test the same id, the second, reading the first's incremental file trimmed as decision 4 says, reuses every mutant (`N of N mutant result(s) are reused`), and the trimmed files are byte-identical; record the lines in `design.md` decision 4 — verified by that record

## 2. Kill check before the switch, and the refactors it calls for

- [x] 2.1 Run the bun runner over every listed module from scratch configurations under `.stryker-tmp`, as explore did, and tabulate each module's killed count against `HEAD`'s stored command-runner results — verified by the table in the PR body; every module lower because its tests reach it only through a child process joins 2.2's refactor (answer 2), and one lower for another cause stops the apply for a question on the card through `bun bun/notion-ask.ts`
- [x] 2.2 Tests first in `bun/skill-record.test.ts`: the cases that spawn the hook today call the exported function in the test's process, passing `GIT_DIR`, `GIT_WORK_TREE`, `XDG_STATE_HOME` and `CLAUDE_PROJECT_DIR` as its environment parameter and never through `process.env`; the cases on stdin, output, exit code and a `PATH` with no git stay spawned — verified by the in-process cases failing before 2.3
- [x] 2.3 Move the hook's body into an exported function taking the environment it passes to every git, run from a main block under `import.meta.main`, and do the same for each module 2.1 added — verified by 2.2 passing and `bun test bun/skill-record` green
- [x] 2.4 For each refactored module, re-measure under the command runner with `bun bun/mutation-run.ts bun/<name>.ts`, commit `mutation/<name>.json`, then run `bun bun/mutation-run.ts` unnamed and set the floor to the count `bun bun/mutation-floor.ts` names, its `why` naming the refactor — verified by the floor passing; re-run 2.1's scratch measurement on the refactored source, every count equal or higher

## 3. The sandbox repository and its environment

- [x] 3.1 Tests first in `bun/mutation-sandbox.test.ts`: run in a scratch directory, it makes a repository with one commit holding that directory's files, and a second run leaves that one commit; carry over from `bun/mutation-run-command.test.ts` the `// spec: mutation-floor/a-mutant-that-writes-to-the-root-git-names` citation and the inherited `GIT_DIR` and `GIT_WORK_TREE` cases under sh, dash and bash, now asserting that the environment `bun/mutation-run.ts` spawns Stryker with holds none of the variables `git rev-parse --local-env-vars` names — verified by those cases failing before 3.2
- [x] 3.2 Write `bun/mutation-sandbox.ts`, set `buildCommand: "bun bun/mutation-sandbox.ts"` in `stryker.config.json`, and spawn Stryker in `bun/mutation-run.ts` with those variables removed — verified by 3.1 passing

## 4. The per-test runner, the stored file and the fingerprint

- [ ] 4.1 Tests first in `bun/mutation-run.test.ts`: a module's configuration names `testRunner: "bun"`, `coverageAnalysis: "perTest"`, `bun.testFiles` equal to `testsOf(module)` — both files for `bun/sync-settings.ts`, sorted — `bun.timeout` 900000 and no `commandRunner` — verified by those cases failing before 4.2
- [ ] 4.2 Set `testRunner`, `appendPlugins` and `coverageAnalysis` in `stryker.config.json`, write `bun.testFiles` and `bun.timeout` into each module's configuration, remove `command()`, and move `bun/mutation-run-command.test.ts`'s remaining cases off its import — verified by 4.1 passing and `bun test bun/mutation-run` green
- [ ] 4.3 Tests first: `trim` keeps `testFiles` sources and each test's `id`, `name` and `location`, and nothing else of a test; it sorts `coveredBy` and `killedBy`, so two runs that finished mutants in different orders write the same bytes, and drops an empty `killedBy`, which a reused result carries and a fresh one leaves out (decision 4's probe); the fingerprint names no test file and no command, and names the versions of `@hughescr/stryker-bun-runner` and `@stryker-mutator/core` that `load` read from `package.json`; a change to either version forces every module; with `// spec: mutation-floor/what-a-stored-file-holds-of-tests` — verified by those cases failing before 4.4
- [ ] 4.4 Extend `load`, `trim` and `fingerprint` as decisions 4 and 5 say — verified by 4.3 passing
- [ ] 4.5 Tests first: a module whose test file differs from the stored `source` runs incrementally (`force: false`) and no other module runs; one with a test file added or deleted against the stored `testFiles` keys runs incrementally (`// spec: mutation-floor/a-test-file-deleted`); one whose test files match runs nothing; an uncommitted test file still fails the run naming it — verified by those cases failing, then passing once `plan` compares the stored test files and adds `testsOf(module)` to the files that must match `HEAD`

## 5. Baseline, floor and documentation

- [ ] 5.1 Run `bun bun/mutation-run.ts --all --force`, commit the rewritten `mutation/*.json`, and compare each module's killed count with its bun-runner count on the same source: a module group 2 refactored with its post-refactor count from 2.4, never its pre-refactor one, whose tests differ, and every other module with its count from 2.1 — equal, verified by the table in the PR body
- [ ] 5.2 Run `bun bun/mutation-run.ts` unnamed, which writes the report, then set `harness.mutationFloor.surviving` to the count `bun bun/mutation-floor.ts` names, its `why` naming the share now `NoCoverage` and each refactor — verified by the floor passing
- [ ] 5.3 Cite the scenarios *A survivor no test reaches*, *A mutant no test reaches* and *A module its tests reach only through a child process* from cases in `bun/mutation-floor.test.ts` and `bun/mutation-run.test.ts`, the last over a fixture stored file whose mutants read `NoCoverage` — verified by `bun bun/check.ts` passing `harness.uncitedFloor` unchanged
- [ ] 5.4 Update the comments in `bun/mutation-run.ts`, `bun/mutation-floor.ts` and `.github/workflows/mutation.yml` that name the command runner — verified by `grep -rn "command runner" bun .github` naming none
- [ ] 5.5 Run `bash .githooks/gates.sh` twice: the second run mutates nothing and passes — verified by its output
