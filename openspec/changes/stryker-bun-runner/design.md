# Design

## Context

See proposal.md, *Why*, for the measurements. `bun/mutation-run.ts` writes one
Stryker configuration per listed module under `.stryker-tmp`, from
`stryker.config.json`'s shared options plus `mutate`, `commandRunner.command`,
`incrementalFile`, `limits` and `concurrency`, runs `bunx --no-install stryker
run` on it, and trims Stryker's incremental file into `mutation/<name>.json`
with a fingerprint (decision 4 of the archived `pre-push-commit-gates`). The
command each mutant runs also gives the sandbox a git repository of its own
before `bun test bun/<name>`. Stryker's incremental differ
(`@stryker-mutator/core` 10.0.0, `mutants/incremental-differ.js`) reuses a
mutant's result when its source is unchanged and, under a runner that reports
coverage, when its killing test is unchanged (killed) or it gained no covering
test (not killed); it tells a changed test from an unchanged one by diffing
each test file's stored `source`, and falls back to test names alone when no
source is stored.

## Goals / Non-Goals

**Goals:**

- Each mutant runs only the tests that reached it, and a test edit re-runs
  only the mutants whose covering or killing tests changed.
- Every kill the stored results hold today survives the switch.

**Non-Goals:**

- Which modules a run selects: card *Mutate only changed files*
  (41039875c31b81088ac5d49379578b78). Its selection reads the fingerprint
  this change narrows; neither change moves the other's rule (decision 7).
- Making `bun/skill-record.ts` testable in its own process.

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

### 2. A module the runner cannot judge stays on the command runner

`bun/skill-record.ts` is a hook script: its body reads stdin and calls
`process.exit(0)` when imported. The runner imports every mutated module
before the dry run, so the dry run exits with no test summary, and its
completeness check fails the run; and even past that, its tests reach the
module only through the `bun` process they start, which per-test coverage
does not see, so all 55 kills would be lost. `package.json`'s
`harness.mutationCommandRunner` maps it to that reason, and
`bun/mutation-run.ts` writes the command runner and `bun test bun/<name>` into
that module's configuration, its test files staying in its fingerprint.
Reasoned per entry, as `harness.suppressions` is, so an entry is never a
silent opt-out.

Alternatives: make the hook export its body and run it under
`import.meta.main`, testing it in-process — a change to another module and
its tests, with kills to re-earn, outside this card; drop it from `mutate` —
loses 55 kills from the floor. The choice is put to the user on the card; the
tasks follow the map until the answer says otherwise.

### 3. The sandbox repository comes from `buildCommand`

Stryker runs `buildCommand` once in the sandbox before the dry run, through
`execa` with no shell. `stryker.config.json` sets it to `bun
bun/mutation-sandbox.ts`, a committed script holding what the command's
prelude does today: unset the variables `git rev-parse --local-env-vars`
names, and, unless the sandbox already has a `.git` with a `HEAD`, `git init`,
`git add -A` and one commit under `-c` values that keep the user's identity,
signing and hooks out. A module the map keeps on the command runner then
runs plain `bun test bun/<name>`, the build step having made the repository
for every module. A preload was rejected: it runs in every `bun test`
process at once and would race.

### 4. The stored file keeps tests and coverage

`trim` keeps, besides today's fields, `testFiles` — each file's `source` and
its tests' `id`, `name` and `location` — and each mutant's `coveredBy` and
`killedBy`, sorted. Without `source` Stryker matches tests by name alone, so
an edited test body would reuse a stale verdict. The machine-dependent fields
stay out. The sources make the stored files larger by about the 136 KB of the
listed modules' tests; `mutation/**` is already outside the diff budget. The
first task probes that two runs on unchanged code write the same bytes and
that Stryker reuses every mutant from the trimmed file, as decision 4 of
`pre-push-commit-gates` probed for the command runner.

### 5. The fingerprint

For a per-test module the fingerprint drops the test files, which Stryker now
diffs itself, and keeps the fixtures they import, `bunfig.toml` and its
preload — none of which Stryker sees — and the options as text. The runner's
name and installed version (read from
`node_modules/@hughescr/stryker-bun-runner/package.json`, the file Stryker
loads) join the options: its 1.5 and 1.6 notes changed verdicts, and a bump
must re-run every module. `concurrency` stays out, as before.

### 6. The per-module configuration

`testRunner: "bun"`, `appendPlugins: ["@hughescr/stryker-bun-runner"]` and
`coverageAnalysis: "perTest"` sit in `stryker.config.json`;
`bun/mutation-run.ts` adds `bun.testFiles` — `testsOf(module)`, the same
files the command runner's `bun test bun/<name>` matched — and `bun.timeout`
from `limits.dryRunTimeoutMinutes`. Measured that way, the scratch runs above
killed exactly the stored kills.

### 7. Where it meets *Mutate only changed files*

That card decides which modules a push runs; this one decides how a module
runs once chosen and what makes its fingerprint stale. The shared seam is
`fingerprint` in `bun/mutation-run.ts`: here it loses test files for
per-test modules and gains the runner's version; a test edit then selects the
module through the stored test sources rather than the fingerprint. Whichever
change merges second rebases onto the other's `plan`.

### 8. The floor

Stays 454: every kill held, and `NoCoverage` counts with `Survived`. The `why`
gains that 205 of them now read `NoCoverage`, a number the `--all --force`
baseline confirms; `bun/tracked.ts` and `bun/review-config.ts`, which the
scratch copy could not run, are measured there, and any kill they lose stops
the change for the user rather than joining the map unasked.

## Risks / Trade-offs

- [One maintainer] → pinned exactly; the command runner stays in the tree
  for the map, so reverting is one configuration line and a baseline.
- [Strict dry run: a test that ends its process early fails the module] → it
  fails loudly naming the module, as a crashed Stryker does today.
- [Mutant runs order test files by cost, not as `bun test` does] → no listed
  module's tests use `mock.module`, the runner's named source of order
  dependence; the baseline matching today's kills is the check.
- [Tests run one at a time] → slower dry runs; measured net faster above.
- [A runner bump changes verdicts] → its version is in the fingerprint.

## Migration Plan

One `bun bun/mutation-run.ts --all --force` rewrites every stored file,
committed with the floor's `why`. Rollback: revert the change; the next run
re-runs every module, its fingerprint having changed.
