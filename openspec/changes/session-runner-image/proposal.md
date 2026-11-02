# session-runner-image

## Why

Stage 2.5 of the roadmap (page *Этап 2.5. Короткий путь на VPS*, steps 3
and 4) runs one persistent Claude Code session on the host, in the `runner`
container, which the user reaches through Remote Control. The image cannot
hold it today: it has no `tmux`, nothing starts or restarts the session,
`node` is a symlink to bun, so Stryker in the pre-push hook cannot run, and
`actionlint` and `gitleaks` are absent, so the hook skips them and their
findings show only in CI. The session also needs GitHub: an App installation
token lives an hour, so a token minted once leaves the push and `gh` refusing
an hour after the start (decision 40 б: mint per call, no background loop).

The `orchestrator` spec forbids each of these as it stands: no tracked file
may start Remote Control, only `runner` may ask the key holder for a token,
the session user may read no secret file, and sudoers holds two rules. The
explore of 2026-11-02 on card *Build the runner image for the persistent
session…*, with the card *Mint the session's GitHub App token per call…*
merged into it, chose one change for both, since both edit the Dockerfile,
sudoers and one requirement set, and the stage page plans one pull request.

## What Changes

- The image gains `tmux`, a real Node 24 LTS binary in place of the
  `node → bun` symlink, and the `actionlint` and `gitleaks` binaries from the
  images `lint.yml` pins, at the same digests. `CLAUDE_VERSION` moves to the
  current release with its checksum, and Claude Code's auto-updater is off.
- A start script, `orchestrator/runner/session.sh`: the entrypoint starts it
  as `agent` in a detached tmux session `main` before sshd. Its loop runs
  `git pull --ff-only` and `bun install --frozen-lockfile` in the session's
  clone, starts `claude --remote-control` whether they failed or not (on the
  old tree when the pull failed), pauses 5 s after `claude` exits, and
  repeats. Every start is a new conversation, never `--continue` (user,
  02.11, answer 1 a).
- `gh` on the image's `PATH` becomes a wrapper. For `agent`, with no
  `GH_TOKEN` set, it asks the key holder's mint for a token for
  `laidrivm/harness` with the permissions of decision 39 б and runs the real
  `gh` with it in that process's environment alone. A set `GH_TOKEN`, and any
  other user, run the real `gh` unchanged. git's credential helper in
  `/etc/gitconfig` names the wrapper.
- sudoers gains a third rule: `agent` may run the mint as the key holder.
- The commit identity, the App's bot, reaches the session through the
  `runner` service's `environment:` from an untracked `orchestrator/.env`; no
  tracked file holds the slug, the bot's id or its email.
- **Behaviour change** to `orchestrator`: the start script may start Remote
  Control; the session user may ask the key holder for a token; the session
  user's own login and Notion settings live in its home, while every mounted
  secret and the App's key stay out of its reach.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator`: the image runs the persistent session and its restart
  loop, and the session reaches GitHub as the App through a token minted per
  call.

## Impact

- `orchestrator/runner/Dockerfile`, `entrypoint.sh`, `sudoers`; new
  `orchestrator/runner/session.sh` and `orchestrator/runner/gh`;
  `orchestrator/layout.ts` (`remoteControl()`), `orchestrator/compose.yaml`,
  `.gitignore`, `orchestrator/README.md`; `bun/github-app-mint.ts` exports its
  fixed set for a test.
- Tests: `orchestrator/users.test.ts` (three rules), `orchestrator/layout.test.ts`,
  new `orchestrator/session.test.ts` and `orchestrator/gh-wrapper.test.ts`.
- Host, by the user: `orchestrator/.env` with the bot's identity, then
  `git pull`, `docker compose build runner`, `docker compose up -d runner`,
  and the session's one login. The live probe is card
  `40c39875c31b814e8902ef481aad54e2`.
- The pass path stays built and tested; its session can now mint a token as
  well, which is the fallback decision 6 accepted (design.md, *The pass path*).
- Seams: host-deploy (card `40239875c31b80e2bbc1ffad73e17db8`) lands after
  this change and owns the fresh-session mark, the managed settings and the
  deploy timer; the ponytail card (`3f639875c31b8142b793e3be4527a6a6`) adds
  to the same `environment:` block.
