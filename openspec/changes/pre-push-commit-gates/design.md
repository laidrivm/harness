# pre-push-commit-gates — design

## Context

See proposal.md — Why. The explore of 2026-10-31 measured, on
the laptop and read-only: the YAML check 0.06 s and clean; the suppression
scan fails only for want of `harness.suppressions`; `tsc --noEmit` (TS 7)
0.4 s, 57 errors under `strict` and 198 with d2ass's
`noUncheckedIndexedAccess`; `biome ci` about 5 s, 3 linter errors, 9
warnings, 33 unsorted imports, and 163 of 230 `bun/` files and all 16
`orchestrator/` files unformatted at any width; Stryker about 270 mutants
for a 300-line module, about 16 minutes for `bun/command-parse.ts`. The
gate scripts exist in `bun/` (`check-yaml.ts`, `no-suppressions.ts`,
`mutation-floor.ts`); the tools, their configurations and the CI jobs do
not. `bun/git-env.test.ts` and `bun/pre-pr.test.ts` pin the hook's lines.

## The user's decisions (2026-10-31 20:38, on the card)

1. б — reformat the tree with Biome now, in one pull request of its own
   whose body carries `oversize: <reason>`; the formatter stays on.
2. Stryker covers every module: a baseline run once, module by module
   (mutate `bun/x.ts`, run only `bun/x*.test.ts`); afterwards only
   incremental by diff — a push mutates the changed `bun/` files and runs
   their tests, and the other modules' results come from the stored
   incremental files. First, a short probe of `--incremental` with the
   command runner on one module, showing a second run with no changes is
   near-instant; if it is not, stop and ask on the card.
3. In the hook, only the changed modules. Where the baseline runs was left
   to this design (decision 5 below).
4. б — `tsc` as in d2ass: `strict` plus `noUncheckedIndexedAccess`.
5. а — the missing CI jobs (suppression scan, `gitleaks`, lint, type check)
   are part of this change; making them required in the ruleset is the
   user's step.
6. а (2026-11-01) — no guard against a hand-edited `mutation/<name>.json`:
   no such threat has been seen (clarification 11), the edit shows in the
   pull request's diff, and a human merges.
7. б (2026-11-01) — `lineWidth: 120` in `biome.json`, the one departure
   from d2ass's: the tree is written to about that width, so the reformat
   leaves it near its 38.8 thousand lines and pushes 12 `.ts` files past the
   300-line cap, against 47.8 thousand lines and 38 files at Biome's
   default of 80. The 12 are split first, as task 1.2 says.
8. а (2026-11-02) — a slow mutant's status moving between whole runs changes
   nothing yet: the baseline first measures the spread on a few modules, and
   the timeout setting is decided on it.

## Goals / Non-Goals

**Non-Goals:** changing `bun/mutation-floor.ts` or `bun/check-yaml.ts`,
which consumers run, or `bun/no-suppressions.ts` beyond one exempt path; an
import graph of which modules a changed helper affects (decision 4).

## Decisions

### 1. One gates script, run by the hook and named by `harness.bumpTest`

`.githooks/gates.sh` runs the judged gates, cheapest first: the YAML check,
the suppression scan, `biome ci .`, `tsc --noEmit`, `actionlint` and
`gitleaks` behind `command -v`, `bun test`, then the mutation step and the
floor as two commands. The hook becomes: drop git's variables, the draft
check, `gates.sh`, the soft budget. `harness.bumpTest` becomes
`bash .githooks/gates.sh`, so the runner records `pass` only for a commit
the push accepts (the explore's seam). A second command list in
`package.json` was the alternative: two copies kept in step by hand drift.
Under `.githooks/` because git runs only files named after a hook, so the
script is inert there, and the list sits beside the hook it serves. The
`gitleaks` range reads its base from `bun/diff-base.sh`, which prints
`HARNESS_BASE` when it is set — the one copy of the rule, so the budget reads
it too; `bun/pre-pr.ts` sets it to the base it was given. CI's scan stays
history-wide and reads no base.

### 2. Biome as d2ass has it, reformat first

`biome.json` is d2ass's without its `src/model.ts` override and with a line
width of 120 (the user's decision 7): recommended rules plus
`noImportCycles`, tabs, double quotes, organise imports, the git ignore file
honoured. It excludes every tracked file another tool writes, so
that tool's next write cannot fail `biome ci`: `mutation/**` (Stryker),
`skills-lock.json` (the skills CLI), `.claude/settings.json`
(`bun/sync-settings.ts`), and the vendored `core/skills/playwright-cli/**`;
group 1 lists the rest from `git ls-files` before the reformat. The reformat
is `biome format --write`, then `biome check --write --linter-enabled=false`
for import order alone: plain `biome check --write` also applies the
linter's safe fixes, which rewrite code (`bun/no-suppressions.ts` records
one). The three linter errors are fixed by hand in the hook's group;
warnings do not fail `biome ci`, and no rule is turned off.

The reformat still lengthens some files, so a file it would push past the
300-line cap is split first, on its own branch (task 1.2).

### 3. The type check as strict as d2ass's

`tsconfig.json` is d2ass's without DOM, JSX and Preact; `typescript` 7.0.2
and `@types/bun` 1.4.2, the bun pin. An error is fixed by narrowing, or by a
read that throws naming what is missing, never by a `@ts-` marker; a fix
that changes behaviour (`bun/ci-run-clone.ts:59`) gets its failing test
first. The gate joins the hook once the last fix lands.

### 4. Stryker per module, incremental, results in the tree

`stryker.config.json` holds what every run shares: the command runner,
`thresholds.break: null`, `incremental: true`, `tempDirName: .stryker-tmp`,
`tsconfigFile` naming an absent file, and `ignorePatterns` covering
`/.claude/worktrees`, `/.claude/skills` (symlinks, whose copy fails), the
host's secrets under `orchestrator/` and `mutation` — not
`.claude/settings.json`, which a test reads. No `json` reporter: the merge below writes the floor's report. The
absent `tsconfigFile` is d2ass's answer to Stryker's preprocessor calling an
API TypeScript 7.0.2 lacks. `bun/mutation-run.ts` writes the per-module values
— `mutate: bun/<name>.ts`, the command `bun test bun/<name>` — to a
configuration file under `.stryker-tmp`, no flag taking the command. Stryker's
`incrementalFile` is a copy of `mutation/<name>.json` there, named by the
fingerprint and trimmed into the stored file once the run finishes: an
interrupt saves partial results over that copy, so the next run against the
same tests resumes from it. A forced run starts from no copy, since one seeded
with old results would outlive a failed start. Named modules narrow a run,
which then writes no report. A dirty module fails like a dirty test.

A module runs when its tracked source differs from the copy its stored file
holds (`files[path].source`), incrementally, or whole when it has no stored
file. That is what the branch changed, read without a base, so no rename,
merge or skipped hook leaves a stale file counted. It runs with `--force`
when its tests, the fixtures they import (one level of `import`, so
`bun/command-guard.fixture.ts` reaches `bun/command-parse`), `bunfig.toml`
and its preload hash differently (`HEAD`'s blob ids, the step refusing while
any of them is dirty) from the fingerprint its stored file records: the
command runner reports no tests, so Stryker cannot see a test change (the
probe confirms this, and `--force` goes if it is wrong); a test change that
leaves every result as it was still rewrites the fingerprint. A change to a
non-fixture helper another module imports re-runs only the helper's own
module; `--all --force` by hand refreshes everything. Deriving importers was
the alternative, rejected as machinery for a rare case.

The stored file keeps only what the incremental run reads — the schema
version, each file's `source`, and per mutant its id, mutator, location,
replacement and status —
plus the fingerprint: `projectRoot`, `system`, `performance`, `config` and
any test output a mutant carries (`statusReason`) depend on the machine, so
a re-run anywhere writes the same bytes for the same results and no home
directory lands in the tree; mutants sorted by id, a run writing them as they
finish. The probe confirms Stryker reads it so trimmed.

Stryker's sandbox sits inside the checkout, so a test that finds the
repository through git reads the checkout's files, not the mutated ones: the
probe kills a deliberate mutant to show the sandbox is what is judged, and
`tempDirName` moves outside the checkout if it is not.

The fourteen modules no test file names by prefix (`bun/check-yaml.ts`,
`bun/root.ts` and twelve more today) are not mutated, and the run names
them: the user's decision 2 judges a module by `bun/x*.test.ts` alone.

Before any run the step fails on a stored file whose module is untracked or
has no test file, one with no `files` object, or two naming one source path,
since no run could change those; a module with a test file and no stored file
runs whole. After the runs it fails on a stored file differing from `HEAD`'s,
or untracked, so the one it just wrote fails until committed, then merges every stored file's `files` entries, mutants
whole, into the one `files` map of `reports/mutation/mutation.json`, deleting the old report first as
`mutation-floor` requires, and `bun/mutation-floor.ts` checks the total
against `harness.mutationFloor`. Stored files rather than a cache outside
git, because a clone, a worktree, the host and CI must all read the same
results. They are excluded from the diff budget (`mutation/**` in
`harness.diffBudgetExclude`): the reviewed number is the floor's line.

The stored copy of `bun/no-suppressions.ts` carries its three markers. The
scan exempts that one file by path, beside its own script and test and for
the same reason (`commit-gates` delta) — an approval would pin a count every
edit to the script moves, and exempting all of `mutation/` would hide a
marker in any other module's source.

Stryker needs Node on `PATH` (d2ass's `mutation.yml` records why); the step
fails naming Node when a module changed and none is found.

### 5. Where the baseline runs: by hand, on the laptop

`bun bun/mutation-run.ts --all` by hand on the laptop, committed in pull
requests of a batch of modules each; an interrupted run resumes, a module
with current stored results being near-instant. Not CI on a schedule: the
results must be committed, every workflow here holds `contents: read`, and a
write token for a once-off run of hours is a standing risk for one use. Not
the host: 2 vCPU and 3.5 GiB beside parallel agents.

### 6. CI jobs

`.github/workflows/lint.yml` follows d2ass's: `biome`, `typecheck`,
`yaml-syntax`, `suppressions`, `actionlint` and `gitleaks`, the two
containers pinned by d2ass's digests, which nothing updates.
`.github/workflows/mutation.yml` runs the step and the floor on Bun as
`test.yml` pins it and Node as d2ass does: over current stored results it mutates nothing, and over
stale ones it re-runs and fails. The user adds the check names to the ruleset.

## Risks / Trade-offs

- [The reformat conflicts with every open branch] → it lands alone; a
  branch merging it takes its own side and re-runs the reformat's two
  commands over its files.
- [The baseline takes hours] → resumable per module, run by hand in batches.
- [Tests that read the repository through git behave differently inside
  Stryker's sandbox] → the probe and the baseline show it per module; a
  module whose dry run fails is reported on the card, never skipped
  silently.
- [The host has no Node] → a push and a runner pass there that changed a
  module would both fail naming Node; the probe reads `node -v` on the host,
  and if it is absent, installing it is a card that lands before group 7.
- [The stored results grow the repository by megabytes and churn with each
  module edit, and consumers download them, `package.json` having no
  `files` list] → the size is measured at the baseline and reported on the
  card; a `files` list is a change of its own. Of the new configuration
  files a consumer's install carries, bun reads only `tsconfig.json`, which
  sets nothing it applies at run time.
- [A Stryker incremental file that is not byte-stable across identical runs
  even when trimmed] → the probe checks it; if it is not, the step writes a
  stored file only when its mutants' results changed. Reused results are
  byte-stable; a whole re-run is not, a slow mutant's status depending on the
  load (decision 8).

## Migration Plan

Groups land in tasks.md order. Rollback is one line: dropping `gates.sh`
from the hook and restoring `bumpTest` to `bun test` returns today's push.
