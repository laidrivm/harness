# pre-push-commit-gates

## Why

`commit-gates` (*The pre-push hook runs the gates named here*) says the push
runs the type check, `biome ci`, the YAML check, the suppression scan and the
mutation floor with its Stryker run, and `actionlint` and `gitleaks` where
installed. The harness's own `.githooks/pre-push` runs `bun test` and the
soft diff budget, nothing else, and CI runs `bun test` alone. The requirement
was written in d2ass for d2ass's hook and copied here unchanged on 06.10
(`dc5b8ca`); the harness's hook arrived a day later with two steps
(`f1bf90b`). A change resting on the spec claims gates that do not exist —
draft #308 did, and CodeRabbit caught it — and an agent reads a push as
checked deeper than it was. On 26.10 the user chose to bring the hook up to
the spec rather than narrow the spec to the hook (card *Bring harness's own
pre-push hook up to the commit-gates spec*, explored 2026-10-31).

The user's answers of 2026-10-31 settle the explore's five questions: the
formatter is on and the tree is reformatted now, in one pull request of its
own (1 б); Stryker covers every module, once as a baseline module by module
and afterwards incrementally, a push mutating only the modules its branch
changed (2, 3); the type check is `strict` with `noUncheckedIndexedAccess`
(4 б); and the CI jobs the spec requires and the harness lacks are part of
this change (5 а).

## What Changes

- Dev dependencies `@biomejs/biome`, `typescript`, `@types/bun` and
  `@stryker-mutator/core`, with `biome.json`, `tsconfig.json` and
  `stryker.config.json` modelled on d2ass's.
- The whole tree reformatted by Biome in one pull request carrying
  `oversize:`, and Biome's three linter errors fixed by hand.
- `tsconfig.json` as strict as d2ass's, and the ≈198 errors it reports fixed
  across as many pull requests as the diff budget needs.
- One gates script that the pre-push hook runs and that `harness.bumpTest`
  names, so the runner's record proves what the push proves: `biome ci`, the
  type check, the YAML check, the suppression scan, `bun test`, `actionlint`
  and `gitleaks` behind `command -v`, and the mutation step.
- **Behaviour change** to `commit-gates`: the Stryker run no longer covers a
  fixed module on every push. It mutates only the `bun/` modules the branch
  changed against its base, and the floor counts every module, the
  unchanged ones from results stored in the tree.
- Stryker's incremental results stored one file per module under
  `mutation/`, written by a baseline run by hand on the laptop and kept
  current by the push, which refuses while the run left them differing from
  what `HEAD` tracks.
- CI jobs for Biome, the type check, the YAML check, the suppression scan,
  `actionlint`, `gitleaks` and the mutation step. Making them required in
  the repository's ruleset is the user's step.
- `harness.suppressions` and `harness.mutationFloor` in `package.json`; the
  suppression scan exempts the stored results of its own script, which hold
  its markers verbatim.

Not in this change: mutating `orchestrator/`, which the user's answer names
no module of; the browser suite, coverage and `bun audit`, which the spec
already keeps out of the hook; and a consumer's hook, which each consumer
owns.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: the pre-push hook's mutation run covers only the modules
  the branch changed, and the hook's judged gates are the ones the pre-PR
  runner's project checks run; the suppression scan exempts
  `mutation/no-suppressions.json`.
- `mutation-floor`: what the harness mutates — every `bun/` module, each
  against its own tests, with results stored per module — and that the floor
  counts all of them.

## Impact

- New: `biome.json`, `tsconfig.json`, `stryker.config.json`,
  `.githooks/gates.sh`, `.github/workflows/lint.yml`,
  `.github/workflows/mutation.yml`, `bun/mutation-run.ts` and its test,
  `mutation/*.json`.
- Changed: `bun/no-suppressions.ts` and its test (one exempt path); every
  formatted file in one pull request; the files the type
  errors sit in; `.githooks/pre-push`; `package.json` and `bun.lock`;
  `.gitignore` (`reports`, `.stryker-tmp`); `bun/git-env.test.ts` and
  `bun/pre-pr.test.ts`, which pin the hook's lines; `README.md`'s *Working on
  the harness* and its map of where files live.
- A push gets slower: a few seconds for Biome and the type check, and for
  each module the branch changed a Stryker run — near-instant when its
  stored results are current, 15–25 minutes on the laptop for a module whose
  tests changed.
- Stryker needs Node on `PATH`, as d2ass's mutation job records; a push that
  changed a module fails on a machine without it.
- Consumers install none of the package's dev dependencies and run their
  own hooks, but their install of the GitHub dependency carries the whole
  tree, `mutation/` and the new configuration files included (design.md,
  Risks).
