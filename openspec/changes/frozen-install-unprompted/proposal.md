# frozen-install-unprompted

## Why

`Bash(bun install *)` and `Bash(bun i *)` sit in `permissions.ask`, and an
`ask` entry prompts over any `allow`, over auto mode and over a hook's
`allow`. Every agent in a new worktree therefore stops on its first install,
and on the VPS, reached through Remote Control, that prompt is a manual step
in the stage 2.5 metric. `bun install --frozen-lockfile` changes neither
`package.json` nor `bun.lock`, so it needs no prompt (card *Let a frozen bun
install run without a prompt*, 40e39875c31b81e8b989ef568b1f65a9).

## What Changes

- Every consumer's `package.json`, the harness's own among them, carries the
  script `"deps": "bun install --frozen-lockfile"`, and agents install with
  `bun run deps`. The `ask` rule matches the command text, not a script's
  body, so `bun run deps` does not prompt where `allow` holds it — the
  harness's tracked `Bash(bun run *)` does — or under auto mode.
- The `ask` entries stay exactly as today, so every literal `bun install` or
  `bun i`, frozen or not, still prompts. The command guard already reads a
  `bun run` script's text as a typed line and refuses a script from an
  uncommitted `package.json`; it gains one refusal, `bun run deps` with any
  word after it, which bun would forward to the install.
- Sync writes the script into a consumer's `package.json` as it writes the
  settings entries, and the harness check fails while it is missing or
  different. A consumer whose `deps` already says something else is refused
  by sync, naming the value, with nothing written.
- Before the harness is installed, the bootstrap also lets `bun run deps`
  through, and its hint and the stale-install notice name `bun run deps`.
- `README.md` names `bun run deps` for an agent's install, and says a
  consumer may add `Bash(bun run deps)` to its own `allow` for the default
  mode.

Not in this change: CI, the runner image and `orchestrator/runner/session.sh`,
which install outside any agent session; the board loop, run from the user's
shell; an agent rewriting the `deps` script and committing it, a manifest
edit out of scope by the user's answer 1 а.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: a new requirement, *A frozen install runs through the
  deps script*.
- `harness-updates`: a new requirement, *Sync writes the deps script*; *A
  session names an install that lags the pin* names `bun run deps`.
- `cloud-sessions`: *A cloud session installs the harness as it starts* — the
  bootstrap also lets `bun run deps` through.

## Impact

- Changed: `package.json` (the script), `bun/sync-settings.ts` (the
  `package.json` writer), `bun/settings.ts` (the constant and the check),
  `bun/command-guard-exec.ts` and `bun/command-guard.ts` (`deps-args`), a new
  `bun/command-guard-deps.test.ts`,
  `bun/bootstrap.ts` (`BOOTSTRAP`, `NOTICE`), `.claude/settings.json` (the two
  hook texts), `README.md`; tests `bun/sync-settings.test.ts`,
  `bun/settings.test.ts`, `bun/bootstrap.test.ts`,
  `bun/bootstrap-notice.test.ts`, `bun/command-guard-interpreters.test.ts`.
- Consumers: the bump that crosses this change syncs the script in with the
  settings; one with a different `deps` sees the sync refuse and renames its
  own script by hand.
