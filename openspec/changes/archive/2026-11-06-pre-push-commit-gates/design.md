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
2. Stryker covers every module — narrowed to an allow list by decision 9: a
   baseline run once, module by module
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
   the timeout setting is decided on it. Measured on 2026-11-04 (whole modules
   flipping, 7 234 of 12 678 mutants Timeout) and settled by decision 9.
9. A (2026-11-05, after the card's architecture review) — mutate only an
   allow list of modules their tests exercise in-process; set `concurrency`,
   `timeoutMS` and `timeoutFactor` explicitly; give the sandbox no way to
   write the real checkout, whatever the list; the floor counts the listed
   modules alone, and the hook step stays. Design decision 7.

## Goals / Non-Goals

**Non-Goals:** changing `bun/mutation-floor.ts` or `bun/check-yaml.ts`,
which consumers run, or `bun/no-suppressions.ts`; an
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
`.claude/settings.json`, which a test reads. `json` stays among the reporters, as
`mutation-floor` asks; the merge below replaces a run's one-module report, and a failed step deletes it. The
absent `tsconfigFile` is d2ass's answer to Stryker's preprocessor calling an
API TypeScript 7.0.2 lacks. `bun/mutation-run.ts` writes the per-module values
— `mutate: bun/<name>.ts`, the command `bun test bun/<name>` — to a
configuration file under `.stryker-tmp`, no flag taking the command. Stryker's
`incrementalFile` is a fresh copy of `mutation/<name>.json` there (none when
forced), trimmed into the stored file once the run finishes, so the partial
results an interrupt saves never reach the stored file. A run resumes by
module, never from a leftover copy, which could hold replaced results. Named modules narrow a run,
which then writes no report. A dirty module fails like a dirty test. A run of
more than one module first dry-runs each, `dryRunOnly` in its configuration
and nothing stored, and fails naming every module whose dry run failed before
it mutates any; a run of one skips that, its own run starting with the same
dry run. A run of several so pays each dry run twice, about 25 minutes over
`--all`, for a stop that names every failing module at once.

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
leaves every result as it was still rewrites the fingerprint. The fingerprint
also holds, as text, the command a mutant runs and the options it runs under —
`stryker.config.json`'s save `mutate`, and decision 7's timeouts — so changing
how mutants are judged re-runs every module; `concurrency` stays out, being
the machine's. A run that would mutate refuses while anything outside
`mutation/` is edited or untracked, since Stryker copies the working tree, not
`HEAD`, and the sandbox's repository would hold it. A change to a
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
repository through git read the checkout's files, not the mutated ones, and
a mutant could write there; decision 7 gives the sandbox a repository of its
own.

Which modules are mutated is decision 7's allow list, not every module with
tests: a module no test file names by prefix (`bun/check-yaml.ts`,
`bun/root.ts` and more) stays off it, since the user's decision 2 judges a
module by `bun/x*.test.ts` alone, and the run names every module it leaves
out.

Before any run the step fails on a listed module that is untracked or has no
test file, a stored file whose module is untracked, has no test file or is
not listed, one with no `files` object, or one naming a source path other
than its own module's,
since no run could change those; a module with a test file and no stored file
runs whole. After the runs it fails on a stored file differing from `HEAD`'s,
or untracked, so the one it just wrote fails until committed, then merges every stored file's `files` entries, mutants
whole, into the one `files` map of `reports/mutation/mutation.json`, deleting the old report first as
`mutation-floor` requires, and `bun/mutation-floor.ts` checks the total
against `harness.mutationFloor`. Stored files rather than a cache outside
git, because a clone, a worktree, the host and CI must all read the same
results. They are excluded from the diff budget (`mutation/**` in
`harness.diffBudgetExclude`): the reviewed number is the floor's line.

`bun/no-suppressions.ts` is off decision 7's list (it has a main block), so
no stored file carries its three markers, and the scan exempts nothing under
`mutation/`: the exemption task 6.1 planned is dropped.

Stryker needs Node on `PATH` (d2ass's `mutation.yml` records why); the step
fails naming Node when a module changed and none is found.

### 5. Where the baseline runs: by hand, on the laptop

`bun bun/mutation-run.ts` by hand on the laptop over decision 7's list, in
one pull request (the list is small enough; batches were for every module);
an interrupted run resumes, a module with current stored results being
near-instant. Not CI on a schedule: the
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

### 7. An allow list, explicit timeouts, a sandbox of its own (user's decision 9)

This reverses "every module" in decisions 2 and 4–5 above. The 2026-11-04
baseline was mostly `Timeout` (7 234 of 12 678), flipped whole modules
between identical runs, and wrote the real checkout from the sandbox; the
card's architecture review of 2026-11-05 traced all three.

**The list.** A module is mutated only when all of these hold, read from the
2026-11-04 baseline and the source:

- its baseline shows no `Timeout` — its suite runs in seconds and in-process,
  so the limit is not crossed by load alone;
- it has no `import.meta.main` block — a `true` mutant of one runs the CLI
  inside the test process, and one ending in `process.exit(0)` reads as
  `Survived`;
- no test that `bun test bun/<name>` runs starts the module, or a program
  that imports it, with an environment built from scratch — that drops
  `__STRYKER_ACTIVE_MUTANT__`, so the child runs no mutant and every one
  survives (`push-draft`, `pr-sweep`, `board-loop-session`, `ci-run-session`
  through `ci-run.fixture.ts`, and `gate-ledger`, which the review counted in).

Nineteen modules pass, 1 550 mutants in the baseline. The list is
`stryker.config.json`'s `mutate`, Stryker's own key for what it mutates and
the one place both readers take it from: `bun/mutation-run.ts` mutates each
listed module alone (its per-module `mutate` replaces the list) and fails on
a listed module that is untracked or untested, or on a stored file of an
unlisted one; the floor counts the report the run merges from those stored
files, so it counts the list and nothing else. A module joins the list by a
line there and a run that writes its stored file.

**Timeouts.** A mutant's limit is `timeoutFactor` × the dry run +
`timeoutMS`, the dry run timed alone while the mutants ran on 11 workers,
where a suite ran up to 5 times slower. They sit beside `dryRunTimeoutMinutes`
in `bun/mutation-run.ts`, whose comment says why, since JSON holds none:
`concurrency` a third of the machine's cores (4 on the laptop), leaving room
for the agents beside it; `timeoutFactor` 3 and `timeoutMS` 10 000, a
slowdown of three plus 10 s of start-up. The baseline checks them: a listed module with more
than 5 % `Timeout` means the list or these values are wrong.

**The sandbox.** Stryker never copies `.git`, and its sandbox sits under the
checkout, so `git rev-parse --show-toplevel` from it — `bun/root.ts`,
`bun/tracked.ts`, `sync.ts`'s main block — named the real checkout. The
command each mutant runs first makes the sandbox a repository of its own
(`git init`, `git add -A` and one commit, so a test reading `HEAD` reads the
sandbox's, once, in the dry run before any worker starts, and again where an
earlier attempt left `.git` without a `HEAD`), so git stops there. The command
first unsets what `git rev-parse --local-env-vars` names, as `.githooks/pre-push`
does, since an inherited `GIT_DIR` would outrank the sandbox's `.git`. Smallest sound fix, against the alternatives:

- excluding main-block mutants covers the one path seen, not a mutant
  elsewhere that turns a test's directory into the `root` git names, and
  needs a Stryker comment or a line range per module;
- refusing when the root resolves outside the sandbox needs a check inside
  the tests' process, which `bun/mutation-run.ts` does not run;
- `tempDirName` outside the checkout makes `git` fail in the sandbox, and
  every module importing `bun/root.ts` with it.

The sandbox's repository also makes a test read the sandbox's files rather
than the checkout's, which the user or another mutant may change mid-run —
the review's second source of drift. `bun/mutation-run-command.test.ts` pins
it: a test that writes where git's root is writes the sandbox, not the
checkout around it.

**Not done:** option C, a scheduled CI job reporting the unlisted modules
without a floor, may follow as a change of its own.

## Risks / Trade-offs

- [The reformat conflicts with every open branch] → it lands alone; a
  branch merging it takes its own side and re-runs the reformat's two
  commands over its files.
- [The floor says nothing about the CLI and hook modules off the list, which
  carry most of the risk] → accepted by the user's decision 9; option C may
  report them later.
- [Tests that read the repository through git behave differently inside
  Stryker's sandbox] → since decision 7 they read the sandbox's repository;
  the baseline's dry runs (decision 4) name every listed module that fails
  there before any is mutated.
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
  even when trimmed] → the probe checked it: reused results are byte-stable;
  a whole re-run is not, a slow mutant's status depending on the load
  (decision 8). The step writes the stored file after every successful run,
  not only when its mutants' results changed, so a whole re-run can rewrite it
  with the same count.

## Migration Plan

Groups land in tasks.md order. Rollback is one line: dropping `gates.sh`
from the hook and restoring `bumpTest` to `bun test` returns today's push.
