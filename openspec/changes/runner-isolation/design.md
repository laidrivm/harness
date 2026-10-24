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
| `runner` | `pass.sh`, the board loop, the goal check, the push | its own checkout and push clones, the Notion bot's token |
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
`pass.sh` creates either clone the first time it is missing, with `git init`
and an empty `--template`, and fetches the push clone from
`https://github.com/<owner>/<repo>.git` and the harness clone from the remote
the pin names. It leaves the push clone detached at `origin/main`, where the
board loop reads the board state the session's clone fast-forwards to.

### The repository is the job's, never the clone's (group 2)

`<owner>/<repo>` is the second argument the engine's job hands `pass.sh`
(`pass.sh <clone> <owner>/<repo>`), set where the user defines the job, which
no session reaches. On the host, launcher mode refuses a tick without it
(exit 2, as a bad clone name) before it reads anything of the session's
clone. The session's clone's `origin` is still read, through the launcher,
and must name the same repository, case-blind, on `github.com`, where the
push clone fetches and publishes; one that names another repository or
host pauses the pass, naming it, before any runner clone is made or fetched.
The lock key, both runner clones' paths and the push clone's remote all come
from the job's name. The laptop, with no launcher, keeps reading the
repository from its own clone's `origin`.

A root-owned list of clone → repository beside the launcher was the
alternative. Rejected: it is a second place to keep in step with the job,
and the job already names its clone.
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
names (`env_keep`) and the variables the runner adds to them, the commit
identity's four `GIT_AUTHOR_*` and `GIT_COMMITTER_*` names and the question
gate's signal (group 5 found sudo would drop those); a test reads the allowlist
and the gate's name where they are defined and fails on any difference, since
the lists are one set of names looked up in two systems (`rules.md` Code). The
user-bound names among them would still carry `runner`'s values, so the
launcher sets `HOME`, `USER` and `LOGNAME` to `agent`'s and unsets
`CLAUDE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME`
before it executes: `claude` and the trust check below then read `agent`'s own
configuration. `XDG_STATE_HOME` passes; the pass sets none (*The push*), so
the session's ledger is `agent`'s default.

The kernel refuses `runner` a signal to `agent`'s processes, so with a launcher
`session()` signals the session's group as `agent`, through the launcher
(`kill` in `sh`), whatever `kill` its caller hands it: the CI flow's call ends
the same way, and a session left running past its limit cannot hold the
repository's lock. The launcher's sudo rule runs with `!use_pty`, so the
command stays in the process group the runner started; only the root-owned
sudo is then outside `agent`'s reach, and it ends with its command. The signal
runs from `/`, not the clone, since a session may remove its clone while a
child of it runs on; only a `kill` that finds no such process reads as a
group gone, by its message in the C locale, which dash and bash both print.
Any other refusal, EPERM included, and a launcher that fails before `kill`
runs, or stalls past its 3 s bound, read as one still alive: EPERM through
the launcher means only members `agent` cannot signal are left, the
root-owned sudo for the moment it outlives its command, or a member that
changed user, so the wait polls on and the pass names what remains as left
rather than judging. Each signal is spawned, not run synchronously, and
abandoned unawaited at its bound: its direct child is the setuid sudo, which
`runner` may be unable to signal at all, so a synchronous call's timeout could
not end it and would stop the loop and every timer with it. The
10 s wait for the group is kept by the clock, since each check may take that
bound. `pass.sh` checks that the named clone is
one through the launcher too.

On the host the forced command hands `pass.sh` the launcher, the mint command
and the App's id, read per call from `/etc/orchestrator/app/id`, so a pass
before the App's files are placed refuses, naming the setting. The image holds
the empty root-owned `/opt/orchestrator/hooks` the reset needs and `jq`, which
reads the pin.

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
the goal check reads that ledger through the launcher as `agent`, never as
`runner`, resolving the state directory in `agent`'s shell by
`stateDir()`'s rule, and takes the clone's top level as `agent`'s `pwd -P`
there. The pass sets no `XDG_STATE_HOME` (`env -i`), so the launcher's
`HOME` alone places the session's ledger and the check's read of it; group 2
dropped the fixed `/home/agent/.local/state` this paragraph first named, a
host path that would hold the same file. It still refuses a tip
without a passing record, the pre-push check and the full one after the push
alike. Only then does the runner push the SHA it checked. The bundle goes to
the runner over the launcher's stdout, into a file of the runner's, so
`agent` needs no directory the runner reads.

The push clone is created with an empty `--template` and its
`core.hooksPath` set to an empty root-owned directory, so no hook runs.
`core/git-and-prs.md` forbids exactly that override; the user approved one
exception (decision 1a): the runner's push from its push clone on the host,
for a commit whose pre-PR record names its SHA. The tests did run, as `agent`
before the bundle, and CI runs them again on the pull request.

Leaving the hook on and stripping the tokens from its environment was weighed
and rejected: the hook would still run as `runner`, which reads the Notion
token file from disk and starts the mint command.

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
  `<head_sha>` is its ancestor) and then asks for a passing pre-PR record the
  session's clone made of the tip. The flow knows no change or step for the
  goal check's `--before-push` form, so it reads the record as that check
  does, with `ranUnder()` in `gate-ledger.ts`, which both call (apply,
  2026-10-22). The fix prompt therefore asks the session to run the pre-PR
  check before it answers `fixed`; a tip without a record pushes nothing, and
  the flow exits 1 naming it.
- The push clone is `pass.sh`'s, `<PASS_PUSH>/<owner>/<repo>`, which the
  flow shares under the same repository lock. The bundle for `agent` sits
  beside the run's log, where `agent`'s group already reads, and goes with it.
- The push runs no hook and no force, from the push clone, as the board
  loop's does. The tree check after the session runs as `agent` through the
  launcher.

Task 3.1 carries this into `ci-run-agent`'s code and text once that change's
group 4 has merged.

### The GitHub token's reach

The host is App-only (the user's decision of 2026-10-23, `vps-board-loop`
*Decisions*), so `pass.sh` reads no token file of the user's and has no
branch for one. Decision 2(a), widened on 2026-10-22 to the PAT on the push
and the pull-request reads, planned that branch for a host with no App. None
remains: `pass.sh` runs on the host alone, which the Windmill job calls, and
the laptop runs `board-loop.ts` itself with the user's own `gh` login. A
wrapper with the App's id or its mint command unset starts no pass, naming the
setting, so before group 5 provisions the key holder every pass there pauses.

`pass.sh` exports no GitHub token. It hands the pass the App's id and the mint
command, never a key path, and points `GH_CONFIG_DIR` at an empty directory
the pass owns and removes after it, since `gh` with no `GH_TOKEN` falls back to
a login stored in `~/.config/gh/hosts.yml`, and one left in `runner`'s
persistent home would hand the whole pass a token again.

What a pass sends to GitHub (task 4.1, `git grep -n -e '"gh"' -e GH_TOKEN` over
`bun/board-loop*.ts`, `bun/goal-check.ts` and their imports):

| Call | Where | Credential |
|---|---|---|
| the App's slug | `identity()` before any session | the mint's `--slug` |
| `GET /users/<slug>[bot]` | `identity()` | none: a public read |
| the branch's pull requests | `readPullRequests()`, the selection and the full check | a `pull_requests` read token minted for that read alone |
| the push, `gh pr create`, the full check | `publish()` | a `contents` and `pull_requests` write token minted after the stage session |
| `git fetch` of the push clone and of the harness pin | `pass.sh`, `carry()` | none |

The fetches run unauthenticated, which a private repository refuses: task 4.4
mints a `contents` read token for them before the private repository moves
to the loop.

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
runs that command, which names sudo itself, and reads the token from its
stdout, and no key path is needed in the runner's environment. `configured()`
then needs the App's id and the mint command, not `HARNESS_GITHUB_APP_KEY`.
`slug()` asks the same command with `--slug`, since `GET /app` takes the JWT
only the key signs. The helper is `bun/github-app-mint.ts`; the call both
`github-app.ts` and `readPullRequests()` make is `bun/github-app-minted.ts`.
The helper reads the App's id and the repository list from root's
`/etc/orchestrator/app/`, and the key from `/var/lib/orchestrator-key/`, the
key holder's; group 5 provisions all three. Compose mounts both directories
read-only from the host's `orchestrator/app/` and `orchestrator/app-key/`,
which keep their host owners as the secret files do, and which git ignores.
The mint is `/opt/orchestrator/mint`, a root-owned wrapper that runs the
image's copy of `bun/github-app-mint.ts` from `/` with the runner's bun flags,
and the key holder (uid 1502) has no login shell.

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
  remote, `core.hooksPath` at the empty root-owned directory) and empties
  `.git/hooks`, with every `GIT_*` variable it inherited unset first, since
  one such as `GIT_CONFIG_COUNT` outranks a clone's config; it stops
  naming the clone if either cannot be reset, and stops when the hooks
  directory (`PASS_HOOKS`, `/opt/orchestrator/hooks`) is missing or not
  empty. Group 2 does this.
- [`pass.sh` took the owner and repository from `remote.origin.url` in the
  session's clone, which `agent` writes, so a session could point the next
  pass's push clone and harness pin at a repository of its own.] → Group 2
  takes them from the repository the engine's job names (*The repository is
  the job's*) and pauses on a session clone whose origin names another.
- [The mint helper moves only when the image is rebuilt.] → Its pin note says
  so, as every image pin's does.
- [Two lists of variable names, in the code and in sudoers.] → The test above.

## Migration Plan

Lands in five groups: the launcher, the push, the CI flow's push, the tokens'
reach and the host's users. Groups 1 to 4 change the code and `pass.sh`, and
are inert on the laptop. Group 5 changes the image and README that
`vps-board-loop` group 3 adds, and needs it merged. The App key goes on the
host only after group 5. Rollback: unset `PASS_AS_AGENT` and
`HARNESS_AS_AGENT`, and the runner runs in the session's clone as before; the
App's id and the mint command stay, since the host reaches GitHub through
nothing else.
