# pre-pr-diff-paths — tasks

The test tasks come from the proposal-stage `/zombies` run and are written
before the code they cover (`core/testing.md`). The numbers in brackets are
that run's idea numbers, and all 30 are placed below. Each test that spawns
the runner points `XDG_STATE_HOME` at a temporary directory and puts a stub
`gh` first on `PATH`, so no case reads the real ledger or GitHub.

There is one group, shipped as `feat/pre-pr-diff-paths`. It is cut after
`pre-pr-project-checks` merges (design.md, *Migration Plan*).

## 1. The required steps, one base, and the docs that stop listing them

- [x] 1.1 Write the function's table in `bun/pre-pr-steps.test.ts`, over the
      pure function alone:
      - no changed path (`[]`) names the documentation branch's steps [1];
        `undefined`, the path read's failure, names every step, `warm`
        included [2];
      - one `.md` path names the project checks, `triage` and
        `coderabbit-local` [3]; one `.ts` path adds `zombies` and not `warm`
        [4];
      - `openspec/` files plus one `.ts` file name `zombies` [5]; `.md` files
        in nested directories stay documentation [6]; the ids come out in one
        order whatever the order of the paths [7];
      - `README.MD` [8], `openspec-notes.txt` [9] and `notes.md.ts` [10] are
        code; `package.json.bak` [11] and `bun.lockb` [12] bring no `warm`;
        `packages/a/package.json` brings `warm` [13]; a `package.json` under
        `openspec/` alone stays documentation, with no `warm` [14];
      - `.coderabbit.yaml`, a workflow and `.claude/settings.json`, each
        alone, name the code branch's steps;
      - an open pull request names the project checks alone, for a code
        branch, a documentation branch and `undefined`;
      - each judgement id names a `core/skills/<id>/SKILL.md` whose `name:`
        is that id [15].
      Cite `pre-pr-runner/markdown-alone`, `…/a-proposal-with-one-source-file`,
      `…/config-alone`, `…/a-lockfile-alone`, `…/a-nested-manifest`,
      `…/nothing-past-the-base`, `…/a-diff-it-cannot-read`,
      `…/a-code-branch-with-its-pull-request-open` and
      `…/an-open-pull-request-over-a-diff-it-cannot-read`. All fail before
      1.4.
      Verify: `bun test bun/pre-pr-steps.test.ts` fails on the missing module.
- [x] 1.2 Write the runner's cases in `bun/pre-pr-steps-run.test.ts`, spawning
      `bun/pre-pr.ts` in a scratch repository with a base branch, as
      `bun/pre-pr.test.ts` does:
      - the record a run writes for the project checks carries the id the
        function names for them [16];
      - the last line opens `PRE-PR steps:` and `GATE_LINE` in
        `bun/turn-gate.ts` does not match it [17]; the exit status is the one
        the steps alone give [18];
      - `bun/diff-base.sh` prints `origin/main` where `origin/HEAD` points
        there [19] and `main` where it is unset [20]; `bun/diff-budget.sh`
        with no argument measures from that base [21];
      - a branch renaming a `.ts` file to `.md` names `zombies` with
        `diff.renames=true` set in the repository [22]; a `package.json`
        under a non-ASCII directory names `warm` with `core.quotePath=true`;
        a `.ts` file changed outside the subdirectory the runner starts in
        names `zombies` with `diff.relative=true`;
      - a `gh` that exits non-zero [23], a detached `HEAD` [24], and a merged
        and a closed pull request [25] each read as not open; an open draft
        reads as open [26];
      - an unresolvable base names every step and exits 2 [27]; a base `B`
        passed to the runner is the one both the diff budget and the path read
        use [28];
      - a documentation branch with no pull request names its steps [29]; a
        code branch with its pull request open names the project checks alone
        [30].
      Cite `pre-pr-runner/a-source-file-moved-to-markdown`,
      `…/a-merged-pull-request`, `…/the-pull-request-cannot-be-read`,
      `…/no-base-passed` and `…/a-base-passed`. All fail before 1.5.
      Verify: `bun test bun/pre-pr-steps-run.test.ts` fails on the missing
      line and script.
- [x] 1.3 Move the base rule out of `bun/diff-budget.sh` into
      `bun/diff-base.sh`, with the comment on `rev-parse --abbrev-ref` moving
      with it, and make `diff-budget.sh` call it when given no argument.
      Verify: cases [19]–[21] and every `bun/diff-budget*.test.ts` pass.
- [x] 1.4 Write `bun/pre-pr-steps.ts`: the step ids as exported constants, the
      project checks' id taken from the `rule` `pre-pr-project-checks` gave
      its record; `required(paths, open)`; and the path read over
      `git diff --name-only -z --no-renames --no-relative <base>...HEAD`,
      split on NUL. A git failure yields `undefined`, never `[]`, so it
      cannot read as a branch that changes nothing, and
      `required(undefined, false)` returns every step. Verify:
      `bun test bun/pre-pr-steps.test.ts` passes.
- [x] 1.5 In `bun/pre-pr.ts`, take the first argument as the base or run
      `diff-base.sh` once, pass that base to the diff budget and the path
      read, record the project checks under the exported constant, read
      `open` from `readPullRequests()` for the current branch, and print the
      `PRE-PR steps:` line last. Keep the file under 300 lines. Verify:
      `bun test bun/pre-pr-steps-run.test.ts bun/pre-pr.test.ts` passes.
- [x] 1.6 In `core/review-toolkit.md`, replace the two paths with the runner's
      list: keep why each step exists, name `bun/pre-pr.ts`'s last line as
      the list, drop the documentation path's `bun test` and its separate
      grep (now `/triage`'s), and keep the pass counts of
      `/coderabbit-local`. In `core/feature-workflow.md`, make the bullet on
      pushing `spec/<proposal-slug>` point at the runner's list instead of
      "documentation, rules or config". Grep the tree for "rules or config"
      and "dependency manifest changed" and reconcile each site outside
      `openspec/changes/archive/`. Verify: the grep finds no stale site, and
      `bun test bun/spec-coverage*.test.ts bun/board-state-hygiene.test.ts`
      passes.
