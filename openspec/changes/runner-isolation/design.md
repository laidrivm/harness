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
| `runner` | `pass.sh`, the board loop, the goal check, the push | its own checkout and push clones, the PAT file, the Notion bot's token |
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
`pass.sh` creates either clone the first time it is missing, fetches from the
remote the pin names (`https://github.com/<owner>/<repo>.git`), and leaves
the push clone detached at `origin/main`, where the board loop reads the board
state the session's clone fast-forwards to.
The board loop, the goal check and `github-app.ts` import only `node:` and
`bun:` modules, so the checkout needs no install. The judge copy is that
checkout's `goal-check.ts`.

Copying the harness into the image was the alternative. Rejected: the image's
copy would move only on a rebuild, apart from the pin the repository's own
`main` holds.

### Nothing runs as `runner` in a session's clone

With `HARNESS_AS_AGENT` set (by `pass.sh`), the board loop starts every
command whose working directory is the session's clone through that launcher:
`claude`, and git (the fast-forward, the branch reads, the bundle). The
variable holds the launcher's words, split on spaces (`sudo -n -u agent
/opt/orchestrator/as-agent` on the host), and a command runs as
`<words> <clone> <command…>`: the launcher enters the clone and executes the
rest, since the runner itself may not enter `agent`'s home. sudo resets
the environment, so the sudoers entry keeps exactly the session allowlist's
names (`env_keep`); a test reads both and fails on any difference, since the
two lists are one name looked up in two systems (`rules.md` Code). The
user-bound names among them would still carry `runner`'s values, so the
launcher sets `HOME`, `USER` and `LOGNAME` to `agent`'s and unsets
`CLAUDE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME`
before it executes: `claude` and the trust check below then read `agent`'s own
configuration. `XDG_STATE_HOME` passes, since the pass sets it to `agent`'s.

The board loop runs with the push clone as its working directory and names
the session's clone in `HARNESS_CLONE`. Every bun process the runner starts
gets `--config=/dev/null` and `--no-env-file`, so no
`bunfig.toml` or `.env` in a working directory loads. Task 1.1 probed both on
bun 1.4.2 (2026-10-22): `--config=<empty file>` replaces the working
directory's file, so neither its top-level nor its `[test]` `preload` loads
under `bun <file>` or `bun test`, and `--no-env-file` keeps a `.env` out of
both, the flags placed before or after `test`. The fallback, running bun from
an empty directory with git pointed at the push clone through `GIT_DIR` and
`GIT_WORK_TREE`, is therefore not needed. The workspace trust check reads the session's
clone (`HARNESS_CLONE`) in `agent`'s Claude Code configuration, read
through the launcher, since
`claude` runs there as `agent`, never the push clone in `runner`'s.

### The push

After a stage session, `agent` writes `git bundle create` of the step branch,
excluding `origin/main`, into a directory `runner` can read. `runner` first
fetches `origin` in its push clone, so the bundle's prerequisite, the
session's `origin/main`, is there even when `main` moved during the session,
then fetches the bundle: a bundle carries objects and refs, never config or
hooks. The runner then checks out the step branch at the bundle's
tip with `git checkout -f -B <branch> <tip>`, so `HEAD` names that branch and
holds exactly that commit, which `--before-push` reads both of. The goal check
runs `--before-push` there. Today it matches a pre-PR record by commit and by
the checkout's top level, and the record was made in the session's clone, so
with `HARNESS_CLONE` set it matches the top level against that clone's path
instead; the SHA is the same, since a bundle keeps it. The record sits in
`agent`'s ledger, which `gate-ledger.ts` keeps 0600 in a 0700 directory, so
the pass sets the session's `XDG_STATE_HOME` to `/home/agent/.local/state`
(`env -i` drops it otherwise) and the goal check reads that ledger through
the launcher as `agent`, never as `runner`. It still refuses a tip
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

Task 3.1 carries this into `ci-run-agent`'s code and text once that change's
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
4.1 lists them. One needs a credential on a private repository:
`readPullRequests()`, which the board loop's selection and the goal check
call. With the App configured it gets a token from the key holder's mint;
without the App it reads the PAT from `HARNESS_GH_TOKEN_FILE` for that call
alone, handing the value to that process's environment, never to the pass.
The user widened decision 2(a) to this on 2026-10-22, since a private
repository is planned soon and an unauthenticated read cannot see its pull
requests.

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
must not be `runner`'s. The later, more specific answer stands. On
2026-10-22 the user moved Remote Control off `runner` (below); the key
holder stays, since `runner`'s own code and its dependencies still run
beside every token `runner` reads.

### Remote Control is the user's root session (user, 2026-10-22)

No user this change fixes runs Remote Control. It replaces the 2026-10-21
plan, a standing server as `runner` in a clone of its own, with a session the
user starts by hand over ssh as root and ends when done (`vps-board-loop`
*The emergency session*). Its login is a file in root's home, refreshed by
hand. While it runs it reaches every secret on the host, the App's key
included; the user accepts that for the emergency path, which nothing starts
on its own. The three users above, and the reach check, cover the automated
flows alone.

### `GIT_CONFIG_COUNT`

`credentials()` reads the count it was started with and appends its header at
that index, instead of setting the count to 1. This removes its `shortcut:`.

## Risks / Trade-offs

- [A session can append a forged pre-PR record, and the push trusts it.] →
  The card *Let only the runner write the gate ledger a session's tests are
  judged by*. Until then CI fails an untested pull request.
- [The root session can leave config in `runner`'s clones that a later pass
  runs.] → A forced checkout leaves `.git/config` and `.git/hooks` as they
  are, so before any runner-side git command each pass rewrites both
  clones' `.git/config` to the values `pass.sh` sets at creation (the
  remote, `core.hooksPath=/dev/null`) and empties `.git/hooks`; it stops
  naming the clone if either cannot be reset. The group that adds the
  bundle push carries the task and its case.
- [`pass.sh` takes the owner and repository from `remote.origin.url` in the
  session's clone, which `agent` writes, so a session could point the next
  pass's push clone and harness pin at a repository of its own.] → Group 2
  takes them from a value `runner` owns instead — the repository the engine's
  job names — and refuses a session clone whose origin names another. Until
  then launcher mode stays unset, as it is until group 5.
- [The mint helper moves only when the image is rebuilt.] → Its pin note says
  so, as every image pin's does.
- [Two lists of variable names, in the code and in sudoers.] → The test above.

## Migration Plan

Lands in five groups: the launcher, the push, the CI flow's push, the tokens'
reach and the host's users. Groups 1 to 4 change the code and `pass.sh`, and
are inert on the laptop. Group 5 changes the image and README that
`vps-board-loop` group 3 adds, and needs it merged. The App key goes on the
host only after group 5. Rollback: unset `PASS_AS_AGENT`, `HARNESS_AS_AGENT`
and the mint command, and the runner runs as it does today.
