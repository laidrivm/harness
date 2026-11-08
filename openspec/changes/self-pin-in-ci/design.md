# self-pin-in-ci — design

## Context

Read on 2026-11-08 from `origin/main` (`cd50372`):

- `package.json` pins `devDependencies.harness` at `8a1fffd`. The pin is read
  in three places: the hooks and the goal check of every harness session
  (`node_modules/harness/`), and `orchestrator/pass.sh`, which reads it from
  the push clone's `origin/main` each host pass and runs `board-loop.ts` from
  that commit.
- `bun/bump.ts` holds the consumers' `verify` and `land`; `greenHead` takes
  `main`'s head once its newest `test` check run from `github-actions`
  succeeded (`bun/green-run.ts`). `bun/bump-pin.ts` already reads a
  `devDependencies` pin and moves both harness fields — the part of
  `self-pin-bump` step 1 that #305 kept, since `check.ts` accepts such a pin
  from a consumer. `bumpSelf`, `mergedBump` and `commitBump` went in #305;
  `bun/bump-self.test.ts` (219 lines) with them. `bun/bump.fixture.ts` stays.
- A consumer's `harness-bump.yml` (README, step 7) runs `verify` under a read
  token and `land` under `GITHUB_TOKEN` with `contents: write`, pushing to its
  own `main`. Neither fits here: the `main` ruleset (id 25440192) requires a
  pull request with one approval and eight status checks from GitHub Actions
  (`test`, `budget`, `biome`, `typecheck`, `yaml-syntax`, `suppressions`,
  `gitleaks`, `actionlint`), all of them `pull_request` jobs; only the admin
  role bypasses it.
- `GITHUB_TOKEN` cannot carry the bump: the repository's
  `can_approve_pull_request_reviews` is `false`, so it cannot open a pull
  request, and a pull request or push it makes starts no workflow, so the
  eight required checks would never run on it.
- The board loop's GitHub App holds contents and pull-request write on this
  repository. Its private key lives only on the VPS, read by the key holder's
  `bun/github-app-mint.ts`; the repository has no Actions secret and no
  environment today.
- `bun/pr-sweep.ts` and `bun/ci-run.ts` act only on `feat/` and `spec/`
  branches, so a `bump/` branch the App opens draws no agent.

## Goals / Non-Goals

**Goals:** after each green `main` the pin lags, a bump pull request exists
that nobody wrote and that the user can merge with an approval alone.

**Non-Goals:** merging it (card *Auto-merge the self-pin bump PR without an
LLM*); changing the consumers' bump; a lag line in `pass.sh` or at session
start; pinning skills; new roll-out code.

## Decisions

### D1 — `bump.ts self`, restored from #281

`bun bun/bump.ts self` from the harness's root, as #281 shipped it and #305
removed it (`git show 64d84b6^:bun/bump.ts`): refuse a manifest whose two
harness fields differ (D3), read the pin, take `greenHead`, stop quietly
(exit 0, `sha`, `old`, `behind` all empty) on a head not green, equal to the
pin, or a merged bump (D2), or a head that is not the checkout's `HEAD`:
`main` moved between the checkout and the API read, the commit would sit on
one base while pinning another, and D2's diff could name a commit the clone
lacks — the newer head's own `Test` run starts the next attempt. Otherwise
move the pin with `movePin`, run
`bun install --ignore-scripts`, stage `package.json` and `bun.lock` alone,
commit through the helper `land` shares (`Bump harness <old7>..<new7>`, as
`github-actions[bot]`), and write `sha`, `old` and `behind`
(`git rev-list --count <pin>..<head>`) to `$GITHUB_OUTPUT`. The function is
`bumpSelf`: `self` names a global in bun.

No sync (it would write a `harness/` copy into the harness), no check (it
needs consumer keys), no `bumpTest`: the head already passed `test`, and the
pull request runs every required check again on the merge.

- *Alternative: target `workflow_run.head_sha`.* Equal on the trigger, but
  absent on `workflow_dispatch`, and it skips `green`'s `github-actions` slug
  check.
- *Alternative: the whole bump in workflow shell (`jq`, `git diff`).* The
  merged-bump comparison and the green rule would then live in YAML no test
  reaches, and `greenHead` would have a second copy.

### D2 — the merged-bump stop

Each merged bump makes a `main` commit whose `Test` run succeeds; without a
stop the workflow would propose pinning that merge, one pull request per
merge. A head is a merged bump when
`git diff --quiet <pin> <head> -- ':(exclude)package.json' ':(exclude)bun.lock'`
holds and `package.json` at both, parsed, is equal once both harness fields
are dropped. Any other manifest field differing (a script, `exports`, a
dependency) is a change the pin follows. A bump merged together with other
commits differs elsewhere, so the pin follows them.

- *Alternative: skip a head whose commit message or branch names
  `bump/self-pin`.* A squash or a hand edit of the subject breaks it; the
  tree comparison does not depend on how the merge was made.

### D3 — two different pins are refused

`bumpSelf` exits non-zero naming both specs when `dependencies.harness` and
`devDependencies.harness` differ, before D1's quiet stops: D2 drops both
fields, so a head that changed only them would otherwise pass as a merged
bump while `pass.sh` runs the development one. The harness names itself under
`devDependencies` alone, so this fires only on a hand edit.

### D4 — the token: a second App key in the `self-bump` environment

Decided by the user on the card on 2026-11-08 (answer 1 а), as for
`self-pin-bump` on 2026-10-25 (answer 1a).

The workflow needs a token whose pull requests start the eight required
checks, with `contents: write` (the branch), `pull-requests: write` and
`workflows: write`. The bump commit touches `package.json` and `bun.lock`
alone, but the force-push moves `bump/self-pin` from its last tip onto the
newest `main`, and GitHub refuses an App's push that changes a file under
`.github/workflows/` on the ref it updates without that permission — so the
first `main` with a workflow edit, behind an open bump, would stop every
bump until the branch was deleted. The App already holds it (#290).

A second private key of the board loop's App (`laidrivm-harness-agent`)
lives in a GitHub environment `self-bump` whose deployment branches are
`main` alone: the key as the secret `HARNESS_APP_KEY`, the App's id as the
variable `HARNESS_APP_ID`. `actions/create-github-app-token`, pinned by
commit, mints a token scoped to this repository with the three permissions. A
workflow pushed on a branch cannot enter the environment, so it never sees
the key; revoking this key leaves the VPS mint working. The user creates all
three by hand once (tasks.md 2.1).

- *Alternative б: no key in GitHub.* The host's webhook flow
  (`bun/on-event.ts`, which already receives `workflow_run`) runs the bump on
  a clone of its own with the key holder's mint. A new route, clone and push
  path in `on-event`/`ci-run`, tested only on Linux CI, and the bump stops
  whenever the host does.
- *Alternative в: `GITHUB_TOKEN` with "Allow GitHub Actions to create and
  approve pull requests".* Its pull request starts none of the required
  checks, so it never merges without the admin bypass, and the same setting
  lets any workflow approve a pull request, meeting the ruleset's one
  approval without the user.

The App authors the pull request, so the user approves it like any other and
merges under the ruleset, and CodeRabbit reviews it (the App has a seat since
2026-10-25).

### D5 — the workflow

`.github/workflows/self-bump.yml`:

- `on: workflow_run: { workflows: [Test], types: [completed], branches: [main] }`
  and `workflow_dispatch`. The job runs when the run concluded `success` from
  a `push` event, or on a dispatch from `refs/heads/main` alone — one from
  another ref is skipped rather than failing at the environment's branch
  rule. `workflow_run` runs the default branch's
  file, so a branch cannot rewrite what runs with the key. A bump pull
  request's own `Test` runs are `pull_request` events and start nothing; its
  merge's `push` run starts the workflow, which D2 makes quiet. No schedule:
  every `main` move ends in a `Test` run, and dispatch covers a missed one.
- `concurrency: { group: self-bump, cancel-in-progress: false }`, so two
  completions never push the branch at once.
- `permissions: { contents: read }` for `GITHUB_TOKEN`, which the `self` step
  gets as `GITHUB_TOKEN: ${{ github.token }}`, as the consumers' `verify`
  does, so `greenHead`'s two reads are authenticated rather than held to the
  shared runner's anonymous limit; `environment: self-bump`.
- Steps: the token step; `actions/checkout` with `ref: main`, that token and
  `fetch-depth: 0` (D2's diff and the count read history); `setup-bun` with
  `test.yml`'s pin and `bun-version`; `bun bun/bump.ts self`. When `sha` is
  set and `origin/bump/self-pin` does not already hold `HEAD`'s tree — a
  re-run or a dispatch on a head the open pull request already pins would
  otherwise push an identical tree, dismissing the approval and re-running
  every check for nothing: `git push --force origin
  HEAD:refs/heads/bump/self-pin`, then
  `gh pr list --head bump/self-pin --state open` — `gh pr edit` with the new
  title and body when one is open, `gh pr create --head bump/self-pin --base
  main` otherwise, since the checkout's own branch is `main`. Not
  `gh pr view bump/self-pin`, which also finds the branch's merged pull
  request and would edit it instead of opening one. `GH_TOKEN` is the token
  step's output.
- Title `Move the self-pin to <new7>`, the subject the hand moves used; body
  naming `<old7>..<new7>`, `behind` and that the user merges it.

The branch is force-pushed because it is the workflow's alone: rebuilt from
`main` each run, one commit over it, so it never conflicts with a `main` that
moved. Sessions never write it, and nothing sweeps `bump/` (Context).

### Roll-out — what already moves each reader

```
  merge bump PR --> main @ M (pin = P)
        |
        +--> Test (push) green --> self-bump: D2 quiet
        |
        +--> host pass: pass.sh reads P from origin/main --> runs P (next pass)
        |
        +--> host-deploy: deploys M once the session is fresh,
        |      restarts runner --> session.sh:
        |      git pull --ff-only + bun install --frozen-lockfile --> hooks at P
        |
        +--> laptop: git pull, SessionStart notice "installed X, the pin P"
               --> bun run deps (frozen; bun.lock holds P) --> hooks at P
```

No new code: the frozen install succeeds because the bump committed
`bun.lock` with the pin, which is exactly what a hand move lacked. A worktree
agent from `origin/main` installs at the pin with `bun run deps` as today.

## Risks / Trade-offs

- [The pin still waits for the user's merge] → the gap is now "until the user
  approves the App's pull request", not "until someone runs `bun install`";
  the auto-merge card closes it.
- [A second App key lives in GitHub] → an environment limited to
  `main`, a separate key so revoking it leaves the host's mint working.
- [`main` moves while a run is queued] → D1's stop on a head that is not the
  checkout's `HEAD`, or one not green yet, makes the run quiet; the newer
  head's `Test` completion runs it again.
- [A failing run reaches no harness watcher] → `ci-run.ts` ignores a
  `workflow_run` on `main` that is not scheduled, so a revoked key or a
  refused push shows only as a red run in Actions and GitHub's own
  failed-run notice; the pin then lags as before this change, and the next
  hand move still works. A watcher waits for a failure that shows the need.
- [The approval is dismissed by each force-push] → `dismiss_stale_reviews_on_push`
  re-asks after every newer `main`; the pull request always carries the newest
  green pin, so an approval given is for what merges.

## Migration Plan

Merge, then group 2's user acts: the credentials, one dispatched run, the
first merge. Rollback: delete the workflow file (and the environment); the pin
moves by hand again, as README says.
