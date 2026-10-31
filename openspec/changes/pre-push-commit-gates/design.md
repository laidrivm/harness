# pre-push-commit-gates — design

## Context

See proposal.md — Why. The explore of 2026-10-31 (on the card) measured, on
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
   to this design (decision 6 below).
4. б — `tsc` as in d2ass: `strict` plus `noUncheckedIndexedAccess`.
5. а — the missing CI jobs (suppression scan, `gitleaks`, lint, type check)
   are part of this change; making them required in the ruleset is the
   user's step.

## Goals / Non-Goals

**Goals:** the hook runs what `commit-gates` lists; the runner's project
checks run the same list; CI runs each gate where its verdict binds.

**Non-Goals:** mutating `orchestrator/`; changing `bun/mutation-floor.ts`,
`bun/no-suppressions.ts` or `bun/check-yaml.ts`, which consumers run;
an import graph to find which modules a changed helper affects (decision 4).

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
`gitleaks` range and the mutation step's changed modules both read the base
from `bun/diff-base.sh`, as the budget does; `gates.sh` takes an optional
base argument, which CI passes as `HEAD^1`.

### 2. Biome as d2ass has it, reformat first

`biome.json` is d2ass's without its `src/model.ts` override: recommended
rules plus `noImportCycles`, tabs, double quotes, organise imports, the git
ignore file honoured. It excludes `mutation/**` (Stryker's output, which a
reformat would make differ from what Stryker writes) and the vendored
`core/skills/playwright-cli/**`. The reformat is `biome check --write` with
safe fixes only — formatting and import order — so the pull request holds
no hand edit; the three linter errors are fixed by hand in the hook's group.
Warnings (`noTemplateCurlyInString` on shell strings) do not fail `biome
ci` and stay warnings; no rule is turned off (`core/rules.md`).

Width 80 lengthens files. Before the reformat, a scratch run measures which
tracked `.ts` would then pass the 300-line cap (`change-slicing`); any such
file is split first, on its own branch, to the length it will have after
formatting.

### 3. The type check as strict as d2ass's

`tsconfig.json` is d2ass's without DOM, JSX and Preact; `typescript` 7.0.2
and `@types/bun` 1.4.2, the bun pin. An error is fixed by narrowing or by a
read that throws naming what was missing where absence is a bug — never a
`@ts-` marker. A fix that changes behaviour (the explore names
`bun/ci-run-clone.ts:59`, `string | Transient` reaching `string |
undefined`) gets its failing test first. The gate joins the hook only once
the last fix lands, so no push in between is refused by it.

### 4. Stryker per module, incremental, results in the tree

`stryker.config.json` holds what every run shares: the command runner,
`thresholds.break: null`, `json` among the reporters, `incremental: true`,
`tempDirName: .stryker-tmp`, and `ignorePatterns` covering `.claude` (the
worktrees, which the sandbox would otherwise copy) and `mutation`. `bun/mutation-run.ts` supplies
the per-module values — `mutate: bun/<name>.ts`, the command
`bun test bun/<name>`, `incrementalFile: mutation/<name>.json` — as flags
where Stryker takes them, otherwise through a configuration file written
under `.stryker-tmp`; the probe settles which.

The changed set is `git diff --name-only <base>...HEAD -- bun/`. A changed
module runs incrementally; a changed test or fixture `bun/<t>` re-runs with
`--force` every module whose `bun/<name>` prefixes it, because the command
runner reports no tests and so Stryker cannot see a test change in the
stored file (the probe confirms this, and `--force` goes if it is wrong).
A change to a helper another module imports re-runs only the helper's own
module: the importer's stored survivors can go stale, and `--all --force`
by hand refreshes everything. Deriving importers was the alternative,
rejected as machinery for a rare case.

After the runs the step fails on a stored file of an untracked module and on
one differing from `HEAD`'s, then merges every `mutation/*.json` into
`reports/mutation/mutation.json`, deleting the old report first as
`mutation-floor` requires, and `bun/mutation-floor.ts` checks the total
against `harness.mutationFloor`. Stored files rather than a cache outside
git, because a clone, a worktree, the host and CI must all read the same
results. They are excluded from the diff budget (`mutation/**` in
`harness.diffBudgetExclude`): the reviewed number is the floor's line.

The stored copy of `bun/no-suppressions.ts` carries its three markers. They
are approved by path, marker and count in `harness.suppressions`, the
mechanism the scan has for an approval; exempting `mutation/` in the scan
was the alternative, and would change both the scan and its requirement.

Stryker needs Node on `PATH` (d2ass's `mutation.yml` records why); the step
fails naming Node when a module changed and none is found.

### 5. Where the baseline runs: by hand, on the laptop

`bun bun/mutation-run.ts --all`, run by hand on the laptop, module after
module, each module's results committed as it finishes; an interrupted run
resumes, since a module with current stored results is near-instant. The
results are committed in pull requests, a batch of modules each. Not CI on a
schedule: the results must be committed, every workflow here holds `contents:
read`, and a write token in a scheduled job for a once-off run is a standing
risk for a single use — and roughly 9 000 mutants is hours of runner time.
Not the host: 2 vCPU and 3.5 GiB beside parallel agents.

### 6. CI jobs

`.github/workflows/lint.yml` follows d2ass's: `biome`, `typecheck`,
`yaml-syntax`, `suppressions`, `actionlint` and `gitleaks`, each installing
with `bun install --frozen-lockfile` where it runs a package tool, the two
containers pinned by the digests d2ass uses, with a comment saying nothing
updates them. `.github/workflows/mutation.yml` runs the mutation step and
the floor with base `HEAD^1`, on Node pinned as d2ass pins it: with current
stored results it mutates nothing, and on a branch pushed without the hook
it re-runs the changed modules and fails on the stale files. `test.yml` is
unchanged. The user then adds the new check names to the ruleset.

## Risks / Trade-offs

- [The reformat conflicts with every open branch] → it lands alone; a
  branch merging it takes its own side of a conflict and re-runs `biome
  check --write` over its files.
- [The baseline takes hours] → resumable per module, run by hand in batches.
- [Tests that read the repository through git behave differently inside
  Stryker's sandbox] → the probe and the baseline show it per module; a
  module whose dry run fails is reported on the card, never skipped
  silently.
- [The host has no Node] → unverified here; a push from the host that
  changed a module would fail naming Node, and installing it is a card.
- [A local base of `main` older than `origin/main`] → more modules mutate
  than the branch changed: slower, not wrong.
- [The stored results grow the repository by megabytes and churn with each
  module edit] → measured at the baseline and reported on the card.
- [A Stryker incremental file that is not byte-stable across identical runs]
  → the probe checks it; if it is not, the step writes a stored file only
  when its mutants' results changed.

## Migration Plan

Groups land in tasks.md order. Rollback is one line: dropping `gates.sh`
from the hook and restoring `bumpTest` to `bun test` returns today's push.
