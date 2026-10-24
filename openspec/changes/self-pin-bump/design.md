# self-pin-bump — design

## Context

Read on 2026-10-25 from `origin/main` (`0a71cf5`):

- `package.json` pins `devDependencies.harness` at `7e740f1`, 28 commits
  behind `main`. The last eight commits touching `package.json` are hand-made
  pin moves (`git log -- package.json`).
- On the host, `orchestrator/pass.sh` (lines 177–186) reads that pin from the
  push clone's `origin/main`, fetches the commit into the runner's harness
  checkout and runs `bun/board-loop.ts` from it. So the host runs a merged fix
  only once the pin passes it. A laptop pass runs `node_modules/harness/`,
  the same pin.
- `bun/bump.ts` is the consumers' bump: `verify` targets `main`'s newest
  commit whose `test` check run, posted by `github-actions`, succeeded
  (`greenHead`), then runs install, sync, check and `bumpTest`; `land` redoes
  the edit and pushes to `main` as `github-actions[bot]`. `pinOf` in
  `bun/bump-pin.ts` reads `dependencies.harness` alone and throws on the
  harness's own manifest.
- The `main` ruleset (id 25440192) requires a pull request with one
  approval and no status check; only the admin role bypasses it. The repo's
  Actions setting `can_approve_pull_request_reviews` is `false`, so
  `GITHUB_TOKEN` cannot open a pull request.
- `.github/workflows/` holds `test.yml` (the `Test` workflow, job `test`,
  on push to `main` and on pull requests) and `diff-budget.yml`.
- The board loop's GitHub App opens the loop's pull requests on this
  repository, so it holds contents and pull-request write. Since 2026-10-25 it
  has a CodeRabbit seat (card *CodeRabbit skips bot PRs*), so its pull
  requests are reviewed like the user's.

## Goals / Non-Goals

**Goals:** after each green `main`, a bump pull request exists without anyone
writing it; the host's pass log says how far its pin lags.

**Non-Goals:** merging without the user; changing the consumers' bump; a
session-start lag line in the harness's own sessions (question 3 on the
card); pinning skills (`self-pinned-gates` kept them on the tree).

## Decisions

### D1 — a `self` command in `bump.ts`, reusing `greenHead`

`bun bun/bump.ts self`, from the harness's root: read the pin, take
`greenHead`, and stop quietly (exit 0, empty `sha`) when the head is not
green, equals the pin, or `git diff --quiet <pin> <head> --
':(exclude)package.json' ':(exclude)bun.lock'` holds. Otherwise move the pin
with `movePin`, run `bun install --ignore-scripts`, stage `package.json` and
`bun.lock` alone, commit as `github-actions[bot]` with the identity `land`
uses (lifted into one helper both call), and write `sha`, `old` and `behind`
(`git rev-list --count <pin>..<head>`) to `$GITHUB_OUTPUT`.

Same target rule as consumers, so the requirement *A bump attempts only the
harness's newest green commit* holds for it unchanged. No sync (it would write
a `harness/` copy into the harness), no check (it needs consumer keys), no
`bumpTest`: the head already passed `test`, and the pull request runs it again
on the merge.

- *Alternative: target `workflow_run.head_sha`.* Equal on the trigger but not
  on `workflow_dispatch`, and it skips the `github-actions` app-slug check.
- *Alternative: a separate script.* `bump.ts` is 202 lines; `self` adds about
  40. Split only if the apply measures past 300.

### D2 — the merged-bump stop

Each merged bump makes a new `main` commit, its `Test` run succeeds, and
without a stop the workflow would propose pinning that merge — forever, one
pull request per merge. A head whose tree differs from the pin's only in
`package.json` and `bun.lock` is exactly a merged bump (or a no-op), so it
proposes nothing. A bump merged together with other commits still differs
elsewhere, so the pin follows them.

### D3 — `pinOf` falls back to `devDependencies`

`dependencies.harness ?? devDependencies.harness`, the order `NOTICE` in
`bun/bootstrap.ts` already uses, so one rule decides which pin a manifest
has. A consumer's result is unchanged: both pin under `dependencies`.

### D4 — the workflow: `workflow_run` after `Test`, one branch, the App's token

`.github/workflows/self-bump.yml`:

- `on: workflow_run: { workflows: [Test], types: [completed], branches: [main] }`
  and `workflow_dispatch`; the job runs only when the run's conclusion is
  `success` and its event `push` (or on dispatch). A `workflow_run` job runs
  the default branch's workflow file, so a branch cannot rewrite it.
- `concurrency: { group: self-bump, cancel-in-progress: false }`.
- `environment: self-bump`, whose deployment branches are `main` alone; it
  holds the App's id (variable) and private key (secret). A workflow a
  session pushes on a branch cannot enter the environment, so it never sees
  the key.
- Steps: `actions/create-github-app-token` (pinned by commit, scoped to this
  repository, `contents: write`, `pull-requests: write`), checkout of `main`
  with that token and `fetch-depth: 0` (the count and the diff read history),
  `setup-bun` at 1.4.2, `bun bun/bump.ts self`, then, when `sha` is set:
  `git push --force origin HEAD:refs/heads/bump/self-pin`, and
  `gh pr create` from it unless `gh pr view bump/self-pin` finds one open, in
  which case `gh pr edit` sets the new title and body.
- The job runs `bump.ts` from `main` and bun, with no lifecycle script; the
  harness has no other dependency.

A pull request opened with an App token starts the `Test` workflow, which one
opened with `GITHUB_TOKEN` would not, and CodeRabbit reviews it. Because the
App authors it, the user can approve it like any other pull request and merge
it under the ruleset, without the admin bypass.

The branch is force-pushed because it is the workflow's alone: rebuilt from
`main` on each run, one commit over it, so it never conflicts with a `main`
that moved. The rule against force-pushes binds sessions, which never write
this branch; `pr-sweep.ts` sweeps `feat/` and `spec/` only, and `ci-run.ts`
starts agents only for pull requests the loop opened, so neither touches it.

- *Alternative: `GITHUB_TOKEN` with the repository setting that lets Actions
  open pull requests.* No `Test` run on the pull request, and the same
  setting lets any workflow approve one, which meets the ruleset's one
  approval without the user.
- *Alternative: a ruleset bypass for GitHub Actions and `land`'s direct push.*
  Fully unattended, but every workflow on any branch that asks for
  `contents: write` could then push to `main`.
- *Alternative: the host's event flow, on the `workflow_run` delivery
  `on-event.ts` already receives, through the existing mint.* No key in
  GitHub, but a new flow, clone and push path on the host — more code than a
  workflow file, and it stops when the host does.
- *Alternative: a branch per target.* Old bump pull requests stay open and
  conflict with each other; the user closes them by hand.

### D5 — the lag line in `pass.sh`

In the `PASS_AS_AGENT` branch, after the pin's commit is checked out:
`git -C "$harness" fetch -q <harness url> +refs/heads/main:refs/remotes/origin/main`,
then `git rev-list --count "$sha..origin/main"`; when that succeeds with a
count above 0, `pass.sh` writes `harness pin <7 hex> is <n> commits behind
main` to the log before the runner appends to it (`>"$log"` becomes `>>"$log"`
after the line is written). Either command failing writes nothing and is not
a `halt`. The count is what the user needs to judge whether a fix has reached
the host; the bump pull request's body carries the same count.

## Risks / Trade-offs

- **The host still waits for the user's merge.** Lag drops from "until
  someone writes a pin PR" to "until the user merges the bot's one"; the pass
  log names the gap meanwhile.
- **A second App key lives in GitHub.** Scoped to an environment limited to
  `main`; a separate key so revoking it leaves the host's mint working.
- **The bump pins a commit one `Test` run old.** `greenHead` reads the head
  at the job's start; if `main` moved, the head is not green yet and the run
  is quiet, and the next `Test` completion runs it again.
- **Collision with `runner-isolation`** (active, tasks 6.1–6.2 open): both
  edit `orchestrator/pass.sh`. This change adds lines after its pin checkout
  (lines 177–186) and touches no requirement it modifies; whichever merges
  second merges `main` first.

## Migration Plan

Merge, then the user act in tasks.md group 4: create the environment and
secrets, start the workflow once by hand, and merge the first bump. Rollback:
delete the workflow file; the pin then moves by hand again.
