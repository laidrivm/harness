# strip-inherited-git-env — design

## Context

See proposal.md, *Why*. What the card's exploration (2026-10-26) and this
proposal measured, on git 2.47.0 and bun 1.4.2:

- A pre-push hook run from a normal checkout gets `GIT_PREFIX=` and no
  `GIT_DIR`; run from a linked worktree it gets an absolute
  `GIT_DIR=<repo>/.git/worktrees/<name>` and no `GIT_WORK_TREE`. A fixture
  whose `cwd` is a temporary directory then writes into the shared `.git`.
- `git rev-parse --local-env-vars` prints fifteen names: `GIT_ALTERNATE_OBJECT_DIRECTORIES`,
  `GIT_CONFIG`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`,
  `GIT_OBJECT_DIRECTORY`, `GIT_DIR`, `GIT_WORK_TREE`,
  `GIT_IMPLICIT_WORK_TREE`, `GIT_GRAFT_FILE`, `GIT_INDEX_FILE`,
  `GIT_NO_REPLACE_OBJECTS`, `GIT_REPLACE_REF_BASE`, `GIT_PREFIX`,
  `GIT_SHALLOW_FILE`, `GIT_COMMON_DIR`. It prints them outside a repository
  too.
- About 50 test files make ~159 `Bun.spawn*` calls and keep ~15 local
  `git(...)` helpers, almost none passing `env`. `delete process.env.X`, in a
  test or a preload, reaches `node:child_process` and `{ env: {
  ...process.env } }` but not a `Bun.spawnSync` without `env`, which takes
  the environment the process started with.
- A preload named in `bunfig.toml` that calls `process.exit(1)` stops
  `bun test` with exit 1 before any test file runs (probed in a scratch
  directory with a dummy variable).
- In bash, `set -e` does not stop on a failed command substitution inside
  `unset`'s arguments: `unset $(false)` continues (probed).
- A Claude Code Bash call carries `GIT_EDITOR` (observed in this session);
  `bun/github-app.ts` sets `GIT_AUTHOR_*`, `GIT_COMMITTER_*` and
  `GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n` for the runner. None of those is on
  git's list.
- The harness has no `bunfig.toml` today. `bun/sync-settings.ts` writes only
  the `[install]` table of a consumer's own `bunfig.toml`, and a
  `bunfig.toml` under `node_modules/harness/` is never read. The runner
  starts every bun with `--config=/dev/null` (`orchestrator`, *A preload in
  the pushed tree*), and `orchestrator/pass.sh` drops every `GIT_*` itself.
- The user made the main checkout's `core.hooksPath` the relative
  `.githooks` (answer 2 а), which git resolves from each worktree's root, so
  a worktree runs its own branch's hook.

## Goals / Non-Goals

**Goals:** a push from a worktree runs the suite against each fixture's own
repository; any other way into the suite from the root with a repository
variable set fails loudly rather than writing into another repository; the worktree Safety rule
leaves once that is shown live.

**Non-Goals:** stripping the variables in each spawn (variant В), consumers'
hooks and suites (stage 2, question 28 a″: harness first), and the brief and
memory changes, which live outside this tree (proposal, *Not in this
change*).

## Decisions

### Variant Б: drop in the hook, refuse in the suite

The hook's `unset $(git rev-parse --local-env-vars)` closes the push path in
one line. The preload closes every other entry — a hand-run `bun test` in a
hook's environment, `git rebase -x 'bun test'`, a stale hook in an older
checkout — by refusing rather than repairing, because a repair cannot reach
`Bun.spawnSync` without `env`. The user chose this over the hook alone and
over the per-call strip (answer 1 б).

### Git's list, never a prefix

Both halves read `git rev-parse --local-env-vars` when they run, and the
harness keeps no copy, so a variable a later git adds is covered with no edit
here. A `GIT_` prefix would refuse every Claude Code session, which sets
`GIT_EDITOR`, and every runner session, which sets the author variables;
neither moves git to another repository.

### Set is set, empty included

A variable counts when it is present, whatever its value: a normal
checkout's hook sets `GIT_PREFIX=` empty, and "empty means unset" is a
judgement git does not make the same way for every name.

### The hook may fail open; the preload fails closed

`set -e` does not stop the hook when `git rev-parse` fails inside `unset`'s
arguments, so the variables would survive. The preload then sees them and
refuses, and the push stops with it. A list the preload cannot read refuses
too, naming the failure (stage 2: an error closes the write). The hook keeps
the user's one line rather than a two-line form that would stop by itself.

### `bunfig.toml` is the harness's own

The new file holds `[test] preload = ["./bun/git-env-guard.ts"]` and nothing
else. No consumer receives it: sync writes only a consumer's `[install]`,
and the package's own copy is never read. It holds no `[install]`: the
harness has kept none, and adding one is not this change.

### The hook's order, beside `work-finish`

The hook becomes `set -euo pipefail`, the `unset` line, then whatever
follows today. `work-finish` (merged proposal, unapplied) puts `bun
bun/push-draft.ts "$@"` first among the commands; whichever applies second
keeps the `unset` line above it. The two requirements do not contradict:
`work-finish`'s "before its other checks" orders checks, and dropping
variables is no check. `push-draft.ts` makes no git call, so it is safe
either way, and `bun/pre-pr.test.ts`'s pin — the hook names `diff-budget.sh`
and not `pre-pr` — still holds: the new line contains neither.

### The tests

`bun/git-env.test.ts` holds both. The hook case runs `.githooks/pre-push`
from an empty temporary directory, with a stub `bun` first on `PATH` that
appends its environment to a file and exits 0, and git's variables set to a
decoy repository and to a temporary repository's linked worktree; every
recorded call lacks them, and the decoy's refs and config are unchanged.
Run from that directory, `bash bun/diff-budget.sh` finds no script and the
hook's `|| true` absorbs it. The suite case spawns a child `bun test` of one
existing test file that runs git in a temporary directory, from the
repository's root so `bunfig.toml` is read, with `GIT_DIR` naming a decoy
with no remote — at regression there is nowhere to push. Each spawn carries
an explicit timeout (`core/rules.md`, Code).

### The probe, and why its git reads no credentials

The red-before record is live (answer 3 а): a scratch clone, cloned from a
local bare repository that is its only remote, `core.hooksPath=.githooks`,
`bun install` in a `git worktree add` of it, and a push from that worktree —
once on `origin/main`'s hook, once on this branch's. Before: fixture commits
and refs reach the bare. After: only the pushed branch.

Fixtures set `origin` to GitHub URLs (`bun/goal-check.fixture.ts`,
`bun/board-loop-push.test.ts`, `orchestrator/pass-pin.fixture.ts`), and under
an inherited `GIT_DIR` that rewrites the scratch clone's own `origin`; this
machine's system and global config name the `osxkeychain` and Git Credential
Manager helpers. So the probe runs with `GIT_CONFIG_NOSYSTEM=1`,
`GIT_CONFIG_GLOBAL` naming a scratch file whose `url.<missing path>.insteadOf`
rewrites `https://github.com/`, `ssh://git@github.com/`, `git@github.com:`
and `git@GitHub.com:`, `GIT_TERMINAL_PROMPT=0`, no `GH_TOKEN`, and
`GH_CONFIG_DIR` an empty directory. None of those is on git's list, so the
fix's `unset` keeps them in both runs. The probe never runs in the main
checkout or in a clone with a GitHub remote.

### The rule leaves in the same pull request

Once the probe's after-run and both tests pass, `core/rules.md` drops *Push
from a repository's own checkout, never a `git worktree`* whole, under
`agent-rulebook`'s *A mechanised prohibition leaves its prose home*: the hook
holds the push, and the preload holds the probe's danger, so nothing the rule
names is left uncovered. `core/git-and-prs.md`'s *Remove a worktree as
soon as its branch is the one to push*, which assumed the push came from the
main checkout, becomes *once its branch is pushed*, keeping its reason. While
`work-finish` is unarchived, its `design.md` sentence "a worktree's is the
trap `core/rules.md` names" is reworded in the same commit, so it does not
cite a rule that is gone.

### Seams with the slice's other changes

- `judgement-step-record`: its skill hook names a subagent's branch only once
  subagents work in worktrees, which this change makes safe. Its tests strip
  `GIT_*` themselves "until slice item 0 makes that general"; with the
  preload that strip stays harmless and is no longer needed. Whether
  `$CLAUDE_PROJECT_DIR` resolves `node_modules/harness` in a worktree
  session (its design, *Seams*) is answered by the brief, not by code: the
  subagent's first command is `bun install`, which the fallback guard lets
  through (card assumption 8).
- `work-finish`: the hook's order, and the design sentence above.
  `finish` pushes from its working directory, so from a worktree after this
  change.
- `pre-pr-project-checks` and `pre-pr-diff-paths`: the runner runs outside a
  git hook and gets no repository variable; the preload covers any suite it
  starts. No shared requirement.
- `local-review-before-pr`, `work.ts take` (card
  `40439875c31b810d8562f984ab8bc84a`), `host-deploy`: no seam.

### Conflict check (stage 2, question 14 б)

`openspec show <change> --json --deltas-only` over every open change on
`origin/main` and in the open pull requests on 2026-10-26 (#313
`work-take`, whose delta is `work-take` alone, and #314, applying
`local-review-before-pr` to `local-review-loop`): only `work-finish` shares a
capability, `commit-gates`, with its ADDED *The pre-push hook
refuses a push into a ready pull request*. Read side by side: no
contradiction, and the order lives in prose above, not in `after:`.

## Risks / Trade-offs

- [CI sets one of git's variables for `bun test`] → the suite refuses on the
  first CI run of the apply pull request, loudly; not expected, since
  `actions/checkout` writes config, not environment, but unverified.
- [`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n` stay in the suite's environment]
  → inert once `GIT_CONFIG_COUNT` is gone, but a header value can still be
  read there. No failure has shown that threat (roadmap clarification 11).
- [A `bun test` started in a subdirectory skips the preload] → bun reads
  `bunfig.toml` from its working directory alone (probed: a run from a
  subdirectory of the scratch directory ran its test under the dummy
  variable). The hook, CI and `git rebase -x` start at the root, so the gap
  is a hand-run in `bun/` or `orchestrator/`; a `bunfig.toml` per directory
  would be a list of directories to keep in step, for a path no failure has
  taken (roadmap clarification 11).
- [A hand-run `bun test` inside `git rebase -x` now refuses] → intended; run
  it as `env -u GIT_DIR …` or outside the rebase.
- [Parallel worktrees share one `.git`] → a concurrent `fetch` may fail on a
  ref lock: retry it, never work around it.
- [A worktree lacks `.claude/settings.local.json`] → local permissions do not
  apply there; the tracked settings do.
- [The probe's before-run writes fixture commits into the scratch clone and
  its bare] → both are scratch, deleted after; the credential isolation above
  keeps every push off GitHub.
