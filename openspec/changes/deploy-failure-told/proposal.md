# deploy-failure-told

## Why

`/code-review` on the host-deploy archive (#450) found three gaps in how
`orchestrator/deploy.sh` tells a failure (card *deploy.sh: a failure after
main comes up is never told to the session…*,
41039875c31b81369da1dae6ee906c89):

1. A step that fails after `main` is up — the Windmill push, once stage 6
   adds `windmill_deploy_token`, or the `deployed` record — writes the
   failure file after the session's `SessionStart` hook has already run.
   Nothing reads the file until the next start, and the next tick, while the
   session is still fresh, removes it before restarting the runner
   (`deploy.sh:130`). The session is never told, and the cycle repeats every
   five minutes. It must be fixed before stage 6.
2. A `rolled-back` record that cannot be written is told by the journal
   alone; the failure file says only that the wait for `main` failed, and the
   next run deploys the same head again.
3. `green()` (`deploy.sh:48`) accepts any successful `test` run among those
   `filter=latest` returns. GitHub returns the latest run of each name *per
   check suite*: on this repository's `a03ec51` and `eab4bdb`, two `push`
   runs of `test.yml` left two `test` runs, both returned under
   `filter=latest`, while mellon's `99d775c`, re-run four times, returns one
   per name, its re-runs sharing one suite. A head whose older suite passed
   and newer one failed is therefore deployed, against the requirement's
   *latest `test` check run*. `bun/bump.ts`'s `greenHead()` reads the same
   URL the same way, so every consumer's bump adopts such a harness commit
   as green too.

## What Changes

- The failure file is also reported by a hook on each submitted prompt, not
  only on a session start, so a failure written after the start reaches the
  session at its next prompt. The report moves into one script the image
  carries, which both hooks run.
- A `rolled-back` record that cannot be written is named in the failure file,
  in each failure line the rollback writes, beside the step that failed.
- `green()` decides by the newest `test` run from `github-actions` across
  every check suite the read returns, so an older suite's success no longer
  outweighs a newer suite's failure or pending run; a consumer's bump
  chooses its target the same way.

Not in this change: the restart of a still-fresh session on each tick while a
step after `main` keeps failing, which is the retry every other failed step
gets; the symlink hole in `put()`, deferred by the user's decision of 06.11
until a seen threat. Whether this change also stops that retry from tagging
the image it brought up as the previous one is asked on the card (design,
*Open Questions*).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator`: *A failed deploy is told to the session* — the prompt hook
  reports the failure file too; *A session that does not come back is rolled
  back* — a `rolled-back` record that cannot be written is named in the
  failure file; *The host deploys main's green head and nothing else* — a
  scenario for a head with more than one check suite.
- `harness-updates`: *A bump attempts only the harness's newest green
  commit* — the newest test run decides, across check suites.

## Impact

- Changed: `orchestrator/deploy.sh` (`green()`, `rollback()`),
  `orchestrator/runner/managed-settings.json`, `orchestrator/runner/Dockerfile`
  (the script's `COPY`), a new `orchestrator/runner/deploy-failed.sh`,
  `orchestrator/README.md` where it names the hooks; tests
  `orchestrator/deploy-session.test.ts`, `orchestrator/deploy.test.ts`,
  `orchestrator/layout-deploy.test.ts`, and `orchestrator/deploy.fixture.ts`
  for runs from more than one suite; `bun/bump.ts` (`greenHead()`) and
  `bun/bump-verify.test.ts`.
- The host: the next deploy after the merge rebuilds the runner image, which
  carries the new hook.
