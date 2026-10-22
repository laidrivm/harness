# runner-isolation

## Why

On the VPS a session runs as `agent` and sees no secret, but the runner, as
`runner`, executes what that session can rewrite: the harness copy in the
session's `node_modules`, the git config and hooks of the session's clone,
the session's tests through the pre-push hook, and a consumer's
`bunfig.toml` preload. All of it runs beside the App's private key, the
App's token, the user's PAT and the Notion bot's token, so a session that
holds no token can still reach every one. The App key cannot go on the host
until this is closed, and the host's GitHub identity, the CI flow and the
runner's questions all wait on it (card *Keep the runner from running code a
session can write while the App key or a token is in reach*, recon of
2026-10-20).

## What Changes

- The runner runs harness code only from a checkout of its own, at the
  commit the repository's `main` pins. It never runs the copy in a session's
  `node_modules`, and the goal check's judge comes from that checkout too.
- The runner runs no git and no bun in a session's clone. Every command there
  runs as `agent` through one launcher, so the clone's config, hooks and
  preload run with no secret in reach. The launcher also starts `claude`,
  which closes the gap that the code starting a session as `agent` belonged
  to no change.
- Every push the runner makes, the board loop's and the CI flow's fix push
  alike, comes from a push clone of its own. It takes the session's
  commits as a `git bundle` that `agent` writes, and pushes a commit only
  when the goal check finds a passing pre-PR record for its SHA. That push
  runs no pre-push hook; CI is the hard check. **BREAKING** for the rule in
  `core/git-and-prs.md`: it gains one exception, for this push clone alone
  (user, 2026-10-21, decision 1a).
- The user's PAT reaches only the push step and the pull-request reads, and
  none of them when the App is configured (decision 2a, widened to the reads
  on 2026-10-22 for a private repository).
- A third user, the key holder, alone reads the App's private key. The runner
  asks it for a token for one repository, valid for an hour, with
  permissions from a fixed set. The user first chose to leave this to a later
  card and then, answering the Remote Control follow-up, asked for it now
  ("Это делаем сразу"); the later answer stands.
- Remote Control's login and server run as `runner`. A session started from
  the phone therefore sees the PAT, the Notion bot's token and the hourly App
  tokens, but never the App key. The user accepted that trade-off for the
  convenience of a phone session with everything at hand.
- A test proves `agent` cannot read any secret file, and that `runner` cannot
  read the App key.
- `pass.sh` passes the App's id and the key holder's mint command to the pass,
  which its `env -i` drops today, and no GitHub token.
- `credentials()` appends its git header after any `GIT_CONFIG_*` entries the
  runner was started with, instead of replacing them (its `shortcut:`).

## Non-goals

- Who may write the gate ledger. A session can still append a pre-PR record
  to the ledger the push trusts; the card *Let only the runner write the gate
  ledger a session's tests are judged by* closes that, and CI still fails an
  untested push meanwhile.
- The laptop. There the runner and the session are one user by accepted
  limit, and no App key is present. Nothing changes for it.
- The engine. n8n or Windmill starts `pass.sh` either way.

## User acts

1. Create the key holder's App key file on the host, owned by that user, mode
   0400. The key is generated on the host, never on the laptop.
2. Run `claude auth login` and the first `claude remote-control` as `runner`
   (vps-board-loop task 3.6).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator`: the runner's own harness checkout and push clone, the
  launcher for `agent`, the key holder, the PAT's reach, Remote Control's
  user, and the secret files' reach. The capability is introduced by
  `vps-board-loop`, which this change follows.

## Impact

- `orchestrator/pass.sh`, the runner image and entrypoint, the sudo rules,
  `orchestrator/README.md`.
- `bun/board-loop.ts`, `bun/board-loop-session.ts`, `bun/board-loop-push.ts`,
  `bun/github-app.ts`.
- `core/git-and-prs.md` (the hook rule's exception).
- `bun/ci-run.ts` and `ci-run-agent`'s text: its fetch, session and fix push
  go through the same launcher, bundles and push clone, and its fix prompt
  asks for the pre-PR check (task 3.1).
