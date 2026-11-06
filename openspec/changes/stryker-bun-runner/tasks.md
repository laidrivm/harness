# Tasks

## 1. Probe before building

- [ ] 1.1 Wait for the card's answer on `bun/skill-record.ts` (design, decision 2); if it is not the exception map, revise this change with `/opsx:update` before going on — verified by the card's comment
- [ ] 1.2 Add `@hughescr/stryker-bun-runner` 1.6.0 exactly to `devDependencies` and `bun.lock` with `bun add -D --exact`, then confirm `bun install --frozen-lockfile` passes with only the `typescript` peer warning and `bun pm untrusted` lists nothing — verified by the two commands' output in the PR body
- [ ] 1.3 Probe on `bun/autonomy.ts`, in a scratch configuration under `.stryker-tmp`: two runs over unchanged code, the second reading the first's incremental file trimmed as decision 4 says, reuse every mutant (`N of N mutant result(s) are reused`), and the trimmed files are byte-identical; record the lines in `design.md` decision 4 — verified by that record

## 2. The sandbox repository

- [ ] 2.1 Tests first in `bun/mutation-sandbox.test.ts` (ZOMBIES 14, 16): run in a scratch directory, it makes a repository with one commit holding that directory's files; a second run leaves that one commit; with `GIT_DIR` set it still makes the repository in its own directory — verified by `bun test bun/mutation-sandbox` failing before 2.2
- [ ] 2.2 Write `bun/mutation-sandbox.ts` from the prelude `command()` carries today, and set `buildCommand: "bun bun/mutation-sandbox.ts"` in `stryker.config.json` — verified by 2.1 passing

## 3. The per-test runner and its exceptions

- [ ] 3.1 Tests first in `bun/mutation-run.test.ts` (ZOMBIES 1–4, 7, 12): an absent or empty `harness.mutationCommandRunner` puts every module on the bun runner; a per-test module's configuration names `testRunner: "bun"`, `coverageAnalysis: "perTest"` and `bun.testFiles` equal to `testsOf(module)`; a mapped module gets the command runner and `bun test bun/<name>`; an entry off the list, and one with a blank or whitespace reason, fail the run before anything is mutated, naming it — verified by those cases failing before 3.2
- [ ] 3.2 Set `testRunner`, `appendPlugins` and `coverageAnalysis` in `stryker.config.json`, read the map in `bun/mutation-checkout.ts`'s `load`, and write each module's configuration from it in `bun/mutation-run.ts`; drop the prelude from `command()` — verified by 3.1 passing
- [ ] 3.3 Add `"harness": { "mutationCommandRunner": { "bun/skill-record.ts": "<decision 2's reason>" } }` to `package.json` — verified by `bun bun/mutation-run.ts bun/skill-record.ts` running it under the command runner

## 4. What a stored file and its fingerprint hold

- [ ] 4.1 Tests first (ZOMBIES 5, 6, 9–11, 13): `trim` keeps `testFiles` sources and each test's `id`, `name` and `location`, and sorted `coveredBy` and `killedBy`, whatever order mutants finished in; a per-test module's fingerprint names no test file and names the runner's version; a command-runner module's still names its test files; a runner version change forces every module — verified by those cases failing before 4.2
- [ ] 4.2 Extend `trim` and `fingerprint` in `bun/mutation-run.ts` as decisions 4 and 5 say, the version read from `node_modules/@hughescr/stryker-bun-runner/package.json` — verified by 4.1 passing
- [ ] 4.3 Tests first (ZOMBIES 8, 15): a per-test module whose test file differs from the stored `source` runs incrementally, and no other module; one whose test files match runs nothing — verified by those cases failing, then passing once `plan` compares stored test sources

## 5. Baseline and documentation

- [ ] 5.1 Run `bun bun/mutation-run.ts --all --force` and compare every module's statuses with `HEAD`'s stored files mutant by mutant: every `Killed` still `Killed`, and only `Survived` → `NoCoverage` moves; if `bun/tracked.ts`, `bun/review-config.ts` or any other module loses a kill, stop and ask the user on the card before adding it to the map — verified by the comparison in the PR body
- [ ] 5.2 Commit the rewritten `mutation/*.json`, keep `harness.mutationFloor.surviving` at the count the baseline gives (454 expected), and add the `NoCoverage` share to its `why` — verified by `bun bun/mutation-floor.ts` passing
- [ ] 5.3 Update the comments in `bun/mutation-run.ts`, `bun/mutation-floor.ts` and `.github/workflows/mutation.yml` that name the command runner as the only runner — verified by `grep -n "command runner"` naming only the exception map's use
- [ ] 5.4 Run `bash .githooks/gates.sh` twice: the second run mutates nothing and passes — verified by its output
