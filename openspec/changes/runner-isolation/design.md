# runner-isolation — design

## Context

See proposal.md, *Why*. The recon on the card found five paths by which the
runner executes what a session can write:

1. `pass.sh` runs `node_modules/harness/bun/board-loop.ts` from the session's
   clone, and the judge copy of the goal check comes from that
   `node_modules` too (`bun/board-loop.ts`, "the pinned copy"). It is
   gitignored, so no review sees an edit.
2. The runner's git reads the clone's `.git/config` (`core.fsmonitor`,
   `core.hooksPath`, filter drivers) and its hooks.
3. `publish()` (`bun/board-loop-push.ts`) pushes with the App's token in
   `process.env`, and the pre-push hook runs the branch's `bun test`.
4. A consumer's `bunfig.toml` can `preload` a file from the branch.
5. `pass.sh` exports the user's PAT (`GH_TOKEN`) to the whole pass.

The user settled the card on 2026-10-21, after asking for the options' pros
and cons in a session: decisions 1(a), 2(a), the key holder now, and Remote
Control as `runner`. They are fixed here.

## Goals / Non-Goals

**Goals:** on the host, no command runs as `runner` that a session could have
written, and no process but the key holder's reads the App's key.

**Non-Goals:** see proposal.md. The laptop keeps its one-user model: with no
launcher configured, the runner runs as it does today.

## Decisions

### Three users

| User | Runs | Reads |
|---|---|---|
| `agent` | the pick and stage sessions, git in its clones, the bundle | its clones, the Claude Code token (the session's by necessity), the Notion MCP login |
| `runner` | `pass.sh`, the board loop, the goal check, the push, Remote Control | its own checkout and push clones, the PAT file, the Notion bot's token, its claude.ai login |
| key holder | the mint helper alone | the App's private key |

`runner` may start exactly two commands as another user, both root-owned:
`/opt/orchestrator/as-agent` as `agent` and `/opt/orchestrator/mint` as the
key holder. Nothing may start a command as `runner`. `setpriv` was the other
candidate for the first; it changes the uid only for a caller holding
`CAP_SETUID`, which `runner` must not, so `sudo` with one rule per command
it is, and the code that starts a session as `agent` is owned by this change.

### The runner's own harness checkout

`pass.sh` keeps a clone of the harness at `~runner/harness` and a push clone
per repository at `~runner/push/<owner>/<repo>`, two segments, since a hyphen
inside an owner or a repository name would make a joined `<owner>-<repo>`
name two repositories. Each pass it fetches the push clone, reads
`devDependencies.harness` from `origin/main:package.json` with `git show` and
`jq` (`github:laidrivm/harness#<commit>`), takes the part after `#`, fetches
that commit into the harness clone from the harness's own remote, and checks
the clone out detached at it, forced and cleaned. A part that is not exactly
40 lowercase hex characters, or a commit the fetch does not bring, starts no
pass and is named in the stop file.
The board loop, the goal check and `github-app.ts` import only `node:` and
`bun:` modules, so the checkout needs no install. The judge copy is that
checkout's `goal-check.ts`.

Copying the harness into the image was the alternative. Rejected: the image's
copy would move only on a rebuild, apart from the pin the repository's own
`main` holds.

### Nothing runs as `runner` in a session's clone

With `HARNESS_AS_AGENT` set (by `pass.sh`), the board loop starts every
command whose working directory is the session's clone through that launcher:
`claude`, and git (the fast-forward, the branch reads, the bundle). sudo resets
the environment, so the sudoers entry keeps exactly the session allowlist's
names (`env_keep`); a test reads both and fails on any difference, since the
two lists are one name looked up in two systems (`rules.md` Code).

The board loop runs with the push clone as its working directory and names
the session's clone in `HARNESS_CLONE`. Every bun process the runner starts
gets `--config` naming an empty root-owned file, so no `bunfig.toml` in a
working directory loads. Task 1.1 probes that `--config` replaces the
working directory's file rather than adding to it. If it does not, the
runner runs bun from an empty directory and points git at the push clone with
`GIT_DIR` and `GIT_WORK_TREE`.

### The push

After a stage session, `agent` writes `git bundle create` of the step branch,
excluding `origin/main`, into a directory `runner` can read. `runner` fetches
the bundle into its push clone: a bundle carries objects and refs, never
config or hooks. The runner then checks out the step branch at the bundle's
tip with `git checkout -f -B <branch> <tip>`, so `HEAD` names that branch and
holds exactly that commit, which `--before-push` reads both of. The goal check
runs `--before-push` there. Today it matches a pre-PR record by commit and by
the checkout's top level, and the record was made in the session's clone, so
with `HARNESS_CLONE` set it matches the top level against that clone's path
instead; the SHA is the same, since a bundle keeps it. It still refuses a tip
without a passing record. Only then does the runner push the SHA it checked.

The push clone is created with an empty `--template` and its
`core.hooksPath` set to an empty root-owned directory, so no hook runs.
`core/git-and-prs.md` forbids exactly that override; the user approved one
exception (decision 1a): the runner's push from its push clone on the host,
for a commit whose pre-PR record names its SHA. The tests did run, as `agent`
before the bundle, and CI runs them again on the pull request.

Leaving the hook on and stripping the tokens from its environment was weighed
and rejected: the hook would still run as `runner`, which reads the PAT and
Notion token files from disk.

### The CI flow's push

`ci-run-agent`'s fix push (`bun/ci-run.ts`, through `pushRef` and `over` in
`bun/board-loop-push.ts`) is the runner's second push, and decision 1a covers
it the same way. Its design on `main` fetches the pull request's branch as the
App, checks the tree and pushes, all in the session's clone as `runner`. Under
this change:

- `runner` fetches the branch as the App into its push clone and bundles it
  for `agent`, which fetches the bundle into its clone through the launcher.
  The App's token never enters the session's clone or `agent`'s environment.
- After a `fixed` answer, `agent` bundles the branch, excluding `<head_sha>`;
  `runner` fetches it into the push clone and checks the branch out at the
  tip with `git checkout -f -B`.
- There it applies the flow's own rule (`HEAD` is not `<head_sha>`, and
  `<head_sha>` is its ancestor) and then `--before-push`, which needs a
  passing pre-PR record the session's clone made of the tip. The fix prompt
  therefore asks the session to run the pre-PR check before it answers
  `fixed`; a tip without a record pushes nothing, and the flow exits 1 naming
  it.
- The push runs no hook and no force, from the push clone, as the board
  loop's does. The tree check after the session runs as `agent` through the
  launcher.

Task 1.5 carries this into `ci-run-agent`'s code and text once that change's
group 4 has merged.

### The GitHub token's reach

`pass.sh` exports no GitHub token. With no App configured it passes the PAT
file's path, `HARNESS_GH_TOKEN_FILE`, and `publish()` reads it only for the
push, the `gh pr create` and the check that reads the pull request after it,
handing the value to those processes' environments alone. With the App
configured `pass.sh` passes no path, and its secret check (`vps-board-loop`
step 4) neither requires nor opens `gh_token`, so an App-only host holds no
PAT file at all. `pass.sh` also points `GH_CONFIG_DIR` at an empty directory
the pass owns, since `gh` with no `GH_TOKEN` falls back to a login stored in
`~/.config/gh/hosts.yml`, and one left in `runner`'s persistent home would
hand the whole pass a token again; the provisioned home holds no such file
either. Any other `gh` call in the pass therefore runs unauthenticated; task
2.1 lists them.

### The key holder

The App's key file is owned by the key holder, mode 0400, in a directory of
its own the key holder owns, outside `orchestrator/secrets`, whose 0500
`runner`-owned directory would keep the key holder out. The mint helper is
`github-app.ts`'s `mint()` copied into the image, root-owned: the key holder
must not run code `runner` can write, so it never runs the runner's checkout.
It takes `<owner>/<repo>` and the permissions as arguments, refuses a
repository its root-owned list does not name and any permission outside
`contents`, `pull_requests`, `statuses` (write) and `actions`, `checks`
(read), and prints the token on stdout. Installation tokens last an hour.

`github-app.ts` gains one branch: with `HARNESS_GITHUB_APP_MINT` set, `mint()`
runs that command through sudo and reads the token from its stdout, and no
key path is needed in the runner's environment. `configured()` then needs the
App's id and the mint command, not `HARNESS_GITHUB_APP_KEY`.

The user first chose (a), a later card, then answered the Remote Control
follow-up with "Это делаем сразу": with Remote Control as `runner`, the key
must not be `runner`'s. The later, more specific answer stands.

### Remote Control as `runner`

The login, the server and the login check run as `runner`, in a clone of
`runner`'s own kept for that use, never the harness checkout or a push clone
the passes run from. A phone session therefore reaches what `runner` reaches:
the PAT file, the Notion bot's token, the mint helper, and the runner's
clones. It never reaches the App's key. The user accepted this for a phone
session with everything at hand (2026-10-21); the worst case is a set of
tokens the user can revoke, not the key.

### `GIT_CONFIG_COUNT`

`credentials()` reads the count it was started with and appends its header at
that index, instead of setting the count to 1. This removes its `shortcut:`.

## Risks / Trade-offs

- [A session can append a forged pre-PR record, and the push trusts it.] →
  The card *Let only the runner write the gate ledger a session's tests are
  judged by*. Until then CI fails an untested pull request.
- [A phone session as `runner` can leave config in `runner`'s clones that a
  later pass runs.] → It runs with `runner`'s reach, which the phone session
  already had; the key stays out. The passes re-check out the harness clone
  forced and cleaned each time.
- [The mint helper moves only when the image is rebuilt.] → Its pin note says
  so, as every image pin's does.
- [Two lists of variable names, in the code and in sudoers.] → The test above.

## Migration Plan

Lands in three groups. Groups 1 and 2 change the code and `pass.sh`, and are
inert on the laptop. Group 3 changes the image and README that
`vps-board-loop` group 3 adds, and needs it merged. The App key goes on the
host only after group 3. Rollback: unset `HARNESS_AS_AGENT` and the mint
command, and the runner runs as it does today.
