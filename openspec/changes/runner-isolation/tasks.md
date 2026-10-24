# runner-isolation — tasks

Six groups, shipped as `feat/runner-isolation-1` to
`feat/runner-isolation-6`, in order. Group 6 holds what the host's bring-up
left open. Groups 1 to 4 are inert on the laptop:
with no launcher or mint command set, the runner runs as it does today.
Group 5 edits the image and host README that `vps-board-loop` group 3 adds,
and starts only once that group has merged. Group 3 needs `ci-run-agent`'s
group 4 merged. Each group writes its failing
cases first and records that they fail against the tree as it stands; cite
each scenario as `// spec: orchestrator/<slug>`. The user acts in
`proposal.md` are no task of this change.

## 1. The session's clone runs through the launcher

Closes `orchestrator` §*The runner runs harness code only from its own
checkout* and §*The runner runs nothing in a session's clone as itself*.

- [x] 1.1 Probe whether `bun --config=<empty file>` stops a `bunfig.toml`
      `preload` in the working directory from loading, and whether
      `--no-env-file` stops its `.env` on bun 1.4.2; record the result
      in `design.md` *Nothing runs as `runner` in a session's clone*. If it
      does not, switch the design to the empty-directory fallback it names
      before 1.3
- [x] 1.2 Write the failing cases in `bun/board-loop-isolation.test.ts`, with
      a stub launcher that logs each command it is handed and a stub
      `claude`: every command whose working directory is the session's
      clone goes through the launcher, and so does one naming it with `-C`
      or `--git-dir`; the trust check reads the session's clone in `agent`'s
      config, so a trusted session clone starts beside an untrusted push
      clone; an edited `node_modules/harness/bun/goal-check.ts` in the
      session's clone is never run; every bun the runner starts carries
      `--config` and `--no-env-file`, so a `bunfig.toml` preload in the tree
      does not load; with no launcher set, a pass runs as today. In
      `orchestrator/pass-pin.test.ts`: the origin lookup in the session's
      clone runs through the launcher; the pass runs the runner's checkout at
      the pin, in the push clone; a pin that moved past the harness clone's
      last fetch is fetched before the checkout; a pin whose part after `#`
      is not a full commit, or that the fetch does not bring, starts no pass,
      naming the value; two repositories whose `<owner>-<repo>` would
      coincide get two push clones
- [x] 1.3 Add the launcher path to `bun/board-loop.ts` and
      `bun/board-loop-session.ts` (`HARNESS_AS_AGENT`, `HARNESS_CLONE`), and
      to `orchestrator/pass.sh` the push clone, the harness checkout at the
      pin read from the push clone's `origin/main`, and the origin lookup in
      the session's clone run through the launcher. Verify with 1.2,
      `orchestrator/pass.test.ts` and `bun test`

## 2. The push from the push clone

Closes `orchestrator` §*The runner pushes from its own push clone, a commit
whose tests passed*.

- [x] 2.1 Write the failing cases in `bun/board-loop-isolation.test.ts`: a
      bundle whose prerequisite is newer than the push clone's `origin/main`
      imports after the push clone's fetch; the push comes from the push
      clone, after the bundle's fetch, for exactly the bundle's tip; a tip
      with no pre-PR record pushes nothing; the push clone runs no hook. In
      the push clone, `HEAD` names the step branch at the bundle's tip
      before the goal check, and the goal check finds the record the
      session's clone made of that tip, written as `agent` in its 0600
      ledger and read through the launcher (those two in
      `bun/goal-check.test.ts`, which runs the check itself)
- [x] 2.2 Add the bundle and push-clone steps to `bun/board-loop-push.ts`,
      the record's top level from `HARNESS_CLONE` and the ledger read through
      the launcher to `bun/goal-check.ts` — for the pre-push check and the
      final one alike, so in launcher mode neither misses the session's
      record. The pass sets no `XDG_STATE_HOME`, so the launcher's `HOME`
      places the ledger (`design.md` *The push*). Verify with 2.1 and
      `bun test`
- [x] 2.3 Add to `core/git-and-prs.md`'s hook rule its one exception, the
      runner's push from its push clone on the host for a commit whose pre-PR
      record names its SHA, and say the same beside `publish()`. Verify by
      reading both back and running `bun test bun/review-docs.test.ts`
- [x] 2.4 Write the failing cases in `orchestrator/pass-pin.test.ts`, where
      the launcher's cases run, then change
      `orchestrator/pass.sh` (`design.md` *Risks*, *The repository is the
      job's*): before the runner's first
      git command each pass rewrites both runner clones' `.git/config` to the
      values `pass.sh` sets at creation (the remote,
      `core.hooksPath` at the empty root-owned directory `design.md` names
      for the push clone) and empties `.git/hooks`, and a clone it
      cannot reset stops the pass, named; the owner and repository come from
      the value `runner` owns, never the session clone's
      `remote.origin.url`, and a session clone whose origin names another
      repository — or a pass with no such value — starts no pass, before any
      clone or pin is read. Verify with those cases and `bun test`

## 3. The CI flow's push

Closes the CI part of `orchestrator` §*The runner pushes from its own push
clone, a commit whose tests passed*.

- [x] 3.1 Carry `design.md` *The CI flow's push* into `ci-run-agent`. Write
      the failing cases in `bun/ci-run.test.ts`: the fix push comes from the
      push clone, for a tip on top of `head_sha` with a passing pre-PR record;
      a tip with none pushes nothing and exits 1 naming it; the fetch with the
      App's token runs in the push clone, and `agent` reads the branch from
      its bundle; every git command in the session's clone goes through the
      launcher. Then change `bun/ci-run.ts`, the fix prompt (run the pre-PR
      check before `fixed`), the note beside `pushRef()`, and every line of
      `ci-run-agent`'s design or the `orchestrator` spec that puts the fetch
      or the push in the session's clone. Verify with those cases and
      `bun test`

## 4. The tokens' reach

Closes `orchestrator` §*The pass reaches GitHub as the App alone*,
§*Only the key holder reads the App's private key* and the App scenario of
§*The wrapper starts the pass with the environment it names*. The host is
App-only (user, 2026-10-23), so the PAT path these tasks first planned,
`HARNESS_GH_TOKEN_FILE`, is not built.

- [x] 4.1 List every `gh` and authenticated call a pass makes, with
      `git grep -n -e '"gh"' -e GH_TOKEN` over `bun/board-loop*.ts`,
      `bun/goal-check.ts` and every module they import (`bun/pull-requests.ts`
      runs the goal check's `gh api` reads), and record in `design.md` *The
      GitHub token's reach* which run unauthenticated; hand
      `readPullRequests()` the mint's token when the mint command is set
- [x] 4.2 Write the failing cases: `pass.sh`'s pass environment holds no
      `GH_TOKEN`, holds the App's id and mint command, and no key path, and
      no value of a token file left on the host; with either App setting
      unset it starts no pass, naming it; it sets `GH_CONFIG_DIR` to an empty
      directory the pass owns, so a `gh` login written into the test's home
      is not found; `readPullRequests()` with the mint command reads with a
      `pull_requests` read token and fails when the mint fails; `mint()` and
      `slug()` with `HARNESS_GITHUB_APP_MINT` run that command and return its
      stdout, with the token in no argument; the mint helper refuses an
      unlisted repository and a permission outside the fixed set, naming
      each; `credentials()` appends after an inherited `GIT_CONFIG_COUNT`
- [x] 4.3 Implement 4.2 in `orchestrator/pass.sh`, `bun/pull-requests.ts` and
      `bun/github-app.ts`, and add the mint helper `bun/github-app-mint.ts`
      and its caller `bun/github-app-minted.ts`. Remove `credentials()`'s
      `shortcut:`. Verify with 4.2, `orchestrator/pass.test.ts` and `bun test`
Task 4.4 moved to 6.1, since `feat/runner-isolation-4` is #239's.

## 5. The host's users

Closes `orchestrator` §*The session user reads no secret file*. Needs
`vps-board-loop` group 3 merged.

- [x] 5.1 Write the failing cases in `orchestrator/layout.test.ts`: the image
      creates `runner`, `agent` and the key holder with fixed uids; sudoers
      holds exactly the two rules `design.md` *Three users* names; its
      `env_keep` equals the session allowlist in `bun/board-loop-session.ts`;
      the mint helper and its repository list are root-owned under
      `/opt/orchestrator`; the image writes no `gh` hosts file into
      `runner`'s home, and installs `jq`; a command run through
      `as-agent` sees `agent`'s `HOME`, `USER` and `LOGNAME` and none of
      `CLAUDE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and
      `XDG_CACHE_HOME`, so `claude` and the trust check read `agent`'s
      `.claude.json`. Done in `orchestrator/users.test.ts`, as `layout.test.ts`
      sits at the 300-line cap; `env_keep` also holds the commit identity and
      the question gate's signal the runner adds, and the repository list is
      root's under `/etc/orchestrator/app/`, where group 4's mint reads it
- [x] 5.2 Add to the image the key holder, the two sudoers rules, the
      launcher `orchestrator/as-agent` and the mint helper's copy, and to
      `orchestrator/README.md` the owner and mode of every secret file, the
      key holder's key file among them. Verify with 5.1 and `docker build`
      where Docker is available. Done, with the forced command handing
      `pass.sh` the launcher, the mint and the App's id, compose mounting the
      App's two directories, the empty hooks directory and `jq`; `docker
      build` is the host's first, since the laptop runs no Docker daemon
- [x] 5.3 Add `orchestrator/reach-check.sh`, which as `agent` tries to read
      every secret file the README provisions and as `runner` the App's key,
      and exits non-zero naming each file it could read. Add it to the host
      README's bring-up, after the secrets are placed. Verify with a test
      that runs it over a temporary directory whose modes it sets
- [x] 5.4 Fix the two cross-user calls group 1 left: `session()` in
      `bun/board-loop-session.ts` signals the session's group with
      `kill(-pid)`, which `runner` cannot send to `agent`'s processes, and
      `pass.sh` stats the session's clone (`[ -d "$dir/.git" ]`) as `runner`.
      Route both through the launcher, with a case each in
      `bun/board-loop-isolation.test.ts` and `orchestrator/pass.test.ts`.
      The fix sits in `session()` itself, so the CI flow's call in
      `bun/ci-run.ts`, which hands it `process.kill`, is stopped the same way
      and a stalled CI session cannot hold the repository's lock. Add a case
      in `bun/ci-run.test.ts` where a direct signal to the session's group is
      refused, as across users: the flow still ends the session, exits, and
      leaves the repository's lock free for the next run. Verify with those
      cases and `bun test`. Done; `pass.sh`'s case sits in `pass-pin.test.ts`
      beside the launcher's others, and the CI flow's shows the leftover child
      ended through the launcher, since one user cannot be refused its own
      group
- [x] 5.5 **User act.** Run `reach-check.sh` on the host after the App key is
      placed, and record its output in the pull request — done 2026-10-24 on
      the host at 7e740f1: `app` 0755 root, `app/id` and `app/repositories`
      0444 root, `app-key` 0700 and `app-key/app.pem` 0400, both the key
      holder's (1502); the check printed `reach-check: no secret file is
      readable as agent, and the App's key not as runner` and exited 0
Task 5.6 moved to 6.2, since `feat/runner-isolation-5` is #243's.

## 6. What the live host left open

The board loop names a step's branch by its group, and groups 4 and 5's
branches are spent on merged pull requests, so the two tasks the bring-up
left open carry here.

- [ ] 6.1 Authenticate the fetches 4.1 found running unauthenticated, the push
      clone's in `pass.sh` and `carry()`'s, with a `contents` read token from
      the mint, held by those processes alone, before a private repository
      joins the loop; a case each that the fetch's environment holds the
      token and the pass's does not. Verify with those cases and `bun test`
- [ ] 6.2 **User decision.** Settle `runner`'s membership of group `agent`:
      `vps-board-loop` added it so `runner` could stat `agent`'s 0750 clones,
      but design.md says `runner` never enters `agent`'s home, and group 5 now
      routes the clone's stat and the session's kill through the launcher.
      Ask the user on the card whether to drop the membership or reword the
      design, then do that before this change is archived; verify with a
      case in `orchestrator/users.test.ts` that asserts the chosen state —
      the runner Dockerfile's `usermod -aG agent runner` present or absent —
      and a pass on the host
