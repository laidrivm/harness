# pre-pr-diff-paths

## Why

Which steps of the pre-PR sequence a branch needs is decided by the agent, by
reading two paths out of `core/review-toolkit.md` and judging which one its
diff takes. Nothing in code classifies a diff, so the gate that stage 2 puts on
opening a pull request and marking it ready (`work.ts finish`) has no list to
check the gate ledger against. That list is a fact of the diff and of the pull
request's state, and a fact is code's to read.

## What Changes

- A new module, `bun/pre-pr-steps.ts`, holds one pure function from the
  branch's changed paths and whether its pull request is open to the ids of the
  steps that branch still requires. The ids are the skill names a `Skill`-hook
  ledger record carries (`zombies`, `triage`, `warm`, `coderabbit-local`), plus
  the id of the runner's project checks.
  - A pull request already open requires the project checks alone; CodeRabbit
    reviews its head.
  - Otherwise every branch requires the project checks, `/triage` and
    `/coderabbit-local`. A branch whose every changed path is a `*.md` file or
    under `openspec/` stops there; any other path makes it a code branch, which
    also requires `/zombies`, and `/warm` where a `package.json` or `bun.lock`
    changed anywhere in the tree. A branch changing only config takes the code
    path.
- The paths come from one call, `git diff --name-only -z --no-renames
  --no-relative <base>...HEAD`, so a moved file counts on both sides and no
  git setting hides or quotes a path. The base is resolved
  once, by a script `bun/diff-budget.sh` now also calls for its default, and
  the runner passes the base it resolved both to the diff budget and to the
  path read.
- `bun/pre-pr.ts` prints the required steps as its last line, reading the
  pull request's state through `readPullRequests()`. A read that fails counts
  as no pull request open, which requires more steps, never fewer.
- `core/review-toolkit.md` stops listing the two paths: the runner names the
  steps, and the doc keeps why each one exists. The docs path's own `bun test`
  for a change directory added or removed goes, since the project checks run on
  every run, and its grep for restating sites goes into `/triage`, which
  already requires it. `core/feature-workflow.md` points at the runner instead
  of restating the proposal branch's path.

## Non-goals

- `work.ts finish`, its order of steps, and the refusal when a required step
  has no record at `HEAD`. They belong to the draft-rule card (*Hold an agent
  to the PR's draft rule with a work script, a guard and a stop hook*), whose
  `finish` calls this function and compares its list with the ledger.
- Filtering `ran()` in `bun/gate-ledger.ts` by `rule`. It ships with whichever
  of the stage's four slice changes merges first.
- How many `/coderabbit-local` passes a path gets, which stays in
  `local-review-loop`, and who reviews (reviewer rotation).
- Manifests of other ecosystems: every consumer is on bun, and `/warm` keeps
  its own wider list when it is called.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pre-pr-runner`: an added requirement — the runner names the steps the
  branch still requires, from its diff against the base it measures and from
  its pull request's state.
- `local-review-loop`: *The gate runs after triage and before the push* gives
  its one review pass to the branch the runner classifies as documentation,
  rather than to a branch of "documentation, rules or config".

## Impact

- New `bun/pre-pr-steps.ts` and `bun/diff-base.sh` with tests;
  `bun/pre-pr.ts` (the base, the last line); `bun/diff-budget.sh` (its
  default base).
- `core/review-toolkit.md`, `core/feature-workflow.md`.
- Consumers: on their next pin bump the runner prints one more line. No key
  and no registration is added.
- Order: this applies after `pre-pr-project-checks` (slice item 1) merges,
  since dropping the docs path's `bun test` rests on the runner running the
  project checks, and since this change names that step by the `rule` its
  record carries. The draft-rule change's `finish` applies after this one, or
  carries a stub of this function until it merges. The `after:` line stays out
  until those change directories are on `main`.
- Closest existing artefacts: the `pre-pr-runner` capability and the archived
  `2026-10-13-pre-pr-run-record`, whose *Non-goals* named this follow-up.
