## Context

Stage 2.5 of the roadmap (page *Этап 2.5. Короткий путь на VPS*,
`6ddee4d50e7346c397620d7838550f17`, steps 3, 4, 6, 7 and 10) runs one
persistent Claude Code session in the `runner` container: tmux session `main`
as `agent`, in the clone `/home/agent/harness`, reached through Remote
Control. The old path (Windmill → `pass.sh` → board loop, and the CI flow's
webhook) is switched off in Windmill (step 2) and removed at stage 7; until
then it is built and keeps passing its tests.

The image today (`orchestrator/runner/Dockerfile`): `oven/bun:1.4.2-debian`,
git, gh 2.97.0, Claude Code 2.1.308, openspec, sshd; `node` is a symlink to
bun; no tmux, `actionlint` or `gitleaks`. The entrypoint writes runner's
`authorized_keys` and execs sshd. `/etc/gitconfig` holds the credential
helper `gh auth setup-git` wrote at build. sudoers holds two rules, both
runner's. The spec forbids any tracked file but the README to start Remote
Control (`remoteControl()` in `orchestrator/layout.ts`), lets only runner
ask the key holder, and keeps every secret out of the session user's reach.

The explore of 2026-11-02 on card `40c39875c31b8116879bec24abbba0ba`, with the
mint card merged into it, is the plan this design records.

## Goals / Non-Goals

**Goals:**

- The image carries tmux, a real Node, `actionlint`, `gitleaks` and a current
  Claude Code, so the session's pre-push hook runs what the laptop's runs.
- The container starts `main` and keeps `claude --remote-control` running in
  it, pulling and installing before each start.
- The session's `gh` and git reach GitHub as the App at any hour, with no
  stored token and no background process (decision 40 б).

**Non-Goals:**

- The deploy timer, the fresh-session mark, managed settings, the rollback
  and the failure file: host-deploy (below, *Seams*).
- The Ponytail plugin and its variable, Notion's settings file, the clone's
  setup and the session's rules (`orchestrator/runner/session-rules.md`,
  installed as `/etc/claude-code/CLAUDE.md`): stage page steps 5, 6 and 9.
- Restoring decision 6's token isolation: a card after the roadmap.
- Removing the old path: stage 7.

## Decisions

### Every start is a new conversation (user, 02.11, answer 1 a)

The loop never passes `--continue`. A crash, `/exit`, `docker compose
restart runner` and a deploy all give a clean session; the card's state is
in Notion and GitHub, and the session reads it back with `work.ts take`. The
stage's criterion «survives `restart runner`» reads as «`main` is back and
Remote Control reconnects to it», not «the same conversation». Continuing
would let a deploy resume a conversation the user had cleared, and would
need host-deploy's fresh-session mark to fire on a resumed session too.

### The start script, `orchestrator/runner/session.sh`

Copied to `/opt/orchestrator/session.sh`, root's, 0755. Its loop:

1. With `$HOME/harness/.git` present, a directory or a worktree's file,
   `cd` there and run
   `git pull --ff-only`, then `bun install --frozen-lockfile`, both always;
   each failure prints `session: <step> failed; starting claude anyway`.
   A failed pull leaves the old tree; a failed install after a good pull
   leaves the dependencies the last good install wrote. With no clone, `cd
   "$HOME"`, so the user can log in before stage step 6 makes the clone.
   A failed `cd` never exits: ending the script ends `main`, which nothing
   restarts but the container (local review).
2. `claude --remote-control` with the fixed name `harness`, in the form the
   pinned release takes (verified at apply with `claude --help`).
3. `sleep 5`, and again from 1.

It exports `GIT_TERMINAL_PROMPT=0`, so a failed credential fails the pull
instead of waiting on a prompt nobody sees, and `DISABLE_AUTOUPDATER=1`, so
the pin cannot drift into `~/.local` (the pass's wrapper sets the same), and
`LANG=C.UTF-8`, the pass's locale, since the container sets none (local
review). It sets no `CLAUDE_CODE_OAUTH_TOKEN`: Remote Control needs the full
login.

The clone path is `$HOME/harness` rather than a variable, so the test runs it
with a temporary `HOME` and stubs `git`, `bun`, `claude` and `sleep` on
`PATH`, with no override the session could also set.

### The entrypoint starts `main` before sshd

After the `authorized_keys` lines and before `exec "$@"`:
`runuser -u agent -- tmux new-session -d -s main /opt/orchestrator/session.sh`.
`runuser` without `-l` sets agent's `HOME`, `USER` and `LOGNAME` and keeps
the container's other variables, so the commit identity reaches the session.
tmux uses agent's default socket, which host-deploy's `tmux has-session -t
main` reads. A tmux that cannot start fails the entrypoint under `set -e`,
and `restart: unless-stopped` retries it, visibly in `docker compose ps`.

shortcut: PID 1 stays sshd, so a tmux server that dies is not restarted
until the container is; upgrade to a supervisor when that is seen.

### `remoteControl()` names exactly two files

The check allows `orchestrator/README.md` and `orchestrator/runner/session.sh`
and refuses every other tracked file, so a second starter needs a spec
change.

### The gh wrapper at `/usr/local/bin/gh`

The release's `gh` moves to `/usr/local/libexec/gh/gh`; the wrapper (sh,
root's, 0755) takes its place. One path serves the session, the hooks from
`node_modules/harness`, `work.ts` and `docker compose exec`, with no `PATH`
edit.

- `GH_TOKEN` set and non-empty: `exec` the real gh. `readPullRequests()` and
  the pass set their own narrow token, and keep it.
- Caller other than `agent`: `exec` the real gh. runner's `gh` calls stay as
  *The pass reaches GitHub as the App alone* describes — a call with no token
  runs unauthenticated — although runner holds the same sudo rule.
- Otherwise:
  `sudo -n -u keyholder /opt/orchestrator/mint laidrivm/harness contents=write pull_requests=write checks=read actions=read statuses=read workflows=write`
  (decision 39 б; every pair is in the mint's fixed set). A non-zero mint
  exits the wrapper with that status, gh unrun; the mint's stderr passes
  through. A mint that exits 0 with no token exits the wrapper 1, as
  `minted()` refuses one (local review). Otherwise `GH_TOKEN=<token> exec`
  the real gh: the token is in that process's environment and nowhere else.

shortcut: the repository is fixed to `laidrivm/harness`, the one board of
stage 2.5; derive it from `origin` when the session takes D2ASS or mellon.

For its test the wrapper reads `GH_WRAPPER_REAL`, `GH_WRAPPER_MINT` and
`GH_WRAPPER_USER`, defaulting to the image's paths and `agent`, as
`reach-check.sh` reads its `REACH_*`. Setting them gains nothing: agent can
only run a command as itself or skip the mint, and runner already holds the
rule.

The test pins the wrapper's permissions against the mint's `ALLOWED`, which
`bun/github-app-mint.ts` exports for it, since a pair outside it is refused
only at run time, on the host.

### git's credential helper names the wrapper

The image writes `/etc/gitconfig` with `git config --system`:
`credential.https://github.com.helper` set to empty and then to
`!/usr/local/bin/gh auth git-credential`, the two lines `gh auth setup-git`
writes, but naming the wrapper; `setup-git` would write the path of the real
gh. A test reads the line. runner's git reaches the wrapper too and passes
through unauthenticated; the pass pushes with its own extraheader, as today.

shortcut: git asks the helper on `store` as well as `get`, so a push mints
twice; skip the mint for `store` and `erase` if the probe shows the cost.

### A third sudoers rule

`agent ALL=(keyholder) NOPASSWD: /opt/orchestrator/mint`. sudo resets the
environment; the mint keeps none, as for runner. `users.test.ts` expects
three rules.

### The image's tools and their pins

Each pin with the tool that updates it (`rules.md` Safety); `pins()` already
checks each `FROM` for a digest and the note.

| Pin | Value at apply | What moves it |
|---|---|---|
| `FROM node:24.<x.y>-bookworm-slim@sha256:… AS node` | Node 24 LTS, current patch | by hand, nothing updates it |
| `FROM rhysd/actionlint:1.7.12@sha256:b193…` | `lint.yml`'s | by hand with `lint.yml`; a test fails while the two differ |
| `FROM zricethezav/gitleaks:v8.30.1@sha256:c00b…` | `lint.yml`'s | by hand with `lint.yml`; the same test |
| `ARG CLAUDE_VERSION`, `ARG CLAUDE_SHA256` | 2.1.316 on 02.11; latest re-read at apply, checksum from its `manifest.json` (linux-x64) | by hand, nothing updates it |

Node is the one binary, `COPY --from=node /usr/local/bin/node`; apt adds
`libstdc++6` for it, and `tmux`. The `node → bun` symlink line goes. Node 24,
not 22: the laptop runs 24, and 22's support ends in April 2027. `bunx` then
runs `#!/usr/bin/env node` packages under Node, as on the laptop and in CI.
`actionlint` and `gitleaks` are `COPY --from` each image's binary, and the
`shellcheck` the actionlint image ships with it, which CI's actionlint runs
over `run:` scripts and skips when absent (local review). One `RUN` after
the tools' copies, ahead of the `bun/` copy so it stays cached, prints
`node --version`, `actionlint -version`, `shellcheck --version`, `gitleaks
version` and `claude --version`, so a binary that cannot run fails the build.

### The commit identity: on the host only

The `runner` service gains `environment:` with `GIT_AUTHOR_NAME`,
`GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL`, each
`${NAME:?set it in orchestrator/.env}`. Compose reads `orchestrator/.env` for
interpolation; `.gitignore` gains `orchestrator/.env`. The README tells the
user how to build the values — the slug from the mint's `--slug`, the id from
`gh api users/<slug>[bot] --jq .id`, the email `<id>+<slug>[bot]@users.noreply.github.com`
— and no tracked file holds them. `leaks()` gains a GitHub bot noreply
address, which the placeholders above do not match.

Every `docker compose` command on the host then needs `orchestrator/.env`,
so the user writes it before pulling this change (*Migration Plan*).

### The session user's own files

The claude.ai login (`~/.claude/.credentials.json`, which `claude` writes
0600) and `~/.config/harness/notion-ask.json` (decision 42, written with
`umask 077`) live in agent's home, 0750, which runner cannot enter. The
reach check is unchanged: as agent it still fails to read every file under
`/run/secrets` and the App's key.

### The pass path

Unchanged in code. Its session runs as agent, so its `gh` now mints a token
as well: decision 6's isolation is lifted for it too, which is the fallback
the stage page accepts (step 4, *Что остаётся от изоляции*). Its environment
still holds no token, so *No token in the session* holds as written.

## Seams

- **host-deploy** (card `40239875c31b80e2bbc1ffad73e17db8`, branch
  `spec/host-deploy-v2`) lands after this change and names this slug in its
  `after:`; this change names nothing in `after:`. It owns
  `managed-settings.json` and its `COPY`, the fresh-session mark, the timer,
  the rollback and the failure file. This change hands it: `main` as agent on
  the default socket; `restart runner` and a recreate start `main` again
  through the entrypoint; pull and install before every start; no
  `--continue`, so `SessionStart` fires with `startup` and sets the mark.
- **Ponytail ultra** (card `3f639875c31b8142b793e3be4527a6a6`) adds
  `PONYTAIL_DEFAULT_MODE` to the same `environment:` block; whichever lands
  second appends to it.
- **Stage 6**: the events' forced command will `tmux send-keys -t main`.
- **pre-push-commit-gates, group 7**: Stryker in pre-push needs this Node.

## Risks / Trade-offs

- [2 vCPU and 3.5 GiB; Stryker and `bun test` not measured there] → the
  probe times one pre-push with Stryker.
- [The image grows by about 150 MB; the 20 GB disk also keeps the previous
  image for host-deploy's rollback] → `docker system df` on the probe.
- [A mint per call: a bun start and two API calls, about a second, not
  measured; GitHub's secondary limits on token creation not checked] → the
  probe times one mint; the `store` shortcut above.
- [sudo's `use_pty` from tmux could put `\r` in the token] → the probe; if
  seen, `Defaults!/opt/orchestrator/mint !use_pty`.
- [The two Go binaries assumed static] → the build's version line.
- [The release that first supports Remote Control, and the name flag's form,
  not checked] → `claude --help` at apply, the probe at stage step 7.
- [Whether `claude` with no login waits in the pane or exits] → the README
  logs in with `docker compose exec -it -u agent -e DISABLE_AUTOUPDATER=1
  runner claude auth login`; the loop's next start picks the login up either
  way.
- [A `claude` that exits at once, with no login or a refused Remote Control,
  makes the loop pull, and so mint, every 5 s, near GitHub's secondary limits
  on token creation] → the probe watches the pane; a backoff when it is seen
  (local review).

## Migration Plan

By the user on the host, after both pull requests merge: write
`orchestrator/.env` (README), `git pull`, `docker compose build runner`,
`docker compose up -d runner`, log in once, then stage step 6 makes the
clone. The probe card `40c39875c31b814e8902ef481aad54e2` checks the versions,
`tmux has-session -t main` as agent, a killed `claude` back within 5 s, the
session back after `restart runner` with Remote Control reconnected, a broken
pull not stopping the start, `gh pr list -R laidrivm/harness` and `git
ls-remote origin` as agent at once and after more than an hour, no `GH_TOKEN`
and no `~/.config/gh/hosts.yml` in the session, a mint's time, a push touching
`.github/workflows`, the commit author, and a pre-push with Stryker. Rollback:
`git checkout` the previous commit in `/root/harness` and rebuild.

## Settled on the card

- One change for both cards (user, 02.11, on merging the mint card).
- Answer 1 a (user, 02.11): a new conversation on every start.
- Decision 39 б: the six permissions above. Decision 40 б: a mint per call,
  through a gh wrapper and git's credential helper.
