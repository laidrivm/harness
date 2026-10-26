# strip-inherited-git-env — tasks

One group, one pull request: `feat/strip-inherited-git-env`. Each failing
case first, its failure recorded, cited as `// spec: commit-gates/<slug>`;
the numbers in brackets are the proposal-stage `/zombies` run's ideas. Every
case runs from a shell with none of git's repository variables set, and
every spawn carries an explicit timeout. `wc -l` every file before adding to
it; the 300-line cap applies to `bun/git-env.test.ts` as to any other.

## 1. Drop git's repository variables in the hook, refuse them in the suite

- [ ] 1.1 Failing hook cases in `bun/git-env.test.ts`, running
      `.githooks/pre-push` from an empty temporary directory with a stub
      `bun` first on `PATH` that appends its environment to a file and exits
      0: no repository variable set, the stub runs and the hook exits 0 [1];
      `GIT_DIR` naming a temporary repository's linked worktree, no recorded
      call holds it [2]; `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_CONFIG_COUNT` and
      `GIT_OBJECT_DIRECTORY` naming a decoy, no recorded call holds any [3];
      `GIT_PREFIX` set empty, no call holds it [4]; the decoy's refs and
      config are byte-for-byte as before [5]. Record which fail on the hook
      as `origin/main` holds it. Then add `unset $(git rev-parse
      --local-env-vars)` right after `set -euo pipefail`, above every
      command — above `bun bun/push-draft.ts "$@"` too if `work-finish`'s
      group 1 merged first (design.md, *The hook's order*). Verify with
      `bun test bun/git-env.test.ts bun/pre-pr.test.ts`
- [ ] 1.2 Failing suite cases in `bun/git-env.test.ts`, each spawning a child
      `bun test bun/tracked.test.ts` from the repository's root: `GIT_DIR`
      naming a decoy with no remote exits non-zero and names `GIT_DIR` on
      stderr [6]; that run reports no test run, and the decoy's refs and
      config are as before [7]; `GIT_DIR` and `GIT_INDEX_FILE` together,
      both named [8]; `GIT_PREFIX` set empty refuses [9]; `GIT_EDITOR` alone
      runs the file and exits 0 [10]; a `PATH` with no `git` refuses, naming
      the failed read [11]. Record the failures — with no preload, case [6]
      runs the file against the decoy, which has nowhere to push. Then write
      `bun/git-env-guard.ts` (read the list with `git rev-parse
      --local-env-vars`, name every variable present, `process.exit(1)`
      before any test file loads) and a new `bunfig.toml` holding only `[test]
      preload = ["./bun/git-env-guard.ts"]`. Verify with `bun test
      bun/git-env.test.ts bun/sync-bunfig.test.ts bun/test-retry.test.ts`,
      then the whole `bun test` from a shell with no repository variable
- [ ] 1.3 The live probe, `push from a worktree` [12], never in the main
      checkout or a clone with a GitHub remote. In the scratchpad: a bare
      clone of this repository, a clone of that bare whose `git remote -v`
      names the bare alone, `core.hooksPath=.githooks`, a `git worktree add`
      of `origin/main` and `bun install` in it. Every git and `gh` command of
      the probe runs with `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL`
      naming a scratch file that rewrites `https://github.com/`,
      `ssh://git@github.com/`, `git@github.com:` and `git@GitHub.com:` to a
      missing path through `url.<path>.insteadOf`, `GIT_TERMINAL_PROMPT=0`,
      none of `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN` and
      `GITHUB_ENTERPRISE_TOKEN`, and `GH_CONFIG_DIR` an empty directory (design.md, *The
      probe*). Before: push a probe branch from the worktree on
      `origin/main`'s hook, and list the bare's refs and commits beyond
      that branch — fixture commits expected. After: a fresh bare and clone
      as before, the worktree on this branch, the same push — only the probe
      branch expected. Put both listings in the pull request's body, then
      delete the scratch repositories
- [ ] 1.4 With 1.1–1.3 passing, under `agent-rulebook`'s *A mechanised
      prohibition leaves its prose home*: delete the Safety rule *Push from
      a repository's own checkout, never a `git worktree`* from
      `core/rules.md` whole — the user rejected a shortened form and accepted
      the residual risk (design.md, *The rule leaves whole, and the residual
      risk is accepted*); reword `core/git-and-prs.md`'s *Remove a worktree
      as soon as its branch is the one to push* to *once its branch is
      pushed*, keeping its reason; and, while
      `openspec/changes/work-finish/` is unarchived, reword its `design.md`
      "a worktree's is the trap `core/rules.md` names" so it cites no rule.
      Grep `core/`, `README.md`,
      `openspec/specs/` and the active changes for "own checkout",
      "never a `git worktree`" and "push from a worktree", and reconcile
      each site. Verify with `bun test bun/delegation.test.ts
      bun/autonomy.test.ts bun/sync.test.ts`, which read the rulebook
