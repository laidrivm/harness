# Tasks

## 1. Probe before building

- [ ] 1.1 Add `@hughescr/stryker-bun-runner` 1.6.0 exactly to `devDependencies` and `bun.lock` with `bun add -D --exact`, then confirm `bun install --frozen-lockfile` passes with only the `typescript` peer warning and `bun pm untrusted` lists nothing — verified by the two commands' output in the PR body
- [ ] 1.2 Probe on `bun/autonomy.ts`, in a scratch configuration under `.stryker-tmp`: two runs over unchanged code, the second reading the first's incremental file trimmed as decision 4 says, reuse every mutant (`N of N mutant result(s) are reused`), and the trimmed files are byte-identical; record the lines in `design.md` decision 4 — verified by that record

## 2. `bun/skill-record.ts` reached in its tests' own process

- [ ] 2.1 Tests first in `bun/skill-record.test.ts`: every case that spawns the hook today calls the exported function in the test's process with the same event and environment, and one case still spawns the hook and checks it reads stdin, prints nothing and exits 0 — verified by the in-process cases failing before 2.2
- [ ] 2.2 Move the hook's body into an exported function and run it from a main block under `import.meta.main` — verified by 2.1 passing and `bun test bun/skill-record` green
- [ ] 2.3 Re-measure the refactored module under today's command runner with `bun bun/mutation-run.ts bun/skill-record.ts`, commit `mutation/skill-record.json`, and set the floor to the count `bun bun/mutation-floor.ts` names, its `why` naming the refactor — verified by the floor passing; this killed count is the one 5.1 compares against

## 3. The sandbox repository

- [ ] 3.1 Tests first in `bun/mutation-sandbox.test.ts`: run in a scratch directory, it makes a repository with one commit holding that directory's files; a second run leaves that one commit; with `GIT_DIR` set it still makes the repository in its own directory — verified by `bun test bun/mutation-sandbox` failing before 3.2
- [ ] 3.2 Write `bun/mutation-sandbox.ts` from the prelude `command()` carries today, and set `buildCommand: "bun bun/mutation-sandbox.ts"` in `stryker.config.json` — verified by 3.1 passing

## 4. The per-test runner, the stored file and the fingerprint

- [ ] 4.1 Tests first in `bun/mutation-run.test.ts`: a module's configuration names `testRunner: "bun"`, `coverageAnalysis: "perTest"`, `bun.testFiles` equal to `testsOf(module)` — both files for `bun/sync-settings.ts`, sorted — and no `commandRunner` — verified by those cases failing before 4.2
- [ ] 4.2 Set `testRunner`, `appendPlugins` and `coverageAnalysis` in `stryker.config.json` and write `bun.testFiles` and `bun.timeout` into each module's configuration in `bun/mutation-run.ts`, removing `command()` — verified by 4.1 passing
- [ ] 4.3 Tests first: `trim` keeps `testFiles` sources and each test's `id`, `name` and `location`, and nothing else of a test; it sorts `coveredBy` and `killedBy`, so two runs that finished mutants in different orders write the same bytes; the fingerprint names no test file and no command, and names the runner's version; a runner version change forces every module — verified by those cases failing before 4.4
- [ ] 4.4 Extend `trim` and `fingerprint` as decisions 4 and 5 say, the version read from `node_modules/@hughescr/stryker-bun-runner/package.json` — verified by 4.3 passing
- [ ] 4.5 Tests first: a module whose test file differs from the stored `source` runs incrementally (`force: false`) and no other module runs; one whose test files match their stored copies runs nothing — verified by those cases failing, then passing once `plan` compares stored test sources

## 5. Kill check, baseline and documentation

- [ ] 5.1 Run `bun bun/mutation-run.ts --all --force` and compare each module's killed count with `HEAD`'s stored command-runner results (2.3's for `bun/skill-record.ts`): every module equal or higher. A module lower because its tests reach it only through a child process — `bun/tracked.ts` and `bun/review-config.ts` are the candidates — is refactored as group 2 did, without asking (answer 2), and re-checked; one lower for any other cause stops the apply for a question on the card through `bun bun/notion-ask.ts` — verified by the per-module table in the PR body
- [ ] 5.2 Commit the rewritten `mutation/*.json` and set `harness.mutationFloor.surviving` to the baseline's count, its `why` naming the share now `NoCoverage` and each refactor — verified by `bun bun/mutation-floor.ts` passing
- [ ] 5.3 Update the comments in `bun/mutation-run.ts`, `bun/mutation-floor.ts` and `.github/workflows/mutation.yml` that name the command runner — verified by `grep -rn "command runner" bun .github` naming none
- [ ] 5.4 Run `bash .githooks/gates.sh` twice: the second run mutates nothing and passes — verified by its output
