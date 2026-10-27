# strip-inherited-git-env

## Why

On 2026-10-26 a subagent started with `isolation: "worktree"` pushed from its
worktree. Git hands a pre-push hook run there an absolute `GIT_DIR`; the hook
passed it to `bun test`, the fixtures' `git remote add` and `push` ran against
the shared `.git`, whose `origin` is the real one, and 198 fixture commits
reached `main` before the user reset it. Only a Safety line of `core/rules.md`
stood between a worktree and that push, and stage 2's target design moves
every subagent into a worktree (its questions 25 and 30, variant а, act once
this card merges). The card is stage 2's slice item 0.

## What Changes

- `.githooks/pre-push` removes from its environment every variable
  `git rev-parse --local-env-vars` names, before any command it runs.
- `bunfig.toml` (new, harness-only) preloads `bun/git-env-guard.ts`, which
  refuses the whole suite before any test file loads while any of those
  variables is set, and names each one. A suite started at the root by hand,
  by `git rebase -x` or by a stale hook then fails loudly instead of writing into
  another repository's `.git`.
- The list of variables is git's own; the harness keeps no copy of it.
- Two decoy tests: the hook with a decoy `GIT_DIR` starts no command that
  inherits it, and the suite under a decoy `GIT_DIR` refuses and leaves the
  decoy's refs and config as they were.
- A live probe, push from a worktree of a scratch clone whose only remote is a
  local bare repository and whose git reads no credentials: fixture commits
  reach the bare before the change, and only the pushed branch after.
- **BREAKING** for whoever runs `bun test` with a repository variable set:
  the suite refuses. `orchestrator/pass.sh` already drops every `GIT_*`, and
  the hook now drops them too.
- Once the probe and both tests pass, in the same pull request (user,
  answer 3 а), under `agent-rulebook`'s *A mechanised prohibition leaves its
  prose home*: `core/rules.md` drops the Safety rule *Push from a
  repository's own checkout, never a `git worktree`* whole, and
  `core/git-and-prs.md`'s *Remove a worktree as soon as its branch is the one
  to push* is reworded. The user accepted the residual risk (2026-10-26): a
  worktree on a branch cut before this change lands runs the old hook with
  no preload (design.md, *The rule leaves whole*).

Not in this change: stripping `GIT_*` in each of the ~159 `Bun.spawn*` calls
the tests make (variant В on the card — a preload cannot reach
`Bun.spawnSync` without `env`, so the refusal replaces it), `.gitignore`
(`.claude/worktrees` is already ignored), and the sub-agent brief and the
memory *Parallel agents in clones*, which the main session moves to
`isolation: "worktree"` after the merge (first command `bun install`, then
`git branch -m <name>`, push with `git push -u origin HEAD`) — neither lives
in this tree. The user already made the main checkout's `core.hooksPath`
relative (answer 2 а), so a worktree runs its own branch's hook.

Order: no `after:`. `work-finish` (merged proposal) also edits
`.githooks/pre-push`, putting `bun bun/push-draft.ts "$@"` first; whichever
applies second keeps this change's line above it (design.md, *The hook's
order*). `judgement-step-record` and `work.ts take` (card
`40439875c31b810d8562f984ab8bc84a`) need nothing from this change to merge;
the skill hook's records name a subagent's branch only once subagents work
in worktrees, after this one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: the pre-push hook drops git's repository variables before
  its checks, and the test suite refuses to start while any is set.

## Impact

- New: `bunfig.toml`, `bun/git-env-guard.ts`, `bun/git-env.test.ts`.
- Changed: `.githooks/pre-push`, `core/rules.md` (one Safety rule out),
  `core/git-and-prs.md` (one bullet reworded), and, while `work-finish` is
  unarchived, its `design.md` sentence citing the rule.
- The suite costs one `git rev-parse` at start.
